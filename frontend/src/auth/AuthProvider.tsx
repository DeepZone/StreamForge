import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../api/client';

type AuthUser = {
  id: string;
  displayName: string;
  email?: string;
  twitchLogin?: string;
  avatarUrl?: string;
  role: string;
  channels: Array<{ channelId: string; role: string }>;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async (): Promise<AuthUser | null> => {
    try {
      const me = await apiGet<AuthUser>('/api/auth/me');
      setUser(me);
      return me;
    } catch (error: any) {
      if (error?.status === 401) {
        setUser(null);
        return null;
      }
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const logout = async () => {
    await apiPost<{ ok: true }>('/api/auth/logout');
    setUser(null);
  };

  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
