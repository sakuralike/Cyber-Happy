import { http } from './client';
import type { MetricCard } from './types';

export interface DashboardQuery {
  from?: string;
  to?: string;
  appVersionCode?: number;
  modelVersion?: string;
  channel?: string;
  granularity?: 'day' | 'week';
}

export async function overview(params: DashboardQuery): Promise<{
  range: { from: string; to: string; days: number };
  cards: MetricCard[];
  extra: { activeDevices: number; triggers: number; misreportCount: number };
  updatedAt: string;
}> {
  return http.get('/dashboard/overview', { params }) as Promise<never>;
}

export async function trend(params: DashboardQuery): Promise<{
  granularity: string;
  series: { date: string; dau: number; newUsers: number; modelCalls: number; triggers: number; misreports: number; misreportRate: number }[];
}> {
  return http.get('/dashboard/trend', { params }) as Promise<never>;
}

export async function versionDistribution(params: DashboardQuery): Promise<{ versionCode: number; versionName: string; status: string | null; devices: number; ratio: number }[]> {
  return http.get('/dashboard/version-distribution', { params }) as Promise<never>;
}

export async function modelUsage(params: DashboardQuery): Promise<{
  total: number;
  items: { modelVersion: string; calls: number; avgPerCall: number; ratio: number }[];
}> {
  return http.get('/dashboard/model-usage', { params }) as Promise<never>;
}

export async function misreportAnalysis(params: DashboardQuery): Promise<{
  total: number;
  triggers: number;
  overallRate: number;
  trend: { date: string; count: number }[];
  rootCauses: { rootCause: string; count: number; ratio: number }[];
}> {
  return http.get('/dashboard/misreport-analysis', { params }) as Promise<never>;
}

export async function health(params: DashboardQuery): Promise<{
  crashCount: number;
  crashRate: number;
  activeDevices: number;
  inferenceP95Ms: number;
  sampleSize: number;
}> {
  return http.get('/dashboard/health', { params }) as Promise<never>;
}
