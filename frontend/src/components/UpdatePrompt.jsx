import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './install-prompt.css';

// How often to actively ask the browser "is there a newer service worker
// yet?" while this tab stays open. useRegisterSW only checks once, at
// initial registration — for a PWA someone keeps open (or resumes from
// the app switcher without a real navigation/reload), that one check can
// go stale for hours, so a shipped fix silently never reaches them. This
// surfaced for real more than once. Polling registration.update() closes
// that gap without needing the user to ever fully quit the app.
const UPDATE_CHECK_MS = 60_000;

// Without any of this, a fix shipped to production never reaches anyone
// who already has the app open (or installed as a PWA) until they happen
// to fully close and reopen it — the service worker updates itself in
// the background, but the already-running page keeps executing the old
// JS it loaded at open time. Explicit prompt instead of silently forcing
// a reload, since that could interrupt something like an active SOS or
// mid-form entry.
export default function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(url, registration) {
      if (!registration) return;
      setInterval(() => registration.update(), UPDATE_CHECK_MS);
    },
  });

  // Also check the instant the tab comes back to the foreground —
  // exactly the "resumed from the app switcher" case that would
  // otherwise wait for the next 60s tick.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.serviceWorker?.getRegistration().then((reg) => reg?.update());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (!needRefresh || dismissed) return null;

  return (
    <div className="install-prompt" role="dialog" aria-label="Update available">
      <span className="install-prompt-icon"><RefreshCw size={16} strokeWidth={2.2} /></span>
      <span className="install-prompt-text">
        <strong>Update available</strong>
        <span>A newer version of Safetee is ready — refresh to get the latest fixes.</span>
      </span>
      <button className="install-prompt-cta" onClick={() => updateServiceWorker(true)}>Refresh</button>
      <button className="install-prompt-dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <X size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}
