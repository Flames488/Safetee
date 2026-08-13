const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';
const MAX_RECONNECT_DELAY_MS = 15_000;

// Shared low-level connector behind both locationSharing.js and
// journeyTracking.js — auth is a query param, not a header (browsers
// can't set custom headers on a WebSocket handshake).
//
// Reconnects with backoff on any non-terminal close. This matters a lot
// more than it looks: safetee-api is on Render's free tier and sleeps
// after ~15min idle — the very first handshake attempt after a cold
// start plausibly fails or times out well before the API finishes waking
// up, and with no retry, these features silently produced nothing.
// `onStatus` reports 'connecting' | 'connected' | 'reconnecting' | 'ended'
// so the UI can show real state instead of quietly showing nothing.
export function connectLiveSocket(path, token, { onFrame, onStatus } = {}) {
  let socket = null;
  let stopped = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;

  const connect = () => {
    if (stopped) return;
    onStatus?.('connecting');
    const url = `${WS_URL}${path}?token=${encodeURIComponent(token || '')}`;
    socket = new WebSocket(url);

    socket.onopen = () => {
      reconnectAttempt = 0;
      onStatus?.('connected');
    };
    socket.onmessage = (event) => {
      try {
        onFrame?.(JSON.parse(event.data));
      } catch {
        // not JSON — ignore rather than tear down the connection over it
      }
    };
    socket.onclose = (event) => {
      if (stopped) return;
      // 4401 (auth rejected) and 4408 (time window ended) are terminal:
      // the backend is telling us this session is genuinely done, not
      // that the network hiccuped. Anything else — including a cold API
      // dropping the handshake — is worth retrying.
      if (event.code === 4401 || event.code === 4408) {
        onStatus?.('ended');
        return;
      }
      onStatus?.('reconnecting');
      const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };
    // onerror carries no useful info of its own — onclose always follows
    // it for a WebSocket and is where reconnect scheduling happens.
    socket.onerror = () => {};
  };

  connect();

  return {
    // Only meaningful for whichever side may publish (an owner) — the
    // backend silently drops frames from a read-only viewer connection,
    // so a viewer calling this is harmless, just a no-op past the wire.
    publish: (frame) => {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
    },
    close: () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}
