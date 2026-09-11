import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as userApi from '../api/user';
import type { UserAccount } from '../api/user';

interface UserAuthContextValue {
  user: UserAccount | null;
  isAuthed: boolean;
  login: (username: string, password: string) => Promise<UserAccount>;
  register: (input: { username: string; password: string; displayName?: string; email?: string }) => Promise<UserAccount>;
  updateUser: (user: UserAccount) => void;
  logout: () => void;
}

const UserAuthContext = createContext<UserAuthContextValue | null>(null);

export function UserAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => userApi.getUserToken());
  const [user, setUser] = useState<UserAccount | null>(() => userApi.getUserAccount());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void userApi.fetchMe().then((nextUser) => {
      if (cancelled) return;
      userApi.saveUserAccount(nextUser);
      setUser(nextUser);
    }).catch(() => {
      if (cancelled) return;
      userApi.clearUserSession();
      setToken(null);
      setUser(null);
    });
    return () => { cancelled = true; };
  }, [token]);

  const value = useMemo<UserAuthContextValue>(() => ({
    user,
    isAuthed: !!token && !!user,
    login: async (username, password) => {
      const session = await userApi.login(username, password);
      userApi.saveUserSession(session);
      setToken(session.token);
      setUser(session.user);
      return session.user;
    },
    register: async (input) => {
      const session = await userApi.register(input);
      userApi.saveUserSession(session);
      setToken(session.token);
      setUser(session.user);
      return session.user;
    },
    updateUser: (nextUser) => {
      userApi.saveUserAccount(nextUser);
      setUser(nextUser);
    },
    logout: () => {
      userApi.clearUserSession();
      setToken(null);
      setUser(null);
    },
  }), [token, user]);

  return <UserAuthContext.Provider value={value}>{children}</UserAuthContext.Provider>;
}

export function useUserAuth(): UserAuthContextValue {
  const context = useContext(UserAuthContext);
  if (!context) throw new Error('useUserAuth 必须在 UserAuthProvider 内使用');
  return context;
}
