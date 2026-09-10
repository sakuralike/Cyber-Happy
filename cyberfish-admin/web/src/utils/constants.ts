/** 枚举 → 中文标签 / 颜色（antd Tag preset color）的统一映射 */
import type {
  AdminRole,
  ActiveStatus,
  UpdateType,
  ReleaseStatus,
  QuantType,
  Framework,
  ModelStatus,
  DispatchTargetType,
  DispatchStatus,
  DeviceDispatchStatus,
  ReportType,
  MisreportStatus,
  Severity,
  GroundTruth,
  RootCause,
  AuditModule,
  AuditAction,
  AuditResult,
  Platform,
} from '../api/types';

type ColorMap<T extends string> = Record<T, { label: string; color: string }>;

const COLORS = {
  primary: '#0B7C6E',
  success: '#0E9F6E',
  info: '#2E6BFF',
  warning: '#E8930C',
  danger: '#DC2F3C',
  accent: '#14B8A6',
  purple: '#722ED1',
  default: 'default',
} as const;

export const ROLE_MAP: ColorMap<AdminRole> = {
  ADMIN: { label: '管理员', color: COLORS.danger },
  OPERATOR: { label: '运营', color: COLORS.info },
  REVIEWER: { label: '复核员', color: COLORS.warning },
  VIEWER: { label: '只读', color: COLORS.default },
};

export const ACTIVE_STATUS_MAP: ColorMap<ActiveStatus> = {
  ACTIVE: { label: '启用', color: COLORS.success },
  DISABLED: { label: '禁用', color: COLORS.default },
};

export const PLATFORM_MAP: ColorMap<Platform> = {
  ANDROID: { label: 'Android', color: COLORS.success },
  IOS: { label: 'iOS', color: COLORS.info },
  HARMONY: { label: 'HarmonyOS', color: COLORS.purple },
};

export const UPDATE_TYPE_MAP: ColorMap<UpdateType> = {
  FORCE: { label: '强制更新', color: COLORS.danger },
  OPTIONAL: { label: '可选更新', color: COLORS.info },
  NONE: { label: '不提示', color: COLORS.default },
};

export const RELEASE_STATUS_MAP: ColorMap<ReleaseStatus> = {
  DRAFT: { label: '草稿', color: COLORS.default },
  GRAY: { label: '灰度中', color: COLORS.warning },
  ONLINE: { label: '已上架', color: COLORS.success },
  OFFLINE: { label: '已下架', color: COLORS.danger },
};

export const QUANT_MAP: ColorMap<QuantType> = {
  W8A32: { label: 'W8A32', color: COLORS.primary },
  INT8: { label: 'INT8', color: COLORS.primary },
  FP16: { label: 'FP16', color: COLORS.info },
  FP32: { label: 'FP32', color: COLORS.purple },
};

export const FRAMEWORK_MAP: ColorMap<Framework> = {
  LiteRT: { label: 'LiteRT', color: COLORS.primary },
  TFLITE: { label: 'TFLite', color: COLORS.primary },
  ONNX: { label: 'ONNX', color: COLORS.info },
  NCNN: { label: 'NCNN', color: COLORS.purple },
};

export const MODEL_STATUS_MAP: ColorMap<ModelStatus> = {
  DRAFT: { label: '草稿', color: COLORS.default },
  GRAY: { label: '灰度中', color: COLORS.warning },
  ONLINE: { label: '已上线', color: COLORS.success },
  OFFLINE: { label: '已下线', color: COLORS.danger },
  ROLLBACK: { label: '已回滚', color: COLORS.warning },
};

export const DISPATCH_TARGET_MAP: ColorMap<DispatchTargetType> = {
  GLOBAL: { label: '全量', color: COLORS.success },
  APP_VERSION: { label: '按 APP 版本', color: COLORS.info },
  DEVICE_GROUP: { label: '按设备分组', color: COLORS.purple },
  DEVICE_ID: { label: '按设备白名单', color: COLORS.accent },
};

export const DISPATCH_STATUS_MAP: ColorMap<DispatchStatus> = {
  PENDING: { label: '待下发', color: COLORS.default },
  DISPATCHING: { label: '下发中', color: COLORS.info },
  SUCCESS: { label: '全部成功', color: COLORS.success },
  PARTIAL: { label: '部分成功', color: COLORS.warning },
  FAILED: { label: '失败', color: COLORS.danger },
  ROLLED_BACK: { label: '已回滚', color: COLORS.warning },
};

