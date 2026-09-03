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

export const ROLE_MAP: ColorMap<AdminRole> = {
  ADMIN: { label: '管理员', color: 'red' },
  OPERATOR: { label: '运营', color: 'blue' },
  REVIEWER: { label: '复核员', color: 'gold' },
  VIEWER: { label: '只读', color: 'default' },
};

export const ACTIVE_STATUS_MAP: ColorMap<ActiveStatus> = {
  ACTIVE: { label: '启用', color: 'green' },
  DISABLED: { label: '禁用', color: 'default' },
};

export const PLATFORM_MAP: ColorMap<Platform> = {
  ANDROID: { label: 'Android', color: 'green' },
  IOS: { label: 'iOS', color: 'blue' },
  HARMONY: { label: 'HarmonyOS', color: 'purple' },
};

export const UPDATE_TYPE_MAP: ColorMap<UpdateType> = {
  FORCE: { label: '强制更新', color: 'red' },
  OPTIONAL: { label: '可选更新', color: 'blue' },
  NONE: { label: '不提示', color: 'default' },
};

export const RELEASE_STATUS_MAP: ColorMap<ReleaseStatus> = {
  DRAFT: { label: '草稿', color: 'default' },
  GRAY: { label: '灰度中', color: 'gold' },
  ONLINE: { label: '已上架', color: 'green' },
  OFFLINE: { label: '已下架', color: 'red' },
};

export const QUANT_MAP: ColorMap<QuantType> = {
  INT8: { label: 'INT8', color: 'green' },
  FP16: { label: 'FP16', color: 'blue' },
  FP32: { label: 'FP32', color: 'purple' },
};

export const FRAMEWORK_MAP: ColorMap<Framework> = {
  TFLITE: { label: 'TFLite', color: 'green' },
  ONNX: { label: 'ONNX', color: 'blue' },
  NCNN: { label: 'NCNN', color: 'purple' },
};

export const MODEL_STATUS_MAP: ColorMap<ModelStatus> = {
  DRAFT: { label: '草稿', color: 'default' },
  GRAY: { label: '灰度中', color: 'gold' },
  ONLINE: { label: '已上线', color: 'green' },
  OFFLINE: { label: '已下线', color: 'red' },
  ROLLBACK: { label: '已回滚', color: 'orange' },
};

export const DISPATCH_TARGET_MAP: ColorMap<DispatchTargetType> = {
  GLOBAL: { label: '全量', color: 'green' },
  APP_VERSION: { label: '按 APP 版本', color: 'blue' },
  DEVICE_GROUP: { label: '按设备分组', color: 'purple' },
  DEVICE_ID: { label: '按设备白名单', color: 'cyan' },
};

export const DISPATCH_STATUS_MAP: ColorMap<DispatchStatus> = {
  PENDING: { label: '待下发', color: 'default' },
  DISPATCHING: { label: '下发中', color: 'processing' },
  SUCCESS: { label: '全部成功', color: 'green' },
  PARTIAL: { label: '部分成功', color: 'gold' },
  FAILED: { label: '失败', color: 'red' },
  ROLLED_BACK: { label: '已回滚', color: 'orange' },
};

export const DEVICE_DISPATCH_STATUS_MAP: ColorMap<DeviceDispatchStatus> = {
  PENDING: { label: '待下发', color: 'default' },
  DOWNLOADING: { label: '下载中', color: 'processing' },
  SUCCESS: { label: '成功', color: 'green' },
  FAILED: { label: '失败', color: 'red' },
  ROLLED_BACK: { label: '已回滚', color: 'orange' },
};

export const REPORT_TYPE_MAP: ColorMap<ReportType> = {
  FALSE_POSITIVE: { label: '误报', color: 'red' },
  MISSED: { label: '漏报', color: 'orange' },
  MISIDENTIFY: { label: '误识别', color: 'purple' },
};

export const MISREPORT_STATUS_MAP: ColorMap<MisreportStatus> = {
  PENDING: { label: '待处理', color: 'default' },
  REVIEWING: { label: '复核中', color: 'processing' },
  CONFIRMED: { label: '已确认', color: 'red' },
  REJECTED: { label: '已驳回', color: 'green' },
  RESOLVED: { label: '已解决', color: 'blue' },
  CLOSED: { label: '已关闭', color: 'default' },
};

export const SEVERITY_MAP: ColorMap<Severity> = {
  LOW: { label: '低', color: 'default' },
  MEDIUM: { label: '中', color: 'gold' },
  HIGH: { label: '高', color: 'red' },
};

export const GROUND_TRUTH_MAP: ColorMap<GroundTruth> = {
  TRUE_FISH: { label: '确实上鱼', color: 'green' },
  FALSE_ALARM: { label: '确属误触发', color: 'red' },
};

export const ROOT_CAUSE_MAP: ColorMap<RootCause> = {
  WATER_REFLECTION: { label: '水面反光', color: 'cyan' },
  OCCLUSION: { label: '遮挡（浮萍/杂物）', color: 'blue' },
  LIGHT: { label: '光照（强光/逆光/夜钓）', color: 'gold' },
  MODEL_LIMIT: { label: '模型能力不足', color: 'red' },
  THRESHOLD: { label: '阈值设置不当', color: 'purple' },
  DEVICE_PERF: { label: '设备性能不足', color: 'orange' },
  USER_OP: { label: '用户操作/机位问题', color: 'default' },
  OTHER: { label: '其他', color: 'default' },
};

export const AUDIT_MODULE_MAP: ColorMap<AuditModule> = {
  AUTH: { label: '鉴权', color: 'default' },
  ADMIN: { label: '账号', color: 'default' },
  FILE: { label: '文件', color: 'default' },
  APP_VERSION: { label: 'APP 版本', color: 'blue' },
  MODEL: { label: '模型', color: 'purple' },
  MISREPORT: { label: '误报', color: 'red' },
  DASHBOARD: { label: '看板', color: 'default' },
};

export const AUDIT_ACTION_MAP: ColorMap<AuditAction> = {
  LOGIN: { label: '登录', color: 'green' },
  LOGIN_FAIL: { label: '登录失败', color: 'red' },
  LOGOUT: { label: '登出', color: 'default' },
  CREATE: { label: '新建', color: 'green' },
  UPDATE: { label: '更新', color: 'blue' },
  DELETE: { label: '删除', color: 'red' },
  PUBLISH: { label: '发布', color: 'green' },
  PUBLISH_GRAY: { label: '灰度发布', color: 'gold' },
  PUBLISH_ONLINE: { label: '上架', color: 'green' },
  OFFLINE: { label: '下架', color: 'orange' },
  DISPATCH: { label: '下发', color: 'purple' },
  ROLLBACK: { label: '回滚', color: 'orange' },
  RETRY: { label: '重试', color: 'blue' },
  REVIEW: { label: '复核', color: 'cyan' },
  ASSIGN: { label: '指派', color: 'blue' },
  BATCH_REVIEW: { label: '批量复核', color: 'cyan' },
  BATCH_ASSIGN: { label: '批量指派', color: 'blue' },
  EXPORT: { label: '导出', color: 'default' },
  UPLOAD: { label: '上传', color: 'default' },
};

export const AUDIT_RESULT_MAP: ColorMap<AuditResult> = {
  SUCCESS: { label: '成功', color: 'green' },
  FAIL: { label: '失败', color: 'red' },
};

/** 生成 Select 选项 */
export function enumOptions<T extends string>(map: ColorMap<T>): { value: T; label: string }[] {
  return (Object.keys(map) as T[]).map((k) => ({ value: k, label: map[k].label }));
}
