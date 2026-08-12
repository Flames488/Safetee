// "A" / "A and B" / "A, B and C" — not "A and B and C" for 3+.
export function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Inverse of timeAgo — counts down to a future timestamp instead of up
// from a past one. Used by the two location-share screens (owner and
// viewer) to show the same "how much longer" figure.
export function timeLeft(dateStr) {
  const ms = new Date(dateStr) - Date.now();
  if (ms <= 0) return 'Ending…';
  const mins = Math.floor(ms / 60_000);
  if (mins > 0) return `${mins}m left`;
  return `${Math.floor(ms / 1000)}s left`;
}

export function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
