import { connectLiveSocket } from './liveSocket';

// Unlike location sharing, a journey's viewer might have no Safetee
// account at all (a trusted contact holding an SMS share link) — pass
// their share_token explicitly (from the link's ?token= param). Omit it
// for the journey's own owner, who authenticates with their normal
// logged-in access token instead.
export function connectJourneyTracking(journeyId, { token, onFrame, onStatus } = {}) {
  const authToken = token || localStorage.getItem('safetee_access_token');
  return connectLiveSocket(`/journeys/${journeyId}`, authToken, { onFrame, onStatus });
}
