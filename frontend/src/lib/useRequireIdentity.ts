import { useRef, useState } from 'react';
import { useAuth } from '../components/InteractiveContact';
import { readCommenter, hasStoredCommenter } from './commenterIdentity';

// Like and comment both need an identity behind them (an account or a saved
// guest name/email) — gate the first attempt on a login prompt instead of
// letting the action fail post-hoc after the user has already committed to it.
export const useRequireIdentity = <Action,>() => {
  const { isAuthenticated } = useAuth();
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const pendingActionRef = useRef<Action | null>(null);

  const requireIdentity = (action: Action, perform: (action: Action) => void) => {
    if (isAuthenticated || hasStoredCommenter(readCommenter())) {
      perform(action);
      return;
    }
    pendingActionRef.current = action;
    setLoginPromptOpen(true);
  };

  const resolveLogin = (perform: (action: Action) => void) => {
    setLoginPromptOpen(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) perform(action);
  };

  const closeLoginPrompt = () => {
    setLoginPromptOpen(false);
    pendingActionRef.current = null;
  };

  return { loginPromptOpen, requireIdentity, resolveLogin, closeLoginPrompt };
};
