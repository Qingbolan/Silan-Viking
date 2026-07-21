import React from 'react';
import { Spinner } from '../components/ds';
import { useLanguage } from '../components/LanguageContext';
import { GITHUB_POPUP_RESULT_KEY } from '../components/InteractiveContact';

// Landing page for the GitHub OAuth popup window: the backend redirects here
// once the session cookie is set. Report success to the window that opened
// the popup, then close it — the opener refreshes its own session instead of
// this tab ever being the one the visitor keeps browsing in.
//
// localStorage (not postMessage) is the primary signal: GitHub's authorize
// page navigates this popup cross-origin and back, and that hop can sever
// `window.opener` in browsers that isolate cross-origin popups, which would
// silently break a postMessage-only handshake. A disk-level storage write
// survives regardless of whether `opener` still resolves to anything.
const OAuthPopupClose: React.FC = () => {
  const { language } = useLanguage();

  React.useEffect(() => {
    try {
      localStorage.setItem(GITHUB_POPUP_RESULT_KEY, 'success');
    } catch {
      // A blocked storage API just means the opener falls back to detecting
      // this window closing — still resolves, just without a status.
    }
    if (window.opener) {
      try {
        window.opener.postMessage({ source: 'silan-auth', status: 'success' }, window.location.origin);
      } catch {
        // Opener reference can throw if it was severed by cross-origin
        // isolation — the localStorage write above already covers this.
      }
    }
    window.close();
  }, []);

  return (
    <div className="flex min-h-[55dvh] items-center justify-center" aria-live="polite">
      <Spinner label={language === 'zh' ? '正在完成登录' : 'Finishing sign-in'} />
    </div>
  );
};

export default OAuthPopupClose;
