import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User } from '../../types/contact';
import { apiUrl } from '../../api/utils';

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
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

  useEffect(() => {
    let active = true;
    // Remove the former client-trusted identity cache. The HttpOnly session
    // endpoint is now the only source of authentication truth.
    localStorage.removeItem('auth_user');
    // Known NUS mirror limitation: login depends on cross-site HttpOnly
    // cookies (SameSite=None; Secure). Browsers that block third-party
    // cookies may keep this anonymous even though public browsing, comments,
    // search and content loading continue to work against silan.tech.
    void fetch(apiUrl('/api/v1/auth/session'), { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return null;
        return mapUser(await response.json());
      })
      .then((identity) => {
        if (active) setUser(identity);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mapUser]);

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

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!user,
        user,
        loading,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
