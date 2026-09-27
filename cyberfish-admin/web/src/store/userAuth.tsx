import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as userApi from '../api/user';
import type { UserAccount } from '../api/user';
import type { UserConsentStatus } from '../api/user';

interface UserAuthContextValue {
  user: UserAccount | null;
  isAuthed: boolean;
  consentStatus: UserConsentStatus | null;
  consentLoading: boolean;
  login: (username: string, password: string, privacyVersion?: string) => Promise<UserAccount>;
  register: (input: { username: string; password: string; displayName?: string; email?: string; inviteCode?: string; privacyAccepted?: boolean; privacyVersion?: string }) => Promise<UserAccount>;
  updateUser: (user: UserAccount) => void;
  acceptConsent: (privacyVersion: string) => Promise<UserConsentStatus>;
  logout: () => void;
}

const UserAuthContext = createContext<UserAuthContextValue | null>(null);

export function UserAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => userApi.getUserToken());
  const [user, setUser] = useState<UserAccount | null>(() => userApi.getUserAccount());
  const [consentStatus, setConsentStatus] = useState<UserConsentStatus | null>(null);
  const [consentLoading, setConsentLoading] = useState(() => !!userApi.getUserToken());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setConsentLoading(true);
    void Promise.all([userApi.fetchMe(), userApi.fetchConsentStatus()]).then(([nextUser, nextConsent]) => {
      if (cancelled) return;
      userApi.saveUserAccount(nextUser);
      setUser(nextUser);
      setConsentStatus(nextConsent);
    }).catch(() => {
      if (cancelled) return;
      userApi.clearUserSession();
      setToken(null);
      setUser(null);
      setConsentStatus(null);
    }).finally(() => {
      if (!cancelled) setConsentLoading(false);
    });
    return () => { cancelled = true; };
  }, [token]);

  const value = useMemo<UserAuthContextValue>(() => ({
    user,
    isAuthed: !!token && !!user,
    consentStatus,
    consentLoading,
    login: async (username, password, privacyVersion) => {
      const session = await userApi.login(username, password, privacyVersion);
      userApi.saveUserSession(session);
      setToken(session.token);
      setUser(session.user);
      setConsentLoading(true);
      return session.user;
    },
    register: async (input) => {
      const session = await userApi.register(input);
      userApi.saveUserSession(session);
      setToken(session.token);
      setUser(session.user);
      setConsentLoading(true);
      return session.user;
    },
    updateUser: (nextUser) => {
      userApi.saveUserAccount(nextUser);
      setUser(nextUser);
    },
    acceptConsent: async (privacyVersion) => {
      const next = await userApi.acceptConsent(privacyVersion);
      setConsentStatus(next);
      return next;
    },
    logout: () => {
      userApi.clearUserSession();
      setToken(null);
      setUser(null);
      setConsentStatus(null);
      setConsentLoading(false);
    },
  }), [token, user, consentStatus, consentLoading]);

  return <UserAuthContext.Provider value={value}>{children}</UserAuthContext.Provider>;
}

export function useUserAuth(): UserAuthContextValue {
  const context = useContext(UserAuthContext);
  if (!context) throw new Error('useUserAuth 必须在 UserAuthProvider 内使用');
  return context;
}
