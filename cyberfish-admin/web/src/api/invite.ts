import { http } from './client';
import type { PageData } from './types';

export type InviteMode = 'SINGLE' | 'MULTI';
export type InviteStatus = 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'REVOKED';

export interface InviteCode {
  id: string;
  codePrefix: string;
  mode: InviteMode;
  maxUses: number;
  usedCount: number;
  remainingUses: number;
  expiresAt: string | null;
  revokedAt: string | null;
  note: string | null;
  status: InviteStatus;
  createdAt: string;
  lastUsedAt: string | null;
  createdBy: { id: string; displayName: string } | null;
}

export const listInviteCodes = (params: Record<string, unknown> = {}) =>
  http.get('/admin/invite-codes', { params }) as Promise<PageData<InviteCode>>;

export const createInviteCodes = (input: { mode: InviteMode; quantity: number; maxUses: number; expiresAt?: string | null; note?: string | null }) =>
  http.post('/admin/invite-codes', input) as Promise<{ items: Array<{ code: string; invite: InviteCode }> }>;

export const revokeInviteCode = (id: string) =>
  http.post(`/admin/invite-codes/${id}/revoke`) as Promise<InviteCode>;
