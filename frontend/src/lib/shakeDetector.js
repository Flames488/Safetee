// Secret gesture trigger: shake the phone to silently fire an SOS. This is
// the one hidden trigger that's genuinely achievable in a PWA — unlike a
// hardware power-button press (no web API on any platform ever exposes
// that to a page) this reads the accelerometer via DeviceMotionEvent,
// which both iOS Safari and Android Chrome support. Real limitation, and
// the reason this only runs while the app is open in the foreground: there
// is no background execution for a PWA, so it can't fire from a locked
// screen or another app the way marketing copy elsewhere used to imply.

const SHAKE_DELTA_THRESHOLD = 18; // m/s^2 — comfortably above normal handling jostle
const SHAKES_NEEDED = 3;
const SHAKE_WINDOW_MS = 1200;

// iOS 13+ gates DeviceMotionEvent behind an explicit permission prompt that
// must be requested from inside a real user gesture (a click handler);
// Android Chrome has no such gate and this is simply unavailable/no-op.
export function motionPermissionNeeded() {
  return typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
}

export async function requestMotionPermission() {
  if (!motionPermissionNeeded()) return true;
  try {
    return (await DeviceMotionEvent.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export function startShakeDetection(onShake) {
  if (typeof DeviceMotionEvent === 'undefined') return () => {};

  let last = null;
  let hits = [];

  const handleMotion = (event) => {
    const acc = event.accelerationIncludingGravity;
    if (!acc || acc.x == null || acc.y == null || acc.z == null) return;

    if (last) {
      const delta = Math.abs(acc.x - last.x) + Math.abs(acc.y - last.y) + Math.abs(acc.z - last.z);
      if (delta > SHAKE_DELTA_THRESHOLD) {
        const now = Date.now();
        hits = [...hits.filter((t) => now - t < SHAKE_WINDOW_MS), now];
        if (hits.length >= SHAKES_NEEDED) {
          hits = [];
          onShake();
        }
      }
    }
    last = acc;
  };

  window.addEventListener('devicemotion', handleMotion);
  return () => window.removeEventListener('devicemotion', handleMotion);
}