export const DEVICE_DISPATCH_STATUS_MAP: ColorMap<DeviceDispatchStatus> = {
  PENDING: { label: '待下发', color: COLORS.default },
  DOWNLOADING: { label: '下载中', color: COLORS.info },
  SUCCESS: { label: '成功', color: COLORS.success },
  FAILED: { label: '失败', color: COLORS.danger },
  ROLLED_BACK: { label: '已回滚', color: COLORS.warning },
};

export const REPORT_TYPE_MAP: ColorMap<ReportType> = {
  FALSE_POSITIVE: { label: '误报', color: COLORS.danger },
  MISSED: { label: '漏报', color: COLORS.warning },
  MISIDENTIFY: { label: '误识别', color: COLORS.info },
};

export const MISREPORT_STATUS_MAP: ColorMap<MisreportStatus> = {
  PENDING: { label: '待处理', color: COLORS.warning },
  REVIEWING: { label: '复核中', color: COLORS.info },
  CONFIRMED: { label: '已确认', color: COLORS.success },
  REJECTED: { label: '已驳回', color: COLORS.default },
  RESOLVED: { label: '已解决', color: COLORS.success },
  CLOSED: { label: '已关闭', color: COLORS.default },
};

export const SEVERITY_MAP: ColorMap<Severity> = {
  LOW: { label: '低', color: COLORS.default },
  MEDIUM: { label: '中', color: COLORS.warning },
  HIGH: { label: '高', color: COLORS.danger },
};

export const GROUND_TRUTH_MAP: ColorMap<GroundTruth> = {
  TRUE_FISH: { label: '确实上鱼', color: COLORS.success },
  FALSE_ALARM: { label: '确属误触发', color: COLORS.danger },
};

export const ROOT_CAUSE_MAP: ColorMap<RootCause> = {
  WATER_REFLECTION: { label: '水面反光', color: COLORS.accent },
  OCCLUSION: { label: '遮挡（浮萍/杂物）', color: COLORS.info },
  LIGHT: { label: '光照（强光/逆光/夜钓）', color: COLORS.warning },
  MODEL_LIMIT: { label: '模型能力不足', color: COLORS.danger },
  THRESHOLD: { label: '阈值设置不当', color: COLORS.purple },
  DEVICE_PERF: { label: '设备性能不足', color: COLORS.warning },
  USER_OP: { label: '用户操作/机位问题', color: COLORS.default },
  OTHER: { label: '其他', color: COLORS.default },
};

export const AUDIT_MODULE_MAP: ColorMap<AuditModule> = {
  AUTH: { label: '鉴权', color: COLORS.default },
  ADMIN: { label: '账号', color: COLORS.default },
  FILE: { label: '文件', color: COLORS.default },
  APP_VERSION: { label: 'APP 版本', color: COLORS.info },
  MODEL: { label: '模型', color: COLORS.purple },
  MISREPORT: { label: '误报', color: COLORS.danger },
  DASHBOARD: { label: '看板', color: COLORS.default },
  SITE_CONFIG: { label: '系统设置', color: COLORS.primary },
};

export const AUDIT_ACTION_MAP: ColorMap<AuditAction> = {
  LOGIN: { label: '登录', color: COLORS.success },
  LOGIN_FAIL: { label: '登录失败', color: COLORS.danger },
  LOGOUT: { label: '登出', color: COLORS.default },
  CREATE: { label: '新建', color: COLORS.success },
  UPDATE: { label: '更新', color: COLORS.info },
  DELETE: { label: '删除', color: COLORS.danger },
  PUBLISH: { label: '发布', color: COLORS.success },
  PUBLISH_GRAY: { label: '灰度发布', color: COLORS.warning },
  PUBLISH_ONLINE: { label: '上架', color: COLORS.success },
  OFFLINE: { label: '下架', color: COLORS.warning },
  DISPATCH: { label: '下发', color: COLORS.purple },
  ROLLBACK: { label: '回滚', color: COLORS.warning },
  RETRY: { label: '重试', color: COLORS.info },
  REVIEW: { label: '复核', color: COLORS.accent },
  ASSIGN: { label: '指派', color: COLORS.info },
  BATCH_REVIEW: { label: '批量复核', color: COLORS.accent },
  BATCH_ASSIGN: { label: '批量指派', color: COLORS.info },
  EXPORT: { label: '导出', color: COLORS.default },
  UPLOAD: { label: '上传', color: COLORS.default },
};

export const AUDIT_RESULT_MAP: ColorMap<AuditResult> = {
  SUCCESS: { label: '成功', color: COLORS.success },
  FAIL: { label: '失败', color: COLORS.danger },
};

/** 生成 Select 选项 */
export function enumOptions<T extends string>(map: ColorMap<T>): { value: T; label: string }[] {
  return (Object.keys(map) as T[]).map((k) => ({ value: k, label: map[k].label }));
}
