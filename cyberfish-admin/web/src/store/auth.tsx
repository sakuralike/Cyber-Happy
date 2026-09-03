import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { getToken, setToken, setUser, getUser, clearAuth } from '../api/client';
import * as authApi from '../api/auth';
import type { AdminRole } from '../api/types';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthed: boolean;
  hasPerm: (perm: string) => boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUserState] = useState<AuthUser | null>(() => {
    const u = getUser();
    return u && typeof u.id === 'string' ? (u as unknown as AuthUser) : null;
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthed: !!token && !!user,
      hasPerm: (perm) => !!user?.permissions.includes(perm),
      login: async (username, password) => {
        const res = await authApi.login(username, password);
        setToken(res.token);
        setUser(res.user);
        setTokenState(res.token);
        setUserState(res.user);
        return res.user;
      },
      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          /* 忽略登出接口失败 */
        }
        clearAuth();
        setTokenState(null);
        setUserState(null);
      },
    }),
    [user, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
