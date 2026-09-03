import { http } from './client';
import type { Misreport, MisreportStatusLog, PageData, ListParams, GroundTruth, RootCause, MisreportStatus } from './types';

export async function listMisreports(params: ListParams): Promise<PageData<Misreport>> {
  return http.get('/misreports', { params }) as Promise<PageData<Misreport>>;
}

export async function getMisreport(id: string): Promise<Misreport> {
  return http.get(`/misreports/${id}`) as Promise<Misreport>;
}

export async function getMisreportLogs(id: string): Promise<MisreportStatusLog[]> {
  return http.get(`/misreports/${id}/logs`) as Promise<MisreportStatusLog[]>;
}

export async function reviewMisreport(
  id: string,
  input: {
    status: MisreportStatus;
    groundTruth?: GroundTruth;
    rootCause?: RootCause;
    reviewerNote?: string;
    resolution?: string;
    sceneTags?: string[];
    addToTrainingSet?: boolean;
  },
): Promise<Misreport> {
  return http.post(`/misreports/${id}/review`, input) as Promise<Misreport>;
}

export async function assignMisreport(id: string, input: { assignedToId: string; note?: string }): Promise<Misreport> {
  return http.post(`/misreports/${id}/assign`, input) as Promise<Misreport>;
}

export async function batchMisreports(input: {
  ids: string[];
  action: 'REVIEW' | 'ASSIGN';
  status?: MisreportStatus;
  rootCause?: RootCause;
  reviewerNote?: string;
  assignedToId?: string;
}): Promise<{ affected: number; ids: string[] }> {
  return http.post('/misreports/batch', input) as Promise<{ affected: number; ids: string[] }>;
}

export async function exportMisreportsCsv(params: ListParams): Promise<Blob> {
  const { getToken } = await import('./client');
  const token = getToken();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const resp = await fetch(`/api/v1/misreports/export?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  });
  if (!resp.ok) throw new Error('导出失败');
  return resp.blob();
}

export async function misreportStats(): Promise<{
  total: number;
  trainingSet: number;
  byStatus: { status: string; count: number }[];
  byRootCause: { rootCause: string; count: number }[];
  byType: { reportType: string; count: number }[];
}> {
  return http.get('/misreports/stats') as Promise<never>;
}
