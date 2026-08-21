import { useEffect, useState } from 'react';
import { api } from './api';

const POLL_MS = 20_000;

// How many pending/active SOS alerts from people who trust this user as a
// contact are still unaddressed — same filter Dashboard.jsx uses for its
// own banner. Shared here so the bottom nav / sidebar can show a badge on
// the Alerts tab without each duplicating the poll.
export function useIncomingAlertsCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.getIncomingAlerts()
        .then((alerts) => {
          if (cancelled) return;
          setCount(alerts.filter((a) => a.status === 'pending' || a.status === 'active').length);
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return count;
}
