import { http } from './client';
import type { AuditLog, PageData, ListParams, AuditModule, AuditAction } from './types';

export async function listAuditLogs(params: ListParams): Promise<PageData<AuditLog>> {
  return http.get('/audit-logs', { params }) as Promise<PageData<AuditLog>>;
}

export async function getAuditLog(id: string): Promise<AuditLog> {
  return http.get(`/audit-logs/${id}`) as Promise<AuditLog>;
}

export async function auditMeta(): Promise<{ modules: AuditModule[]; actions: AuditAction[] }> {
  return http.get('/audit-logs/meta') as Promise<{ modules: AuditModule[]; actions: AuditAction[] }>;
}
