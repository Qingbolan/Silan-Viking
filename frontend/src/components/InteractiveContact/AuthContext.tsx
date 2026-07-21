import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User } from '../../types/contact';
import { apiUrl } from '../../api/utils';

/** Shared with OAuthPopupClose.tsx — the popup writes 'success', the opener
 *  polls for it. See loginWithGitHub for why this exists instead of relying
 *  only on postMessage. */
export const GITHUB_POPUP_RESULT_KEY = 'silan-auth-github-popup-result';

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  githubAvailable: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
  /** Opens GitHub sign-in in a popup and resolves once the session is
   *  confirmed — the current tab never navigates away. Resolves `false`
   *  if the popup is closed before completing. */
  loginWithGitHub: () => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [githubAvailable, setGitHubAvailable] = useState(false);

  const mapUser = useCallback((data: any): User => {
    const payload = data.user ?? data;
    return {
      id: payload.id || payload.user_id,
      email: payload.email,
      username: payload.username || payload.name,
      avatar: payload.avatar_url || payload.avatar || payload.picture,
      title: payload.title,
      bio: payload.bio,
      website: payload.website,
      contact: payload.contact,
      createdAt: payload.created_at || payload.createdAt || '',
    };
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(apiUrl('/api/v1/auth/session'), { credentials: 'include' });
      if (!response.ok) {
        setUser(null);
        return false;
      }
      setUser(mapUser(await response.json()));
      return true;
    } catch {
      setUser(null);
      return false;
    }
  }, [mapUser]);

  useEffect(() => {
    let active = true;
    // Remove the former client-trusted identity cache. The HttpOnly session
    // endpoint is now the only source of authentication truth.
    localStorage.removeItem('auth_user');
    // Known NUS mirror limitation: login depends on cross-site HttpOnly
    // cookies (SameSite=None; Secure). Browsers that block third-party
    // cookies may keep this anonymous even though public browsing, comments,
    // search and content loading continue to work against silan.tech.
    void refreshSession().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refreshSession]);

  useEffect(() => {
    let active = true;
    void fetch(apiUrl('/api/v1/auth/providers'))
      .then((response) => response.ok ? response.json() : null)
      .then((providers) => {
        if (active) setGitHubAvailable(Boolean(providers?.github));
      })
      .catch(() => {
        if (active) setGitHubAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    try {
      const response = await fetch(apiUrl('/api/v1/auth/google/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      setUser(mapUser(await response.json()));
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }, [mapUser]);

  const logout = useCallback(() => {
    setUser(null);
    void fetch(apiUrl('/api/v1/auth/logout'), {
      method: 'POST',
      credentials: 'include',
    });
  }, []);

  const loginWithGitHub = useCallback((): Promise<boolean> => new Promise((resolve) => {
    // GitHub's own authorize page navigates the popup cross-origin and back;
    // several browsers sever `window.opener` on that hop (Cross-Origin-
    // Opener-Policy and similar isolation), which silently breaks a
    // postMessage-only handshake — the popup closes but the opener never
    // hears from it. localStorage is disk-level, same-origin storage that
    // survives the round trip regardless of whether `opener` still points
    // anywhere, so it is the primary signal; postMessage is kept as a faster
    // best-effort path when the opener reference does survive.
    localStorage.removeItem(GITHUB_POPUP_RESULT_KEY);

    const width = 520;
    const height = 640;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    const url = apiUrl(`/api/v1/auth/github/start?return_to=${encodeURIComponent('/auth/popup-closed')}`);
    const popup = window.open(url, 'silan-github-login', `width=${width},height=${height},left=${left},top=${top}`);
    if (!popup) {
      resolve(false);
      return;
    }

    let settled = false;
    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearInterval(pollId);
      window.clearTimeout(timeoutId);
      localStorage.removeItem(GITHUB_POPUP_RESULT_KEY);
      resolve(success);
    };
    const succeed = () => { void refreshSession().then(() => finish(true)); };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.source !== 'silan-auth') return;
      if (event.data.status === 'success') succeed();
      else finish(false);
    };
    window.addEventListener('message', onMessage);
    const pollId = window.setInterval(() => {
      const raw = localStorage.getItem(GITHUB_POPUP_RESULT_KEY);
      if (raw) {
        if (raw === 'success') succeed();
        else finish(false);
        return;
      }
      if (popup.closed) finish(false);
    }, 400);
    // Never poll forever if the popup is left open on an error page.
    const timeoutId = window.setTimeout(() => finish(false), 5 * 60 * 1000);
  }), [refreshSession]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!user,
        user,
        loading,
        githubAvailable,
        loginWithGoogle,
        loginWithGitHub,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
