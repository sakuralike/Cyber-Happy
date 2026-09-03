import { AppError } from './errors';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 200;

export interface RawListQuery {
  page?: unknown;
  pageSize?: unknown;
  keyword?: unknown;
  sortBy?: unknown;
  sortOrder?: unknown;
  [key: string]: unknown;
}

export interface ListQueryOptions {
  /** keyword 模糊匹配的字段名（OR 关系）。SQLite 不支持 mode:insensitive，用 contains 即可 */
  keywordFields?: string[];
  /** 枚举筛选：支持逗号分隔多选 → IN 查询 */
  enumFilters?: string[];
  /** 精确匹配筛选 */
  exactFilters?: string[];
  /** 数字精确筛选（会自动转 Number，非法值忽略） */
  numberFilters?: string[];
  /** 时间范围筛选：{ 字段名: [fromKey, toKey] } */
  rangeFilters?: Record<string, [string, string]>;
  /** 允许排序的字段白名单 */
  sortWhitelist?: string[];
  /** 默认排序 */
  defaultSort?: Record<string, 'asc' | 'desc'>;
}

export interface BuiltListQuery {
  where: Record<string, unknown>;
  orderBy: Record<string, 'asc' | 'desc'>;
  skip: number;
  take: number;
  page: number;
  pageSize: number;
}

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function splitMulti(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 统一构造 Prisma 分页 / 搜索 / 筛选查询。
 * 所有列表页复用，保证分页、搜索、筛选行为完全一致。
 */
export function buildListQuery(
  q: RawListQuery,
  options: ListQueryOptions = {},
): BuiltListQuery {
  const pageNum = toInt(q.page, DEFAULT_PAGE);
  const pageSizeRaw = toInt(q.pageSize, DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(pageSizeRaw, MAX_PAGE_SIZE);

  const and: Record<string, unknown>[] = [];

  // ---- 关键字搜索 ----
  const keyword = typeof q.keyword === 'string' ? q.keyword.trim() : '';
  if (keyword && options.keywordFields?.length) {
    and.push({
      OR: options.keywordFields.map((field) => ({ [field]: { contains: keyword } })),
    });
  }

  // ---- 枚举筛选（逗号分隔 → IN）----
  for (const key of options.enumFilters ?? []) {
    const values = splitMulti(q[key]);
    if (values.length === 1) and.push({ [key]: values[0] });
    else if (values.length > 1) and.push({ [key]: { in: values } });
  }

  // ---- 精确筛选 ----
  for (const key of options.exactFilters ?? []) {
    const v = q[key];
    if (v !== undefined && v !== null && v !== '') and.push({ [key]: String(v) });
  }

  // ---- 数字筛选 ----
  for (const key of options.numberFilters ?? []) {
    const v = q[key];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) and.push({ [key]: n });
  }

  // ---- 时间范围 ----
  for (const [field, [fromKey, toKey]] of Object.entries(options.rangeFilters ?? {})) {
    const from = parseDate(q[fromKey]);
    const to = parseDate(q[toKey]);
    const cond: Record<string, Date> = {};
    if (from) cond.gte = from;
    if (to) {
      // 闭区间：to 为纯日期时补齐到当日 23:59:59.999
      const t = new Date(to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(q[toKey]).trim())) {
        t.setHours(23, 59, 59, 999);
      }
      cond.lte = t;
    }
    if (cond.gte || cond.lte) and.push({ [field]: cond });
  }

  // ---- 排序 ----
  const whitelist = options.sortWhitelist ?? [];
  const sortBy = typeof q.sortBy === 'string' ? q.sortBy : '';
  const sortOrder = String(q.sortOrder ?? '').toLowerCase() === 'asc' ? 'asc' : 'desc';
  let orderBy: Record<string, 'asc' | 'desc'> = options.defaultSort ?? { createdAt: 'desc' };
  if (sortBy) {
    if (whitelist.length && !whitelist.includes(sortBy)) {
      throw AppError.badRequest(`不允许按字段 ${sortBy} 排序`, { allowed: whitelist });
    }
    orderBy = { [sortBy]: sortOrder };
  }

  return {
    where: and.length ? { AND: and } : {},
    orderBy,
    skip: (pageNum - 1) * pageSize,
    take: pageSize,
    page: pageNum,
    pageSize,
  };
}

/** 构造导出查询（不分页） */
export function buildExportQuery(q: RawListQuery, options: ListQueryOptions = {}) {
  const built = buildListQuery({ ...q, page: 1, pageSize: MAX_PAGE_SIZE }, options);
  return { where: built.where, orderBy: built.orderBy, take: 10000 };
}
