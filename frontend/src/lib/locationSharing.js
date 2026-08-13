import { connectLiveSocket } from './liveSocket';

// Both sides of a LocationShare are always real, authenticated accounts
// (that's the whole premise of the feature), so this always uses the
// logged-in user's own access token — no share-link/no-account-viewer
// case to handle here (see journeyTracking.js for that).
export function connectLocationShare(shareId, { onFrame, onStatus } = {}) {
  const token = localStorage.getItem('safetee_access_token');
  return connectLiveSocket(`/locations/${shareId}`, token, { onFrame, onStatus });
}
