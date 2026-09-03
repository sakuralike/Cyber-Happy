import { http } from './client';
import type {
  MlModel,
  ModelDispatch,
  DeviceDispatchLog,
  PageData,
  ListParams,
  QuantType,
  Framework,
  DispatchTargetType,
} from './types';

export async function listModels(params: ListParams): Promise<PageData<MlModel>> {
  return http.get('/models', { params }) as Promise<PageData<MlModel>>;
}

export async function getModel(id: string): Promise<MlModel> {
  return http.get(`/models/${id}`) as Promise<MlModel>;
}

export interface CreateModelInput {
  modelVersion: string;
  name: string;
  arch?: string;
  quant?: QuantType;
  framework?: Framework;
  fileId?: string;
  inputSize?: number;
  numClasses?: number;
  labels?: string[];
  map50?: number;
  map50_95?: number;
  precision?: number;
  recall?: number;
  avgLatencyMs?: number;
  minAppCode?: number;
  maxAppCode?: number;
  remark?: string;
}

export async function createModel(input: CreateModelInput): Promise<MlModel> {
  return http.post('/models', input) as Promise<MlModel>;
}

export async function updateModel(id: string, input: Partial<CreateModelInput>): Promise<MlModel> {
  return http.patch(`/models/${id}`, input) as Promise<MlModel>;
}

export async function deleteModel(id: string): Promise<{ id: string; deleted: boolean }> {
  return http.delete(`/models/${id}`) as Promise<{ id: string; deleted: boolean }>;
}

export interface DispatchInput {
  targetType: DispatchTargetType;
  targetValue: Record<string, unknown>;
  grayPercent?: number;
  appVersionId?: string;
  remark?: string;
}

export async function dispatchModel(id: string, input: DispatchInput): Promise<ModelDispatch> {
  return http.post(`/models/${id}/dispatch`, input) as Promise<ModelDispatch>;
}

export async function rollbackModel(
  id: string,
  input: { toModelId: string; reason: string; scope?: 'ALL' | 'FAILED_ONLY' },
): Promise<{ rollbackDispatchId: string; from: { id: string; modelVersion: string }; to: { id: string; modelVersion: string }; affectedDevices: number }> {
  return http.post(`/models/${id}/rollback`, input) as Promise<never>;
}

export async function listDispatches(params: ListParams): Promise<PageData<ModelDispatch>> {
  return http.get('/models/dispatches', { params }) as Promise<PageData<ModelDispatch>>;
}

export async function listModelDispatches(modelId: string, params: ListParams): Promise<PageData<ModelDispatch>> {
  return http.get(`/models/${modelId}/dispatches`, { params }) as Promise<PageData<ModelDispatch>>;
}

export async function listDeviceLogs(dispatchId: string, params: ListParams): Promise<PageData<DeviceDispatchLog>> {
  return http.get(`/models/dispatches/${dispatchId}/devices`, { params }) as Promise<PageData<DeviceDispatchLog>>;
}

export async function retryDispatch(dispatchId: string): Promise<{ dispatchId: string; retried: number }> {
  return http.post(`/models/dispatches/${dispatchId}/retry`) as Promise<{ dispatchId: string; retried: number }>;
}
