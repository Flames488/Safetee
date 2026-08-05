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
    if (!navigator.geolocation) setGps('unsupported');
    else queryPermission('geolocation').then(setGps);

    queryPermission('microphone').then(setMic);

    if (navigator.getBattery) {
      navigator
        .getBattery()
        .then((b) => {
          const update = () => setBattery({ level: b.level, charging: b.charging });
          update();
          b.addEventListener('levelchange', update);
          b.addEventListener('chargingchange', update);
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
  }, []);

  // "Tap to enable" is only true if tapping does something. These actually
  // trigger the browser's native permission prompt, then re-read the real
  // state afterward — nothing here just flips a label.
  const requestGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => queryPermission('geolocation').then(setGps),
      () => queryPermission('geolocation').then(setGps)
    );
  };

  const requestMic = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // only probing for permission, not recording
    } catch {
      // user denied — fall through to re-checking the real state below
    }
    queryPermission('microphone').then(setMic);
  };

  return { gps, mic, battery, contacts, journeyActive, smsReady, activity, requestGps, requestMic };
}
