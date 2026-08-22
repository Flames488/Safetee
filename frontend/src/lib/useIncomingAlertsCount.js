import { useEffect, useState } from 'react';
import { api } from './api';
import { isSeen } from './seenAlerts';

const POLL_MS = 20_000;

// How many pending/active SOS alerts from people who trust this user as a
// contact are still both unaddressed AND not yet looked at (see
// seenAlerts.js for why "seen" is tracked separately from the backend's
// "acknowledge" action). Shared here so the bottom nav / sidebar can show
// a badge on the Alerts tab without each duplicating the poll.
export function useIncomingAlertsCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.getIncomingAlerts()
        .then((alerts) => {
          if (cancelled) return;
          setCount(alerts.filter((a) => (a.status === 'pending' || a.status === 'active') && !isSeen(a.id)).length);
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return count;
}
