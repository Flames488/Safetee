import { useEffect, useRef } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
let scriptPromise = null;

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.turnstile);
      script.onerror = reject;
      document.head.appendChild(script);
    }).catch((err) => {
      // Without this, a single failed load (CDN hiccup, offline for a
      // moment) permanently poisons this module-level cache — every
      // future mount of every Turnstile instance on signup, login,
      // forgot-password, and recover would keep returning the same dead,
      // already-rejected promise for the rest of the page session, with
      // the widget silently never rendering again. Clearing it lets the
      // next mount (e.g. navigating back to this page) actually retry.
      scriptPromise = null;
      throw err;
    });
  }
  return scriptPromise;
}

// Renders nothing when VITE_TURNSTILE_SITE_KEY isn't set — local dev
// without a Cloudflare site configured. onToken is then never called, so
// callers must treat "no token" as fine in that case (the backend does
// the same fail-open check — see verify_turnstile).
const MAX_AUTO_RETRIES = 3;

export default function Turnstile({ onToken }) {
  const containerRef = useRef(null);
  const widgetId = useRef(null);
  const retriesLeft = useRef(MAX_AUTO_RETRIES);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    loadTurnstileScript().then((turnstile) => {
      if (cancelled || !containerRef.current) return;
      // Without resetting here, any transient hiccup loading the challenge
      // (common on mobile networks) leaves the widget permanently stuck
      // showing Cloudflare's own "Verification failed" state — nothing
      // about tapping the form's submit button again gives it another
      // try, since the widget itself never retries on its own. Turnstile's
      // own docs recommend reset() from error-callback for exactly this.
      // Bounded rather than unconditional — a genuinely persistent block
      // (VPN/DNS filtering challenges.cloudflare.com) should settle into
      // the visible "Verification failed" state with its Troubleshoot
      // link, not retry silently forever.
      const retry = () => {
        onToken('');
        if (retriesLeft.current > 0) {
          retriesLeft.current -= 1;
          turnstile.reset(widgetId.current);
        }
      };
      widgetId.current = turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: onToken,
        'expired-callback': retry,
        'error-callback': retry,
      });
    }).catch((err) => {
      // The script itself never loaded (see loadTurnstileScript) — no
      // widget to reset here, unlike error-callback above. verify_turnstile
      // only fails open when no secret key is configured at all; with one
      // configured (production), an empty token is rejected outright, so
      // this failure genuinely blocks the form until the next mount
      // retries the load — logged so it's diagnosable rather than a
      // silent, unexplained "verification required" on submit.
      console.error('Turnstile script failed to load:', err);
    });
    return () => {
      cancelled = true;
      if (widgetId.current != null && window.turnstile) {
        window.turnstile.remove(widgetId.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} />;
}

export const turnstileEnabled = Boolean(SITE_KEY);
