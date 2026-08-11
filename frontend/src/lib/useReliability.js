import { useEffect, useState } from 'react';
import { api } from './api';

// Real Permissions API state only — never guesses. Browsers that don't
// support querying a given permission (or don't support the Permissions API
// at all) report 'unsupported' rather than a fabricated 'granted'/'denied'.
export async function queryPermission(name) {
  if (!navigator.permissions?.query) return 'unsupported';
  try {
    const status = await navigator.permissions.query({ name });
    return status.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unsupported';
  }
}

// Every value here reflects something actually checked on this device or
// fetched from the API — nothing is a placeholder. Fields stay `null`
// (rendered as "Checking…") until the real check resolves.
export function useReliability() {
  const [gps, setGps] = useState('checking');
  const [mic, setMic] = useState('checking');
  const [battery, setBattery] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [journeyActive, setJourneyActive] = useState(null);
  const [smsReady, setSmsReady] = useState(null);
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    // getBattery() is async and the BatteryManager it resolves is a
    // long-lived singleton — without tearing these listeners down on
    // unmount, every remount (nav away and back, tab restore) adds two
    // more permanent listeners tied to that render's stale setBattery
    // closure, leaking indefinitely for the life of the tab.
    let cancelled = false;
    let batteryManager = null;
    let updateBattery = null;

    if (!navigator.geolocation) setGps('unsupported');
    else queryPermission('geolocation').then(setGps);

    queryPermission('microphone').then(setMic);

    if (navigator.getBattery) {
      navigator
        .getBattery()
        .then((b) => {
          if (cancelled) return;
          batteryManager = b;
          updateBattery = () => setBattery({ level: b.level, charging: b.charging });
          updateBattery();
          b.addEventListener('levelchange', updateBattery);
          b.addEventListener('chargingchange', updateBattery);
        })
        .catch(() => setBattery('unsupported'));
    } else {
      setBattery('unsupported');
    }

    api.listContacts()
      .then((list) => setContacts(list))
      .catch(() => setContacts([]));

    Promise.all([api.journeyHistory().catch(() => []), api.sosHistory().catch(() => [])]).then(
      ([journeys, sos]) => {
        setJourneyActive(journeys.some((j) => j.status === 'active'));
        const merged = [
          ...journeys.map((j) => ({ kind: 'journey', ...j })),
          ...sos.map((s) => ({ kind: 'sos', ...s })),
        ]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 3);
        setActivity(merged);
      }
    );

    api.systemStatus()
      .then((s) => setSmsReady(Boolean(s.sms_primary_configured || s.sms_fallback_configured)))
      .catch(() => setSmsReady(false));

    return () => {
      cancelled = true;
      if (batteryManager && updateBattery) {
        batteryManager.removeEventListener('levelchange', updateBattery);
        batteryManager.removeEventListener('chargingchange', updateBattery);
      }
    };
  }, []);

  // "Tap to enable" is only true if tapping does something. These trigger
  // the browser's native permission prompt, then trust the *actual outcome*
  // of that call directly rather than re-querying the Permissions API
  // afterward — iOS Safari's navigator.permissions.query({name:'geolocation'})
  // is known to report stale state (often stuck on 'prompt' forever even
  // after the user grants access), which made this tile look broken on
  // iPhone even though the real permission prompt and location fetch both
  // worked. A successful/denied callback is ground truth; a query result
  // isn't.
  const requestGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => setGps('granted'),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) setGps('denied');
        // POSITION_UNAVAILABLE / TIMEOUT are transient — leave state alone
        // so the tile stays tappable to retry instead of declaring defeat.
      }
    );
  };

  const requestMic = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // only probing for permission, not recording
      setMic('granted');
    } catch (err) {
      if (err.name === 'NotAllowedError') setMic('denied');
      // other errors (no device, device busy) are transient — leave state
      // alone so the tile stays tappable to retry.
    }
  };

  return { gps, mic, battery, contacts, journeyActive, smsReady, activity, requestGps, requestMic };
}
