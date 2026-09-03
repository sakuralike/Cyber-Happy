/** JSON 序列化：处理 BigInt（SQLite/PG 的 size 字段）与 Date */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export function toJsonString(value: unknown): string {
  return JSON.stringify(value, jsonReplacer);
}

/** 安全解析 JSON 字符串，失败返回 fallback */
export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 递归把对象中的 BigInt 转为 string，便于直接返回给前端 */
export function serializeBigInt<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString() as unknown as T;
  if (Array.isArray(value)) return value.map((v) => serializeBigInt(v)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeBigInt(v);
    }
    return out as T;
  }
  return value;
}
