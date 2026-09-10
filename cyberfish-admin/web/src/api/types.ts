/** 后端统一响应包裹 */
export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  requestId?: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PageData<T> {
  list: T[];
  pagination: Pagination;
}

/** 通用列表查询参数 */
export interface ListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: unknown;
}

// ============ 角色 / 账号 ============
export type AdminRole = 'ADMIN' | 'OPERATOR' | 'REVIEWER' | 'VIEWER';
export type ActiveStatus = 'ACTIVE' | 'DISABLED';

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  status: ActiveStatus;
  email: string | null;
  lastLoginAt: string | null;
  lastLoginIp?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface SiteConfig {
  id: string;
  title: string;
  content: string;
  apkUrl: string | null;
  apkFileId: string | null;
  downloadUrl: string | null;
  updatedById?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ============ APP 版本 ============
export type Platform = 'ANDROID' | 'IOS' | 'HARMONY';
export type UpdateType = 'FORCE' | 'OPTIONAL' | 'NONE';
export type ReleaseStatus = 'DRAFT' | 'GRAY' | 'ONLINE' | 'OFFLINE';

export interface AppVersion {
  id: string;
  versionName: string;
  versionCode: number;
  platform: Platform;
  channel: string;
  updateType: UpdateType;
  releaseNotes: string;
  apkUrl: string | null;
  apkSize: number | null;
  apkSha256: string | null;
  apkFileId: string | null;
  minSupportedCode: number | null;
  status: ReleaseStatus;
  grayPercent: number;
  grayDeviceIds: string[];
  downloadCount: number;
  onlineAt: string | null;
  offlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; displayName: string } | null;
}

// ============ 模型 ============
export type QuantType = 'W8A32' | 'INT8' | 'FP16' | 'FP32';
export type Framework = 'LiteRT' | 'TFLITE' | 'ONNX' | 'NCNN';
export type ModelStatus = 'DRAFT' | 'GRAY' | 'ONLINE' | 'OFFLINE' | 'ROLLBACK';
export type DispatchTargetType = 'GLOBAL' | 'APP_VERSION' | 'DEVICE_GROUP' | 'DEVICE_ID';
export type DispatchStatus = 'PENDING' | 'DISPATCHING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'ROLLED_BACK';
export type DeviceDispatchStatus = 'PENDING' | 'DOWNLOADING' | 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';

export interface MlModel {
  id: string;
  modelVersion: string;
  name: string;
  arch: string;
  quant: QuantType;
  framework: Framework;
  fileUrl: string | null;
  fileSize: number | null;
  sha256: string | null;
  fileId: string | null;
  inputSize: number;
  numClasses: number;
  labels: string[];
  map50: number;
  map50_95: number;
  precision: number;
  recall: number;
  avgLatencyMs: number;
  minAppCode: number | null;
  maxAppCode: number | null;
  status: ModelStatus;
  isRollback: boolean;
  publishedAt: string | null;
  remark: string | null;
  signature: string | null;
  signatureAlgorithm: string | null;
  publicKeyId: string | null;
  signatureExpiresAt: string | null;
  runtimeSignatureName: string | null;
  inputName: string | null;
  inputLayout: 'NCHW' | 'NHWC';
  outputName: string | null;
  coordinatesNormalized: boolean;
  valuesPerDetection: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; displayName: string } | null;
  recentDispatches?: ModelDispatch[];
}

export interface ModelDispatch {
  id: string;
  modelId: string;
  targetType: DispatchTargetType;
  targetValue: Record<string, unknown>;
  grayPercent: number;
  status: DispatchStatus;
  totalDevices: number;
  successDevices: number;
  failedDevices: number;
  isRollback: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  remark: string | null;
  createdAt: string;
  model?: { id: string; modelVersion: string; arch: string; quant: QuantType };
  operator?: { id: string; displayName: string } | null;
  matchedDevices?: number;
}

export interface DeviceDispatchLog {
  id: string;
  dispatchId: string;
  deviceId: string;
  fromModelVersion: string;
  toModelVersion: string;
  status: DeviceDispatchStatus;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

// ============ 误报 ============
export type ReportType = 'FALSE_POSITIVE' | 'MISSED' | 'MISIDENTIFY';
export type MisreportStatus = 'PENDING' | 'REVIEWING' | 'CONFIRMED' | 'REJECTED' | 'RESOLVED' | 'CLOSED';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';
export type GroundTruth = 'TRUE_FISH' | 'FALSE_ALARM';
export type RootCause =
  | 'WATER_REFLECTION'
  | 'OCCLUSION'
  | 'LIGHT'
  | 'MODEL_LIMIT'
  | 'THRESHOLD'
  | 'DEVICE_PERF'
  | 'USER_OP'
  | 'OTHER';

export interface Misreport {
  id: string;
  reportNo: string;
  userId: string;
  deviceId: string;
  deviceModel: string;
  osVersion: string;
  appVersionName: string;
  appVersionCode: number;
  modelVersion: string;
  reportType: ReportType;
  status: MisreportStatus;
  severity: Severity;
  userNote: string;
  rawData: Record<string, unknown>;
  thumbnailUrl: string | null;
  snapshotUrls: string[];
  videoUrl: string | null;
  sceneTags: string[];
  rootCause: RootCause | null;
  groundTruth: GroundTruth | null;
  reviewerNote: string | null;
  resolution: string | null;
  addToTrainingSet: boolean;
  assignedToName?: string | null;
  reviewedByName?: string | null;
  assignedTo?: { id: string; displayName: string } | null;
  reviewedBy?: { id: string; displayName: string } | null;
  reviewedAt: string | null;
  reportedAt: string;
  createdAt: string;
  statusLogs?: MisreportStatusLog[];
}

export interface MisreportStatusLog {
  id: string;
  fromStatus: MisreportStatus | null;
  toStatus: MisreportStatus;
  operatorName: string;
  operator?: { id: string; displayName: string } | null;
  note: string | null;
  createdAt: string;
}

// ============ 审计日志 ============
export type AuditModule = 'AUTH' | 'ADMIN' | 'FILE' | 'APP_VERSION' | 'MODEL' | 'MISREPORT' | 'DASHBOARD' | 'SITE_CONFIG';
export type AuditAction =
  | 'LOGIN' | 'LOGIN_FAIL' | 'LOGOUT' | 'CREATE' | 'UPDATE' | 'DELETE'
  | 'PUBLISH' | 'PUBLISH_GRAY' | 'PUBLISH_ONLINE' | 'OFFLINE' | 'DISPATCH'
  | 'ROLLBACK' | 'RETRY' | 'REVIEW' | 'ASSIGN' | 'BATCH_REVIEW' | 'BATCH_ASSIGN'
  | 'EXPORT' | 'UPLOAD';
export type AuditResult = 'SUCCESS' | 'FAIL';

export interface AuditLog {
  id: string;
  operatorName: string;
  operator?: { id: string; username: string; displayName: string; role: AdminRole } | null;
  module: AuditModule;
  action: AuditAction;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  before: unknown;
  after: unknown;
  result: AuditResult;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

// ============ 看板 ============
export interface MetricCard {
  key: string;
  label: string;
  value: number;
  delta: number;
  unit: string;
  threshold?: number;
}

export interface DashboardRange {
  from: string;
  to: string;
  days: number;
}
