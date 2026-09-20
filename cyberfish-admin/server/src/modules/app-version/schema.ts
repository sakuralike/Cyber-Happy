import { z } from 'zod';
import { AppDownloadMode, Platform, UpdateType } from '../../lib/enums';
import { listQuerySchema, dateStr } from '../../lib/zod';

const downloadUrlSchema = z.string().trim().url().max(500).refine((value) => /^https?:\/\//i.test(value), '仅支持 HTTP 或 HTTPS 下载地址');
const sha256Schema = z.string().trim().regex(/^[a-f0-9]{64}$/i, 'SHA-256 必须是 64 位十六进制字符串');

export const appVersionDownloadSchema = z.object({
  downloadMode: z.nativeEnum(AppDownloadMode).optional(),
  apkUrl: downloadUrlSchema.optional().nullable(),
  apkSize: z.number().int().positive().optional().nullable(),
  apkSha256: sha256Schema.optional().nullable(),
  apkFileId: z.string().min(1).optional().nullable(),
}).superRefine((value, ctx) => {
  const downloadMode = value.downloadMode ?? (value.apkFileId ? AppDownloadMode.SERVER : AppDownloadMode.EXTERNAL);
  if (downloadMode === AppDownloadMode.EXTERNAL && !value.apkUrl) {
    ctx.addIssue({ code: 'custom', message: '必须配置网盘外部链接', path: ['apkUrl'] });
  }
  if (downloadMode === AppDownloadMode.SERVER && !value.apkFileId) {
    ctx.addIssue({ code: 'custom', message: '服务器模式必须上传 APK', path: ['apkFileId'] });
  }
  if (downloadMode === AppDownloadMode.EXTERNAL && value.apkFileId) {
    ctx.addIssue({ code: 'custom', message: '网盘外部链接不能选择服务器文件', path: ['apkFileId'] });
  }
});

export const appVersionListSchema = listQuerySchema.extend({
  status: z.string().trim().optional(),
  updateType: z.string().trim().optional(),
  platform: z.string().trim().optional(),
  channel: z.string().trim().optional(),
  createdFrom: dateStr,
  createdTo: dateStr,
});

const appVersionBaseFields = {
  versionName: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+){0,3}$/, '版本号格式应为 x.y.z，如 1.2.0'),
  versionCode: z.number().int().positive('versionCode 必须为正整数'),
  platform: z.nativeEnum(Platform).default(Platform.ANDROID),
  channel: z.string().trim().min(1).max(50).default('official'),
  updateType: z.nativeEnum(UpdateType).default(UpdateType.OPTIONAL),
  releaseNotes: z.string().max(5000).default(''),
  minSupportedCode: z.number().int().nonnegative().optional(),
  downloadMode: z.nativeEnum(AppDownloadMode).optional(),
  apkUrl: downloadUrlSchema.optional().nullable(),
  apkSize: z.number().int().positive().optional().nullable(),
  apkSha256: sha256Schema.optional().nullable(),
  apkFileId: z.string().min(1).optional().nullable(),
};

const appVersionBaseSchema = z.object(appVersionBaseFields);

export const createAppVersionSchema = appVersionBaseSchema.superRefine((value, ctx) => {
  const result = appVersionDownloadSchema.safeParse(value);
  if (!result.success) result.error.issues.forEach((issue) => ctx.addIssue(issue));
});

export const updateAppVersionSchema = appVersionBaseSchema
  .partial()
  .omit({ versionCode: true })
  .extend({
    grayPercent: z.number().int().min(0).max(100).optional(),
    grayDeviceIds: z.array(z.string()).max(1000).optional(),
  });

export const appVersionActionSchema = z.object({
  action: z.enum(['PUBLISH_GRAY', 'PUBLISH_ONLINE', 'OFFLINE', 'ROLLBACK']),
  grayPercent: z.number().int().min(0).max(100).optional(),
  deviceIds: z.array(z.string()).max(1000).optional(),
  reason: z.string().max(500).optional(),
});

export const checkUpdateSchema = z.object({
  versionCode: z.coerce.number().int().nonnegative(),
  deviceId: z.string().trim().min(1),
  platform: z.nativeEnum(Platform).default(Platform.ANDROID),
  channel: z.string().trim().optional(),
});

export type AppVersionListQuery = z.infer<typeof appVersionListSchema>;
export type CreateAppVersionInput = z.infer<typeof createAppVersionSchema>;
export type UpdateAppVersionInput = z.infer<typeof updateAppVersionSchema>;
export type AppVersionActionInput = z.infer<typeof appVersionActionSchema>;
export type CheckUpdateQuery = z.infer<typeof checkUpdateSchema>;
