import { Tag } from 'antd';

export interface EnumTagProps {
  value: string | null | undefined;
  map: Record<string, { label: string; color: string }>;
}

/** 通用枚举标签 */
export function EnumTag({ value, map }: EnumTagProps) {
  if (!value) return <span>-</span>;
  const meta = map[value];
  if (!meta) return <Tag>{value}</Tag>;
  return <Tag color={meta.color}>{meta.label}</Tag>;
}
