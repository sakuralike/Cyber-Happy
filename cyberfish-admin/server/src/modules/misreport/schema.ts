import { z } from 'zod';
import {
  ReportType,
  Severity,
  GroundTruth,
  RootCause,
  MisreportStatus,
} from '../../lib/enums';
import { listQuerySchema, dateStr } from '../../lib/zod';

export const misreportListSchema = listQuerySchema.extend({
  status: z.string().trim().optional(),
  reportType: z.string().trim().optional(),
  severity: z.string().trim().optional(),
  rootCause: z.string().trim().optional(),
  appVersionCode: z.coerce.number().int().optional(),
  modelVersion: z.string().trim().optional(),
  assignedToId: z.string().trim().optional(),
  reportedFrom: dateStr,
  reportedTo: dateStr,
});

export const reviewSchema = z.object({
  status: z.nativeEnum(MisreportStatus),
  groundTruth: z.nativeEnum(GroundTruth).optional(),
  rootCause: z.nativeEnum(RootCause).optional(),
  reviewerNote: z.string().max(2000).optional(),
  resolution: z.string().max(2000).optional(),
  sceneTags: z.array(z.string().max(30)).max(20).optional(),
  addToTrainingSet: z.boolean().optional(),
});

export const assignSchema = z.object({
  assignedToId: z.string().min(1, '请选择处理人'),
  note: z.string().max(500).optional(),
});

export const updateMisreportSchema = z.object({
  severity: z.nativeEnum(Severity).optional(),
  sceneTags: z.array(z.string().max(30)).max(20).optional(),
  userNote: z.string().max(2000).optional(),
});

export const batchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, '请至少选择 1 条').max(200),
  action: z.enum(['REVIEW', 'ASSIGN']),
  status: z.nativeEnum(MisreportStatus).optional(),
  rootCause: z.nativeEnum(RootCause).optional(),
  reviewerNote: z.string().max(2000).optional(),
  assignedToId: z.string().min(1).optional(),
});

/** APP 端上报 */
export const createMisreportSchema = z.object({
  deviceId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  deviceModel: z.string().trim().max(80).optional(),
  osVersion: z.string().trim().max(40).optional(),
  appVersionName: z.string().trim().max(30).optional(),
  appVersionCode: z.coerce.number().int().nonnegative().optional(),
  modelVersion: z.string().trim().max(80).optional(),
  reportType: z.nativeEnum(ReportType),
  severity: z.nativeEnum(Severity).default(Severity.MEDIUM),
  userNote: z.string().max(2000).optional(),
  reportedAt: z.string().datetime().optional(),
  rawData: z.record(z.unknown()).optional(),
  sceneTags: z.array(z.string().max(30)).max(20).optional(),
  snapshotUrls: z.array(z.string().max(500)).max(3).optional(),
  videoUrl: z.string().max(500).optional(),
});

export type MisreportListQuery = z.infer<typeof misreportListSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type AssignInput = z.infer<typeof assignSchema>;
export type UpdateMisreportInput = z.infer<typeof updateMisreportSchema>;
export type BatchInput = z.infer<typeof batchSchema>;
export type CreateMisreportInput = z.infer<typeof createMisreportSchema>;
