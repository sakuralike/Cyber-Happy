import fs from 'node:fs';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { resolveStoredFile } from '../../lib/storage';
import type { UpdateSiteConfigInput } from './schema';

type SiteConfigValue = {
  id: string;
  title: string;
  content: string;
  apkUrl: string | null;
  apkFileId: string | null;
  updatedById?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type PublicSiteConfig = SiteConfigValue & { downloadUrl: string | null };

const DEFAULT_CONFIG: SiteConfigValue = {
  id: 'default',
  title: '赛博鱼乐',
  content: '智能鱼漂识别与上鱼提醒。',
  apkUrl: null,
  apkFileId: null,
};

function normalize(row: SiteConfigValue): PublicSiteConfig {
  return { ...row, downloadUrl: row.apkFileId ? '/api/v1/site-config/apk' : row.apkUrl };
}

export async function get() {
  const row = await prisma.siteConfig.findUnique({ where: { id: 'default' } });
  return normalize(row ?? DEFAULT_CONFIG);
}

export async function update(input: UpdateSiteConfigInput, operatorId?: string) {
  let apkUrl = input.apkUrl ?? null;
  if (input.apkFileId) {
    const file = await prisma.fileAsset.findUnique({ where: { id: input.apkFileId } });
    if (!file) throw AppError.notFound('APK 文件不存在');
    if (file.bizType !== 'APK') throw AppError.badRequest('首页下载文件必须是 APK');
    apkUrl = file.url;
  }
  await prisma.siteConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', title: input.title, content: input.content, apkUrl, apkFileId: input.apkFileId ?? null, updatedById: operatorId ?? null },
    update: { title: input.title, content: input.content, apkUrl, apkFileId: input.apkFileId ?? null, updatedById: operatorId ?? null },
  });
  return get();
}

export async function openApk() {
  const config = await get();
  if (!config.apkFileId) return null;
  const file = await prisma.fileAsset.findUnique({ where: { id: config.apkFileId } });
  if (!file || file.bizType !== 'APK') throw AppError.notFound('APK 文件不存在');
  const full = resolveStoredFile(file.url);
  if (!full || !fs.existsSync(full)) throw AppError.notFound('APK 文件已丢失');
  return { full, mimeType: file.mimeType || 'application/vnd.android.package-archive', originalName: file.originalName };
}
