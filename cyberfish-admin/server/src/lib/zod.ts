import { z } from 'zod';

/** 通用列表查询参数（所有列表页继承） */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  keyword: z.string().trim().optional(),
  sortBy: z.string().trim().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/** 逗号分隔枚举 → 直接透传给 buildListQuery 的 enumFilters */
export const csvEnum = z.string().trim().optional();

export const idParamSchema = z.object({ id: z.string().min(1, 'id 不能为空') });

/** 可选日期字符串 */
export const dateStr = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), '日期格式不合法')
  .optional();

/** 时间范围查询（看板与列表共用） */
export const rangeQuerySchema = z.object({
  from: dateStr,
  to: dateStr,
  appVersionCode: z.coerce.number().int().optional(),
  modelVersion: z.string().trim().optional(),
  channel: z.string().trim().optional(),
  granularity: z.enum(['day', 'week']).default('day'),
});

export type RangeQuery = z.infer<typeof rangeQuerySchema>;

/** zod 解析并在失败时抛出结构化 AppError（由 error-handler 统一转 422） */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}
