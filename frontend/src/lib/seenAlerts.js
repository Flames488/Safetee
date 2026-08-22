const STORAGE_KEY = 'safetee_seen_alert_ids';

// Separate from the backend's "acknowledge" action (a deliberate, logged
// safety response) — this is just "have I looked at the Alerts page since
// this came in," the same distinction a phone's own inbox makes between
// unread and actually replied-to. Local-only and per-device on purpose:
// dismissing the badge on one device shouldn't hide a live emergency from
// the same contact on another.
function readSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function isSeen(id) {
  return readSeen().has(id);
}

export function markSeen(ids) {
  const seen = readSeen();
  ids.forEach((id) => seen.add(id));
  // Unbounded growth isn't realistic here — a personal safety app's
  // lifetime alert count from any one set of contacts is small, and this
  // only ever stores UUIDs (a few KB even after years of use).
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
}
