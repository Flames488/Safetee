import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation2, Check, UserPlus, MapPin } from 'lucide-react';
import TopBar from '../components/TopBar';
import { Card, Button } from '../components/ui';
import { api } from '../lib/api';
import { searchPlaces } from '../lib/geocode';
import './journey.css';

const DURATIONS = [15, 30, 45, 60];

export default function JourneySetup() {
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const searchTimer = useRef(null);
  const searchRequestId = useRef(0);
  const [duration, setDuration] = useState(30);
  const [contacts, setContacts] = useState(null); // null = loading
  const [notify, setNotify] = useState([]); // real contact ids
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.listContacts()
      .then((list) => {
        setContacts(list);
        // Default to notifying everyone the person has already marked as a
        // trusted contact — they came here to add a route, not to redo
        // who's trusted, and it's easy to uncheck someone below.
        setNotify(list.map((c) => c.id));
      })
      .catch(() => setContacts([]));
  }, []);

  const toggleContact = (id) =>
    setNotify((n) => (n.includes(id) ? n.filter((x) => x !== id) : [...n, id]));

  // Debounced — Photon is free but not meant for a request per keystroke.
  // Typing further after picking a suggestion clears its coordinates
  // rather than silently keeping them attached to now-different text.
  //
  // requestId guards against an earlier, slower-to-respond search landing
  // after a later, faster one and clobbering its fresher results — the
  // debounce alone only delays when a search *starts*, it doesn't cancel
  // or sequence in-flight fetches, so this was otherwise possible on
  // typing across two debounce windows in quick succession.
  const handleDestinationChange = (value) => {
    setDestination(value);
    setDestinationCoords(null);
    clearTimeout(searchTimer.current);
    const requestId = ++searchRequestId.current;
    searchTimer.current = setTimeout(async () => {
      const results = await searchPlaces(value);
      if (requestId === searchRequestId.current) setSuggestions(results);
    }, 350);
  };

  const pickSuggestion = (s) => {
    setDestination(s.label);
    setDestinationCoords({ lat: s.lat, lng: s.lng });
    setSuggestions([]);
  };

  const handleStart = async () => {
    setStarting(true);
    setStartError('');
    try {
      const journey = await api.startJourney({
        destination_label: destination,
        destination_lat: destinationCoords?.lat ?? null,
        destination_lng: destinationCoords?.lng ?? null,
        expected_minutes: duration,
        notify_contact_ids: notify,
      });
      const notifyContacts = contacts.filter((c) => notify.includes(c.id));
      navigate(`/app/tracking/${journey.id}`, { state: { journey, notifyContacts } });
    } catch (err) {
      setStartError(err.message || 'Could not start this journey. Please try again.');
      setStarting(false);
    }
  };

  const noContacts = contacts !== null && contacts.length === 0;

  return (
    <>
      <TopBar title="Journey setup" subtitle="We'll check in automatically until you arrive" />
      <div className="jr-body">
        <Card className="jr-route">
          <div className="jr-route-row">
            <span className="jr-dot jr-dot-a" />
            <span>Current location</span>
          </div>
          <div className="jr-route-line" />
          <div className="jr-route-row jr-route-row-dest">
            <span className="jr-dot jr-dot-b" />
            <input
              placeholder="Where are you headed?" value={destination}
              onChange={(e) => handleDestinationChange(e.target.value)}
              autoComplete="off"
            />
            {suggestions.length > 0 && (
              <div className="jr-suggestions">
                {suggestions.map((s) => (
                  <button key={`${s.lat},${s.lng}`} type="button" className="jr-suggestion" onClick={() => pickSuggestion(s)}>
                    <MapPin size={14} strokeWidth={2.2} />
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        <span className="section-label jr-label">Expected travel time</span>
        <div className="jr-duration-row">
          {DURATIONS.map((d) => (
            <button key={d} className={`jr-chip ${duration === d ? 'jr-chip-on' : ''}`} onClick={() => setDuration(d)}>
              {d} min
            </button>
          ))}
        </div>

        <span className="section-label jr-label">Notify while I'm en route</span>
        {contacts === null && <p className="jr-contacts-note">Loading your trusted contacts…</p>}
        {noContacts && (
          <Card className="jr-info">
            <UserPlus size={16} strokeWidth={2.2} color="var(--blue)" />
            <p>
              You don't have any trusted contacts yet, so no one will be notified on this journey.{' '}
              <button className="jr-inline-link" onClick={() => navigate('/app/contacts')}>Add one first</button>
            </p>
          </Card>
        )}
        {contacts !== null && contacts.length > 0 && (
          <div className="jr-contact-list">
            {contacts.map((c) => {
              const on = notify.includes(c.id);
              return (
                <button key={c.id} className={`jr-contact ${on ? 'jr-contact-on' : ''}`} onClick={() => toggleContact(c.id)}>
                  <span>{c.name}{c.relationship_label ? ` · ${c.relationship_label}` : ''}</span>
                  {on && <Check size={15} strokeWidth={2.6} />}
                </button>
              );
            })}
          </div>
        )}

        <Card className="jr-info">
          <Navigation2 size={16} strokeWidth={2.2} color="var(--blue)" />
          <p>If you don't confirm you've arrived within {duration + 10} minutes, Safetee automatically alerts {notify.length || 0} contact{notify.length === 1 ? '' : 's'} with your last known location.</p>
        </Card>

        {startError && <p className="jr-error" role="alert">{startError}</p>}

        <Button full size="lg" disabled={!destination || starting} onClick={handleStart}>
          {starting ? 'Starting…' : 'Start journey'}
        </Button>
      </div>
    </>
  );
}
