import { http } from './client';
import type { AdminUser, AdminRole, PageData, ListParams } from './types';

export interface AdminListResult extends PageData<AdminUser> {}

export async function listAdmins(params: ListParams): Promise<AdminListResult> {
  return http.get('/admins', { params }) as Promise<AdminListResult>;
}

export async function createAdmin(input: {
  username: string;
  password: string;
  displayName: string;
  role: AdminRole;
  email?: string;
}): Promise<AdminUser> {
  return http.post('/admins', input) as Promise<AdminUser>;
}

export async function updateAdmin(
  id: string,
  input: Partial<{ displayName: string; role: AdminRole; status: string; email: string; password: string }>,
): Promise<AdminUser> {
  return http.patch(`/admins/${id}`, input) as Promise<AdminUser>;
}

export async function deleteAdmin(id: string): Promise<{ id: string; disabled: boolean }> {
  return http.delete(`/admins/${id}`) as Promise<{ id: string; disabled: boolean }>;
}
