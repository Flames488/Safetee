import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import './install-prompt.css';

const DISMISS_KEY = 'safetee_install_dismissed';

// The PWA manifest/service worker (vite-plugin-pwa) make the app
// installable, but Chrome only shows its own install UI from the address
// bar — nothing in-app ever told a user this exists. Listening for
// `beforeinstallprompt` lets us surface that affordance directly, once,
// without nagging on every visit after a dismissal.
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  };

  if (!visible) return null;

  return (
    <div className="install-prompt" role="dialog" aria-label="Install Safetee">
      <span className="install-prompt-icon"><Download size={16} strokeWidth={2.2} /></span>
      <span className="install-prompt-text">
        <strong>Install Safetee</strong>
        <span>Faster launch, works like a native app on your device.</span>
      </span>
      <button className="install-prompt-cta" onClick={install}>Install</button>
      <button className="install-prompt-dismiss" onClick={dismiss} aria-label="Dismiss">
        <X size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}
