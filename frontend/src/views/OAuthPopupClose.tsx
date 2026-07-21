import React from 'react';
import { Spinner } from '../components/ds';
import { useLanguage } from '../components/LanguageContext';

// Landing page for the GitHub OAuth popup window: the backend redirects here
// once the session cookie is set. Report success to the window that opened
// the popup, then close it — the opener refreshes its own session instead of
// this tab ever being the one the visitor keeps browsing in.
const OAuthPopupClose: React.FC = () => {
  const { language } = useLanguage();

  React.useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ source: 'silan-auth', status: 'success' }, window.location.origin);
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
