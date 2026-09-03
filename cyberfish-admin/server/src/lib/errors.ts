/** 统一错误码分段：40xxx 认证权限 / 41xxx 资源 / 42xxx 校验 / 50xxx 服务端 */
export const ErrorCode = {
  OK: 0,

  UNAUTHORIZED: 40100,
  TOKEN_EXPIRED: 40101,
  FORBIDDEN: 40300,
  ACCOUNT_DISABLED: 40301,
  ACCOUNT_LOCKED: 40302,
  BAD_CREDENTIALS: 40303,

  NOT_FOUND: 40400,
  CONFLICT: 40900,
  INVALID_STATE: 40901,

  VALIDATION: 42200,
  FILE_TYPE: 42201,
  FILE_TOO_LARGE: 42202,

  INTERNAL: 50000,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  public readonly code: number;
  public readonly httpStatus: number;
  public readonly details?: unknown;

  constructor(code: number, message: string, httpStatus?: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus ?? defaultHttpStatus(code);
    this.details = details;
  }

  static badRequest(message = '请求参数错误', details?: unknown) {
    return new AppError(ErrorCode.VALIDATION, message, 400, details);
  }
  static unauthorized(message = '未登录或登录已过期') {
    return new AppError(ErrorCode.UNAUTHORIZED, message, 401);
  }
  static forbidden(message = '无权限执行该操作') {
    return new AppError(ErrorCode.FORBIDDEN, message, 403);
  }
  static notFound(message = '资源不存在') {
    return new AppError(ErrorCode.NOT_FOUND, message, 404);
  }
  static conflict(message = '资源冲突', details?: unknown) {
    return new AppError(ErrorCode.CONFLICT, message, 409, details);
  }
  static invalidState(message = '当前状态不允许该操作') {
    return new AppError(ErrorCode.INVALID_STATE, message, 409);
  }
  static internal(message = '服务器内部错误') {
    return new AppError(ErrorCode.INTERNAL, message, 500);
  }
}

function defaultHttpStatus(code: number): number {
  if (code === ErrorCode.OK) return 200;
  if (code >= 40100 && code < 40200) return 401;
  if (code >= 40300 && code < 40400) return 403;
  if (code >= 40400 && code < 41000) return 404;
  if (code >= 41000 && code < 42000) return 409;
  if (code >= 42000 && code < 43000) return 422;
  return 500;
}
