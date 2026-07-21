import React from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { AlertCircle, Github, LoaderCircle } from 'lucide-react';
import { useAuth } from '../InteractiveContact';
import { useLanguage } from '../LanguageContext';
import { readCommenter, persistCommenter } from '../../lib/commenterIdentity';
import { Modal } from './Modal';
import { Input } from './Input';
import { Button } from './Button';

export interface LoginPromptModalProps {
  open: boolean;
  onClose: () => void;
  /** Fires once an identity is available — either an authenticated session
   *  or a freshly-saved guest name/email. The caller re-checks auth state /
   *  storage itself rather than receiving the identity as a payload here. */
  onResolved: () => void;
}

export const LoginPromptModal: React.FC<LoginPromptModalProps> = ({ open, onClose, onResolved }) => {
  const { language } = useLanguage();
  const { loginWithGoogle, loginWithGitHub, githubAvailable } = useAuth();
  const [guestName, setGuestName] = React.useState('');
  const [guestEmail, setGuestEmail] = React.useState('');
  const [githubPending, setGithubPending] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (!open) return;
    const stored = readCommenter();
    setGuestName(stored.authorName);
    setGuestEmail(stored.authorEmail);
    setError(undefined);
  }, [open]);

  const submitGuest = (event: React.FormEvent) => {
    event.preventDefault();
    const authorName = guestName.trim();
    const authorEmail = guestEmail.trim();
    if (!authorName || !authorEmail) {
      setError(language === 'zh' ? '请填写姓名和邮箱。' : 'Add your name and email.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail)) {
      setError(language === 'zh' ? '请输入有效的邮箱地址。' : 'Enter a valid email address.');
      return;
    }
    persistCommenter({ authorName, authorEmail });
    onResolved();
  };

  const handleGitHub = async () => {
    if (githubPending) return;
    setGithubPending(true);
    setError(undefined);
    try {
      const success = await loginWithGitHub();
      if (success) onResolved();
    } finally {
      setGithubPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={language === 'zh' ? '登录后继续' : 'Sign in to continue'}
      description={language === 'zh'
        ? '登录后可以点赞和评论，或者以访客身份继续。'
        : 'Sign in to like and comment, or continue as a guest.'}
      size="sm"
      closeLabel={language === 'zh' ? '关闭' : 'Close'}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="overflow-hidden rounded-ds-sm">
            <GoogleLogin
              onSuccess={(response: CredentialResponse) => {
                if (response.credential) {
                  void loginWithGoogle(response.credential)
                    .then(onResolved)
                    .catch(() => setError(language === 'zh' ? 'Google 登录失败，请重试。' : 'Google sign-in failed. Please retry.'));
                }
              }}
              onError={() => setError(language === 'zh' ? 'Google 登录失败，请重试。' : 'Google sign-in failed. Please retry.')}
              text="continue_with"
              shape="rectangular"
              width="336"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleGitHub()}
            disabled={!githubAvailable || githubPending}
            title={!githubAvailable ? (language === 'zh' ? 'GitHub 登录尚未配置' : 'GitHub sign-in is not configured') : undefined}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-ds-sm border border-ds-border bg-ds-fg text-ds-sm font-medium text-ds-surface-1 transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/45 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {githubPending ? <LoaderCircle className="size-4 animate-spin" /> : <Github className="size-4" />}
            {language === 'zh' ? '使用 GitHub 登录' : 'Continue with GitHub'}
          </button>
        </div>

        <div className="flex items-center gap-3 text-ds-xs text-ds-fg-subtle">
          <span className="h-px flex-1 bg-ds-border" />
          {language === 'zh' ? '或以访客身份继续' : 'or continue as a guest'}
          <span className="h-px flex-1 bg-ds-border" />
        </div>

        <form onSubmit={submitGuest} className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              autoComplete="name"
              maxLength={80}
              placeholder={language === 'zh' ? '你的姓名' : 'Your name'}
            />
            <Input
              type="email"
              value={guestEmail}
              onChange={(event) => setGuestEmail(event.target.value)}
              autoComplete="email"
              maxLength={160}
              placeholder={language === 'zh' ? '邮箱（不会公开）' : 'Email (not published)'}
            />
          </div>
          <Button type="submit" variant="outline" block>
            {language === 'zh' ? '以访客身份继续' : 'Continue as guest'}
          </Button>
        </form>

        {error && (
          <p className="flex items-center gap-1.5 text-ds-xs text-red-600" role="alert">
            <AlertCircle className="size-3.5" />
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};

export default LoginPromptModal;
