import axios, { type AxiosInstance } from 'axios';
import { message } from 'antd';
import type { ApiEnvelope } from './types';

const TOKEN_KEY = 'cf_token';
const USER_KEY = 'cf_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
export function setUser(user: unknown): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function getUser(): Record<string, unknown> | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const http: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
});

http.interceptors.request.use((cfg) => {
  const token = getToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

http.interceptors.response.use(
  (resp): any => {
    const body = resp.data as ApiEnvelope<unknown>;
    // 兼容非包裹响应（如 CSV 导出，用单独 axios 处理，不经过这里）
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) return body.data;
      const err = new Error(body.message || '请求失败') as Error & { code?: number };
      err.code = body.code;
      return Promise.reject(err);
    }
    return body;
  },
  (error) => {
    const status: number | undefined = error.response?.status;
    const body = error.response?.data as ApiEnvelope<unknown> | undefined;
    const msg = body?.message || (error as Error).message || '网络错误';
    if (status === 401) {
      clearAuth();
      if (!window.location.hash.startsWith('#/login')) {
        window.location.hash = '#/login';
      }
    }
    const err = new Error(msg) as Error & { code?: number; status?: number };
    err.code = body?.code;
    err.status = status;
    return Promise.reject(err);
  },
);

/** 统一错误提示 */
export function notifyError(err: unknown): void {
  const msg = err instanceof Error ? err.message : '请求失败';
  message.error(msg);
}
