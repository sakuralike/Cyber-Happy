import { http } from './client';
import type { AppVersion, PageData, ListParams, UpdateType, Platform } from './types';

export async function listAppVersions(params: ListParams): Promise<PageData<AppVersion>> {
  return http.get('/app-versions', { params }) as Promise<PageData<AppVersion>>;
}

export async function getAppVersion(id: string): Promise<AppVersion> {
  return http.get(`/app-versions/${id}`) as Promise<AppVersion>;
}

export interface CreateAppVersionInput {
  versionName: string;
  versionCode: number;
  platform?: Platform;
  channel?: string;
  updateType?: UpdateType;
  releaseNotes?: string;
  minSupportedCode?: number;
  apkFileId?: string;
}

export async function createAppVersion(input: CreateAppVersionInput): Promise<AppVersion> {
  return http.post('/app-versions', input) as Promise<AppVersion>;
}

export async function updateAppVersion(
  id: string,
  input: Partial<CreateAppVersionInput> & { grayPercent?: number; grayDeviceIds?: string[] },
): Promise<AppVersion> {
  return http.patch(`/app-versions/${id}`, input) as Promise<AppVersion>;
}

export async function deleteAppVersion(id: string): Promise<{ id: string; deleted: boolean }> {
  return http.delete(`/app-versions/${id}`) as Promise<{ id: string; deleted: boolean }>;
}

export type AppVersionAction = 'PUBLISH_GRAY' | 'PUBLISH_ONLINE' | 'OFFLINE' | 'ROLLBACK';

export async function appVersionAction(
  id: string,
  action: AppVersionAction,
  extra?: { grayPercent?: number; deviceIds?: string[]; reason?: string },
): Promise<AppVersion> {
  return http.post(`/app-versions/${id}/actions`, { action, ...extra }) as Promise<AppVersion>;
}

export async function appVersionStats(): Promise<{ versionCode: number; versionName: string; devices: number; ratio: number }[]> {
  return http.get('/app-versions/stats') as Promise<{ versionCode: number; versionName: string; devices: number; ratio: number }[]>;
}
