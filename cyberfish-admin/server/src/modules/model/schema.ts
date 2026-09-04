import { z } from 'zod';
import { QuantType, Framework, DispatchTargetType, DeviceDispatchStatus } from '../../lib/enums';
import { listQuerySchema, dateStr } from '../../lib/zod';

export const modelListSchema = listQuerySchema.extend({
  status: z.string().trim().optional(),
  quant: z.string().trim().optional(),
  framework: z.string().trim().optional(),
  arch: z.string().trim().optional(),
  createdFrom: dateStr,
  createdTo: dateStr,
});

export const createModelSchema = z.object({
  modelVersion: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9._-]+$/, '模型版本只允许字母数字 . _ -'),
  name: z.string().trim().min(1).max(100),
  arch: z.string().trim().min(1).max(50).default('YOLO26n'),
  quant: z.nativeEnum(QuantType).default(QuantType.W8A32),
  framework: z.nativeEnum(Framework).default(Framework.LITERT),
  fileId: z.string().min(1).optional(),
  inputSize: z.number().int().positive().default(640),
  numClasses: z.number().int().positive().default(1),
  labels: z.array(z.string()).min(1).default(['鱼漂']),
  map50: z.number().min(0).max(1).default(0),
  map50_95: z.number().min(0).max(1).default(0),
  precision: z.number().min(0).max(1).default(0),
  recall: z.number().min(0).max(1).default(0),
  avgLatencyMs: z.number().int().nonnegative().default(0),
  minAppCode: z.number().int().nonnegative().optional(),
  maxAppCode: z.number().int().nonnegative().optional(),
  remark: z.string().max(1000).optional(),
  signature: z.string().trim().max(20000).optional().nullable(),
  signatureAlgorithm: z.string().trim().max(80).optional().nullable(),
  publicKeyId: z.string().trim().max(120).optional().nullable(),
  signatureExpiresAt: z.string().datetime().optional().nullable(),
  runtimeSignatureName: z.string().trim().max(120).optional().nullable(),
  inputName: z.string().trim().max(120).optional().nullable(),
  inputLayout: z.enum(['NCHW', 'NHWC']).default('NCHW'),
  outputName: z.string().trim().max(120).optional().nullable(),
  coordinatesNormalized: z.boolean().default(false),
  valuesPerDetection: z.number().int().positive().default(6),
});

export const updateModelSchema = createModelSchema.partial().omit({ modelVersion: true });

export const dispatchSchema = z.object({
  targetType: z.nativeEnum(DispatchTargetType),
  targetValue: z.record(z.unknown()).default({}),
  grayPercent: z.number().int().min(0).max(100).default(100),
  appVersionId: z.string().min(1).optional(),
  remark: z.string().max(500).optional(),
});

export const rollbackSchema = z.object({
  toModelId: z.string().min(1, '必须指定回滚目标模型'),
  reason: z.string().min(1, '请填写回滚原因').max(500),
  scope: z.enum(['ALL', 'FAILED_ONLY']).default('ALL'),
});

export const dispatchListSchema = listQuerySchema.extend({
  status: z.string().trim().optional(),
  targetType: z.string().trim().optional(),
  modelId: z.string().trim().optional(),
  operatorId: z.string().trim().optional(),
  createdFrom: dateStr,
  createdTo: dateStr,
});

export const deviceLogListSchema = listQuerySchema.extend({
  status: z.string().trim().optional(),
});

export const checkModelSchema = z.object({
  appVersionCode: z.coerce.number().int().nonnegative(),
  deviceId: z.string().trim().min(1),
  currentModelVersion: z.string().trim().optional(),
  deviceGroup: z.string().trim().optional(),
});

export const reportDispatchSchema = z.object({
  deviceId: z.string().trim().min(1),
  status: z.nativeEnum(DeviceDispatchStatus),
  progress: z.number().int().min(0).max(100).optional(),
  errorCode: z.string().max(50).optional(),
  errorMessage: z.string().max(500).optional(),
});

export type ModelListQuery = z.infer<typeof modelListSchema>;
export type CreateModelInput = z.infer<typeof createModelSchema>;
export type UpdateModelInput = z.infer<typeof updateModelSchema>;
export type DispatchInput = z.infer<typeof dispatchSchema>;
export type RollbackInput = z.infer<typeof rollbackSchema>;
export type DispatchListQuery = z.infer<typeof dispatchListSchema>;
export type DeviceLogListQuery = z.infer<typeof deviceLogListSchema>;
export type CheckModelQuery = z.infer<typeof checkModelSchema>;
export type ReportDispatchInput = z.infer<typeof reportDispatchSchema>;
