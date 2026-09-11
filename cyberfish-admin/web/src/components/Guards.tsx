import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../store/auth';
import { useUserAuth } from '../store/userAuth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  if (!isAuthed) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequirePerm({ perm, children }: { perm: string; children: ReactNode }) {
  const { hasPerm } = useAuth();
  if (!hasPerm(perm)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function RequireUserAuth({ children }: { children: ReactNode }) {
  const { isAuthed } = useUserAuth();
  if (!isAuthed) return <Navigate to="/account/login" replace />;
  return <>{children}</>;
}
