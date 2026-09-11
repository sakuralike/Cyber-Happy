import axios, { type AxiosInstance } from 'axios';
import type { ApiEnvelope, PageData } from './types';

const TOKEN_KEY = 'cf_user_token';
const USER_KEY = 'cf_user_account';

export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserSession {
  token: string;
  expiresIn: number;
  user: UserAccount;
}

export interface UserMisreport {
  id: string;
  reportNo: string;
  reportType: string;
  status: string;
  userNote: string;
  reportedAt: string;
  resolution: string | null;
  reviewerNote: string | null;
}

export interface UserFeedback {
  id: string;
  content: string;
  contact: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function getUserToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUserAccount(): UserAccount | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserAccount;
  } catch {
    return null;
  }
}

export function saveUserSession(session: UserSession): void {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function saveUserAccount(user: UserAccount): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearUserSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

const userHttp: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
});

userHttp.interceptors.request.use((config) => {
  const token = getUserToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

userHttp.interceptors.response.use(
  (response): any => {
    const body = response.data as ApiEnvelope<unknown>;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) return body.data;
      return Promise.reject(new Error(body.message || '请求失败'));
    }
    return body;
  },
  (error) => {
    const body = error.response?.data as ApiEnvelope<unknown> | undefined;
    return Promise.reject(new Error(body?.message || (error as Error).message || '网络错误'));
  },
);

export const login = (username: string, password: string) =>
  userHttp.post('/users/login', { username, password }) as Promise<UserSession>;

export const register = (input: { username: string; password: string; displayName?: string; email?: string }) =>
  userHttp.post('/users/register', input) as Promise<UserSession>;

export const fetchMe = () => userHttp.get('/users/me') as Promise<UserAccount>;

export const updateMe = (input: { displayName: string; email?: string | null }) =>
  userHttp.patch('/users/me', input) as Promise<UserAccount>;

export const listMisreports = (params: { page?: number; pageSize?: number } = {}) =>
  userHttp.get('/users/misreports', { params }) as Promise<PageData<UserMisreport>>;

export const listFeedback = (params: { page?: number; pageSize?: number } = {}) =>
  userHttp.get('/users/feedback', { params }) as Promise<PageData<UserFeedback>>;

export const createFeedback = (input: { content: string; contact?: string }) =>
  userHttp.post('/users/feedback', input) as Promise<UserFeedback>;
