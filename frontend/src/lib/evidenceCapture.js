import { api, ApiError } from './api';

// Segment length: independent, self-contained files rather than one
// continuous recording, so a chunk that already made it to storage
// survives even if the device is destroyed mid-alert (see the model
// comment on SOSEvent.audio_segment_paths). Matches the ~20s/60s
// intervals the backend's evidence_max_* caps are sized around.
const SEGMENT_MS = { audio: 20000, video: 20000 };
const PHOTO_INTERVAL_MS = 60000;

// fetch has no built-in timeout. A video segment's PUT is much larger than
// audio/photo and, on the slow/flaky connection an SOS is disproportionately
// likely to be triggered on, can hang indefinitely rather than failing —
// which left the status stuck on "Recording" forever with no upload ever
// completing, failing, or retrying (audio/photo are small enough to
// usually resolve one way or the other before this would ever matter).
// Aborting after this turns a silent hang into a normal failure the
// existing backoff/retry path in pump() already handles.
const UPLOAD_TIMEOUT_MS = 30000;

// A network outage can last the entire remainder of an SOS event (this is
// exactly when signal is likely to be bad). Without backoff, capture would
// keep encoding and attempting to upload a fresh segment every 20s/60s for
// hours, burning battery/CPU on attempts that can't succeed. Doubles the
// interval per consecutive failure, capped at 6x base (2min for a 20s
// segment, 6min for photos) — still retrying, just not hammering.
const MAX_BACKOFF_MULTIPLIER = 6;
function backoffDelay(baseMs, consecutiveFailures) {
  return baseMs * Math.min(2 ** consecutiveFailures, MAX_BACKOFF_MULTIPLIER);
}

const MIME_CANDIDATES = {
  audio: [
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/webm', 'webm'],
    ['audio/mp4', 'm4a'], // Safari path
  ],
  video: [
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm'],
    ['video/mp4', 'mp4'], // Safari path
  ],
};

function pickMime(kind) {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const [mime, ext] of MIME_CANDIDATES[kind]) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

async function uploadSegment(eventId, mediaType, blob, ext) {
  const { upload_url: uploadUrl, path } = await api.createEvidenceUploadUrl(eventId, {
    media_type: mediaType,
    file_extension: ext,
  });
  // Straight to Supabase, not through our backend — the signed URL already
  // is a one-time write token, and proxying multi-MB blobs through the
  // free-tier API would burn its bandwidth for nothing.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(uploadUrl, { method: 'PUT', body: blob, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`upload failed (${res.status})`);
  await api.confirmEvidence(eventId, { media_type: mediaType, path });
}

// Recording continuously and slicing via MediaRecorder's `timeslice` looks
// tempting, but only the first slice of a session is a standalone
// decodable file — later ones are raw continuation fragments missing the
// container header, so a lone slice won't play back by itself. Instead we
// start/stop a fresh MediaRecorder every SEGMENT_MS: more overhead, but
// every segment that reaches storage is independently playable evidence.
function startSegmentedRecorder(stream, mediaType, mime, onSegment, onError, getDelay) {
  let stopped = false;
  let recorder = null;
  let restartTimer = null;

  const recordOne = () => {
    if (stopped) return;
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      if (chunks.length > 0) onSegment(new Blob(chunks, { type: mime }));
      if (!stopped) recordOne();
    };
    recorder.onerror = (e) => onError(e.error || e);
    recorder.start();
    restartTimer = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, getDelay());
  };
  recordOne();

  return () => {
    stopped = true;
    clearTimeout(restartTimer);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };
}

function startPhotoCapture(stream, onSegment, onError, getDelay) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  const canvas = document.createElement('canvas');
  let stopped = false;
  let timer = null;

  // Self-rescheduling rather than setInterval so getDelay() (backoff) can
  // actually change the cadence between shots instead of being fixed at
  // whatever it was when the interval was created.
  const capture = () => {
    if (stopped) return;
    if (video.readyState >= 2) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob((blob) => { if (blob) onSegment(blob); }, 'image/jpeg', 0.8);
    }
    timer = setTimeout(capture, getDelay());
  };

  video.play().catch(onError);
  timer = setTimeout(capture, 1500); // one early photo, not a full base-interval of nothing

  return () => {
    stopped = true;
    clearTimeout(timer);
    video.pause();
    video.srcObject = null;
  };
}

