import { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './install-prompt.css';

// Without this, a fix shipped to production never reaches anyone who
// already has the app open (or installed as a PWA) until they happen to
// fully close and reopen it — the service worker updates itself in the
// background, but the already-running page keeps executing the old JS
// it loaded at open time. This surfaced for real: several real bugs got
// fixed and deployed, but the reporter kept testing against a stale
// cached build and seeing the same failure. Explicit prompt instead of
// silently forcing a reload, since that could interrupt something like
// an active SOS or mid-form entry.
export default function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

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
