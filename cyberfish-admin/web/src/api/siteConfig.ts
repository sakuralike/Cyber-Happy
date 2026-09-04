import { http } from './client';
import type { SiteConfig } from './types';

export async function getSiteConfig(): Promise<SiteConfig> {
  return http.get('/site-config') as Promise<SiteConfig>;
}

export interface UpdateSiteConfigInput {
  title: string;
  content: string;
  apkUrl?: string | null;
  apkFileId?: string | null;
}

export async function updateSiteConfig(input: UpdateSiteConfigInput): Promise<SiteConfig> {
  return http.patch('/site-config', input) as Promise<SiteConfig>;
}
