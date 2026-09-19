import { z } from 'zod';
import { Platform, UpdateType } from '../../lib/enums';
import { listQuerySchema, dateStr } from '../../lib/zod';

const externalUrlSchema = z.string().trim().url().max(500).refine((value) => /^https?:\/\//i.test(value), '仅支持 HTTP 或 HTTPS 下载地址');

export const appVersionListSchema = listQuerySchema.extend({
  status: z.string().trim().optional(),
  updateType: z.string().trim().optional(),
  platform: z.string().trim().optional(),
  channel: z.string().trim().optional(),
  createdFrom: dateStr,
  createdTo: dateStr,
});

const appVersionBaseSchema = z.object({
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
  apkUrl: externalUrlSchema.optional().nullable(),
  apkFileId: z.string().min(1).optional(),
});

export const createAppVersionSchema = appVersionBaseSchema.superRefine((value, ctx) => {
  if (value.apkUrl && value.apkFileId) {
    ctx.addIssue({ code: 'custom', message: '外部下载地址与上传 APK 不能同时填写', path: ['apkUrl'] });
  }
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
