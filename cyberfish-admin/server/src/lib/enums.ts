/**
 * 枚举值域与类型（替代 Prisma 原生枚举）
 * ------------------------------------------------------------
 * SQLite 连接器不支持原生枚举，schema 中以 String 承载；
 * 本文件是后端的单一事实源（值 + 类型），前端对应 web/src/utils/constants.ts。
 * 使用方式与原生枚举一致：`AdminRole.ADMIN`（值）、`AdminRole`（类型）、`z.nativeEnum(AdminRole)`。
 */

export const AdminRole = {
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
  REVIEWER: 'REVIEWER',
  VIEWER: 'VIEWER',
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

export const ActiveStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const;
export type ActiveStatus = (typeof ActiveStatus)[keyof typeof ActiveStatus];

export const Platform = {
  ANDROID: 'ANDROID',
  IOS: 'IOS',
  HARMONY: 'HARMONY',
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

export const UpdateType = {
  FORCE: 'FORCE',
  OPTIONAL: 'OPTIONAL',
  NONE: 'NONE',
} as const;
export type UpdateType = (typeof UpdateType)[keyof typeof UpdateType];

export const ReleaseStatus = {
  DRAFT: 'DRAFT',
  GRAY: 'GRAY',
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
} as const;
export type ReleaseStatus = (typeof ReleaseStatus)[keyof typeof ReleaseStatus];

export const QuantType = {
  INT8: 'INT8',
  FP16: 'FP16',
  FP32: 'FP32',
} as const;
export type QuantType = (typeof QuantType)[keyof typeof QuantType];

export const Framework = {
  TFLITE: 'TFLITE',
  ONNX: 'ONNX',
  NCNN: 'NCNN',
} as const;
export type Framework = (typeof Framework)[keyof typeof Framework];

export const ModelStatus = {
  DRAFT: 'DRAFT',
  GRAY: 'GRAY',
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  ROLLBACK: 'ROLLBACK',
} as const;
export type ModelStatus = (typeof ModelStatus)[keyof typeof ModelStatus];

export const DispatchTargetType = {
  GLOBAL: 'GLOBAL',
  APP_VERSION: 'APP_VERSION',
  DEVICE_GROUP: 'DEVICE_GROUP',
  DEVICE_ID: 'DEVICE_ID',
} as const;
export type DispatchTargetType = (typeof DispatchTargetType)[keyof typeof DispatchTargetType];

export const DispatchStatus = {
  PENDING: 'PENDING',
  DISPATCHING: 'DISPATCHING',
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  ROLLED_BACK: 'ROLLED_BACK',
} as const;
export type DispatchStatus = (typeof DispatchStatus)[keyof typeof DispatchStatus];

export const DeviceDispatchStatus = {
  PENDING: 'PENDING',
  DOWNLOADING: 'DOWNLOADING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  ROLLED_BACK: 'ROLLED_BACK',
} as const;
export type DeviceDispatchStatus = (typeof DeviceDispatchStatus)[keyof typeof DeviceDispatchStatus];

export const ReportType = {
  FALSE_POSITIVE: 'FALSE_POSITIVE',
  MISSED: 'MISSED',
  MISIDENTIFY: 'MISIDENTIFY',
} as const;
export type ReportType = (typeof ReportType)[keyof typeof ReportType];

export const MisreportStatus = {
  PENDING: 'PENDING',
  REVIEWING: 'REVIEWING',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;
export type MisreportStatus = (typeof MisreportStatus)[keyof typeof MisreportStatus];

export const Severity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

export const GroundTruth = {
  TRUE_FISH: 'TRUE_FISH',
  FALSE_ALARM: 'FALSE_ALARM',
} as const;
export type GroundTruth = (typeof GroundTruth)[keyof typeof GroundTruth];

export const RootCause = {
  WATER_REFLECTION: 'WATER_REFLECTION',
  OCCLUSION: 'OCCLUSION',
  LIGHT: 'LIGHT',
  MODEL_LIMIT: 'MODEL_LIMIT',
  THRESHOLD: 'THRESHOLD',
  DEVICE_PERF: 'DEVICE_PERF',
  USER_OP: 'USER_OP',
  OTHER: 'OTHER',
} as const;
export type RootCause = (typeof RootCause)[keyof typeof RootCause];

export const AuditModule = {
  AUTH: 'AUTH',
  ADMIN: 'ADMIN',
  FILE: 'FILE',
  APP_VERSION: 'APP_VERSION',
  MODEL: 'MODEL',
  MISREPORT: 'MISREPORT',
  DASHBOARD: 'DASHBOARD',
} as const;
export type AuditModule = (typeof AuditModule)[keyof typeof AuditModule];

export const AuditAction = {
  LOGIN: 'LOGIN',
  LOGIN_FAIL: 'LOGIN_FAIL',
  LOGOUT: 'LOGOUT',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  PUBLISH: 'PUBLISH',
  PUBLISH_GRAY: 'PUBLISH_GRAY',
  PUBLISH_ONLINE: 'PUBLISH_ONLINE',
  OFFLINE: 'OFFLINE',
  DISPATCH: 'DISPATCH',
  ROLLBACK: 'ROLLBACK',
  RETRY: 'RETRY',
  REVIEW: 'REVIEW',
  ASSIGN: 'ASSIGN',
  BATCH_REVIEW: 'BATCH_REVIEW',
  BATCH_ASSIGN: 'BATCH_ASSIGN',
  EXPORT: 'EXPORT',
  UPLOAD: 'UPLOAD',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditResult = {
  SUCCESS: 'SUCCESS',
  FAIL: 'FAIL',
} as const;
export type AuditResult = (typeof AuditResult)[keyof typeof AuditResult];

export const FileBizType = {
  APK: 'APK',
  MODEL: 'MODEL',
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
} as const;
export type FileBizType = (typeof FileBizType)[keyof typeof FileBizType];

export const EventType = {
  LAUNCH: 'LAUNCH',
  TRIGGER: 'TRIGGER',
  MODEL_CALL: 'MODEL_CALL',
  MISREPORT: 'MISREPORT',
  CRASH: 'CRASH',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];
