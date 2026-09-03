import dayjs from 'dayjs';

export function formatDateTime(v?: string | Date | null): string {
  if (!v) return '-';
  return dayjs(v).format('YYYY-MM-DD HH:mm:ss');
}

export function formatDate(v?: string | Date | null): string {
  if (!v) return '-';
  return dayjs(v).format('YYYY-MM-DD');
}

export function formatNumber(n?: number | null): string {
  if (n === null || n === undefined) return '-';
  return n.toLocaleString('zh-CN');
}

export function formatSize(bytes?: number | null): string {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatPercent(ratio?: number | null, digits = 2): string {
  if (ratio === null || ratio === undefined) return '-';
  return `${(ratio * 100).toFixed(digits)}%`;
}
