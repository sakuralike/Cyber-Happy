import { http } from './client';
import type { AdminRole } from './types';

export interface LoginResult {
  token: string;
  expiresIn: number;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: AdminRole;
    permissions: string[];
    email?: string | null;
    status?: string;
  };
}

export async function login(username: string, password: string): Promise<LoginResult> {
  return http.post('/auth/login', { username, password }) as Promise<LoginResult>;
}

export async function logout(): Promise<{ loggedOut: boolean }> {
  return http.post('/auth/logout') as Promise<{ loggedOut: boolean }>;
}

export async function fetchMe(): Promise<LoginResult['user']> {
  return http.get('/auth/me') as Promise<LoginResult['user']>;
}

export async function updateMe(input: { displayName: string; email?: string | null }): Promise<LoginResult['user']> {
  return http.patch('/auth/me', input) as Promise<LoginResult['user']>;
}
