const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';

// Auth is a query param, not a header — browsers can't set custom headers
// on a WebSocket handshake, same constraint the existing journey-tracking
// websocket already works around this way (see backend/app/websockets).
export function connectLocationShare(shareId, { onFrame, onClose, onError } = {}) {
  const token = localStorage.getItem('safetee_access_token');
  const url = `${WS_URL}/locations/${shareId}?token=${encodeURIComponent(token || '')}`;
  const socket = new WebSocket(url);

  socket.onmessage = (event) => {
    try {
      onFrame?.(JSON.parse(event.data));
    } catch {
      // not JSON — ignore rather than tear down the connection over it
    }
  };
  socket.onclose = (event) => onClose?.(event.code);
  socket.onerror = (event) => onError?.(event);

  return {
    // Only meaningful for the share's owner — the backend silently drops
    // frames from a viewer connection (read-only), so a viewer calling
    // this is harmless, just a no-op past the wire.
    publish: (frame) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
    },
    close: () => socket.close(),
  };
}