// Drives audio/video/photo capture for one active SOS event. Every media
// type degrades independently — a denied camera still leaves audio (and
// vice versa) recording, since partial evidence beats none in an actual
// emergency. `enabled` ({audio, video, photo}) is the user's own Privacy
// & data controls preference — a type that's off there is never so much
// as requested here (no permission prompt, no onStatus call at all for
// it), same as the backend's independent 403 if it's called anyway.
// `onStatus(mediaType, status)` reports one of
// 'pending' | 'capturing' | 'capped' | 'error' | 'unavailable' per
// (enabled) type so the UI reflects what's really happening instead of a
// fabricated "delivered". Returns a stop function; resolves once
// permissions have been requested (not once recording has actually
// started — callers should call onStatus for immediate UI feedback rather
// than await this for anything but "is the mic/camera prompt done").
export async function startEvidenceCapture(eventId, enabled, onStatus) {
  const wantAudio = Boolean(enabled?.audio);
  const wantVideo = Boolean(enabled?.video);
  const wantPhoto = Boolean(enabled?.photo);
  const wantCamera = wantVideo || wantPhoto;

  if (!wantAudio && !wantCamera) return () => {}; // everything turned off in Settings — don't touch permissions at all

  const reportUnavailable = () => {
    if (wantAudio) onStatus('audio', 'unavailable');
    if (wantVideo) onStatus('video', 'unavailable');
    if (wantPhoto) onStatus('photo', 'unavailable');
  };

  if (wantAudio) onStatus('audio', 'pending');
  if (wantVideo) onStatus('video', 'pending');
  if (wantPhoto) onStatus('photo', 'pending');

  const teardowns = [];
  let fullStream;
  try {
    fullStream = await navigator.mediaDevices.getUserMedia({ audio: wantAudio, video: wantCamera });
  } catch {
    if (wantAudio && wantCamera) {
      try {
        fullStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (wantVideo) onStatus('video', 'unavailable');
        if (wantPhoto) onStatus('photo', 'unavailable');
      } catch {
        reportUnavailable();
        return () => {};
      }
    } else {
      reportUnavailable();
      return () => {};
    }
  }

  const capsHit = new Set(); // media types the backend has already 409'd on — stop bothering it
  const failureCounts = { audio: 0, video: 0, photo: 0 }; // consecutive failures — drives backoffDelay()

  const reportError = (mediaType) => {
    failureCounts[mediaType] = Math.min(failureCounts[mediaType] + 1, 10); // cap the counter itself; backoffDelay already caps the resulting delay
    onStatus(mediaType, 'error');
  };
  const reportSuccess = (mediaType) => {
    failureCounts[mediaType] = 0;
    onStatus(mediaType, 'capturing');
  };

  const pump = (mediaType, ext) => (blob) => {
    if (capsHit.has(mediaType)) return;
    uploadSegment(eventId, mediaType, blob, ext)
      .then(() => reportSuccess(mediaType))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 409) {
          capsHit.add(mediaType);
          onStatus(mediaType, 'capped');
        } else {
          reportError(mediaType);
        }
      });
  };

  const audioTracks = wantAudio ? fullStream.getAudioTracks() : [];
  const videoTracks = wantCamera ? fullStream.getVideoTracks() : [];

  if (wantAudio) {
    if (audioTracks.length > 0) {
      const picked = pickMime('audio');
      if (picked) {
        onStatus('audio', 'capturing');
        teardowns.push(
          startSegmentedRecorder(
            new MediaStream(audioTracks),
            'audio',
            picked.mime,
            pump('audio', picked.ext),
            () => reportError('audio'),
            () => backoffDelay(SEGMENT_MS.audio, failureCounts.audio)
          )
        );
      } else {
        onStatus('audio', 'unavailable');
      }
    } else {
      onStatus('audio', 'unavailable');
    }
  }

  if (wantCamera) {
    if (videoTracks.length > 0) {
      const videoOnlyStream = new MediaStream(videoTracks);
      if (wantVideo) {
        const pickedVideo = pickMime('video');
        if (pickedVideo) {
          onStatus('video', 'capturing');
          teardowns.push(
            startSegmentedRecorder(
              videoOnlyStream,
              'video',
              pickedVideo.mime,
              pump('video', pickedVideo.ext),
              () => reportError('video'),
              () => backoffDelay(SEGMENT_MS.video, failureCounts.video)
            )
          );
        } else {
          onStatus('video', 'unavailable');
        }
      }
      if (wantPhoto) {
        onStatus('photo', 'capturing');
        teardowns.push(
          startPhotoCapture(
            videoOnlyStream,
            pump('photo', 'jpg'),
            () => reportError('photo'),
            () => backoffDelay(PHOTO_INTERVAL_MS, failureCounts.photo)
          )
        );
      }
    } else {
      if (wantVideo) onStatus('video', 'unavailable');
      if (wantPhoto) onStatus('photo', 'unavailable');
    }
  }

  return () => {
    teardowns.forEach((stop) => stop());
    fullStream.getTracks().forEach((t) => t.stop());
  };
}
