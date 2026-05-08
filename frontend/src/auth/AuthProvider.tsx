import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiBase } from '../api/client';

type AuthUser = {
  id: string;
  displayName: string;
  email?: string;
  twitchLogin?: string;
  avatarUrl?: string;
  role: string;
  channels: Array<{ channelId: string; role: string }>;
};

const AuthContext = createContext<any>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch(`${apiBase}/api/auth/me`, { credentials: 'include' });
      if (!res.ok) {
        setUser(null);
      } else {
        setUser(await res.json());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const logout = async () => {
    await fetch(`${apiBase}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
