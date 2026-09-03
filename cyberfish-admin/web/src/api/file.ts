import axios from 'axios';
import { getToken } from './client';

export type FileBizType = 'APK' | 'MODEL' | 'IMAGE' | 'VIDEO';

export interface FileAsset {
  id: string;
  bizType: FileBizType;
  originalName: string;
  filename: string;
  size: number;
  sha256: string;
  url: string;
  createdAt: string;
}

/** 上传文件，返回文件资产（带鉴权）。返回 { id } 供后续创建版本/模型时引用 */
export async function uploadFile(bizType: FileBizType, file: File, onProgress?: (pct: number) => void): Promise<FileAsset> {
  const form = new FormData();
  form.append('file', file);

  const resp = await axios.post(`/api/v1/files/upload?bizType=${bizType}`, form, {
    headers: {
      'Content-Type': 'multipart/form-data',
      Authorization: `Bearer ${getToken() ?? ''}`,
    },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });

  const body = resp.data as { code: number; message: string; data: FileAsset };
  if (body.code !== 0) throw new Error(body.message || '上传失败');
  return body.data;
}
