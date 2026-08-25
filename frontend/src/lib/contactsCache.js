const KEY = 'safetee_contacts_cache';

// A trusted-contacts snapshot from the last time the app actually had a
// connection — the one thing SOSActive can still read with zero network,
// so the manual SMS fallback has someone to text even when the live
// api.listContacts() call in the same screen fails.
export function cacheContacts(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full/unavailable (private mode) — the cache is a nice-to-have,
    // never worth failing the caller over.
  }
}

export function getCachedContacts() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
