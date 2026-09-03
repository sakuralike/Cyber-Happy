import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import crypto from 'node:crypto';
import { config } from '../config';
import { AppError } from './errors';
import { FileBizType } from './enums';

export interface UploadLimits {
  mime: string[];
  extensions?: string[];
  maxSize: number;
}

const UPLOAD_RULES: Record<FileBizType, UploadLimits> = {
  APK: {
    mime: ['application/vnd.android.package-archive', 'application/octet-stream'],
    extensions: ['.apk'],
    maxSize: 200 * 1024 * 1024,
  },
  MODEL: {
    mime: ['application/octet-stream'],
    extensions: ['.tflite', '.onnx', '.bin', '.param'],
    maxSize: 100 * 1024 * 1024,
  },
  IMAGE: {
    mime: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxSize: 10 * 1024 * 1024,
  },
  VIDEO: {
    mime: ['video/mp4'],
    extensions: ['.mp4'],
    maxSize: 50 * 1024 * 1024,
  },
};

const SUBDIR: Record<FileBizType, string> = {
  APK: 'apk',
  MODEL: 'models',
  IMAGE: 'images',
  VIDEO: 'videos',
};

export function uploadRule(bizType: FileBizType): UploadLimits {
  return UPLOAD_RULES[bizType];
}

export function validateUpload(
  bizType: FileBizType,
  originalName: string,
  mimeType: string,
  size: number,
): void {
  const rule = UPLOAD_RULES[bizType];
  const ext = path.extname(originalName).toLowerCase();

  if (rule.extensions?.length && !rule.extensions.includes(ext)) {
    throw new AppError(
      42201,
      `文件类型不允许：${ext || '未知'}，仅支持 ${rule.extensions.join(' / ')}`,
      422,
    );
  }
  if (rule.mime.length && !rule.mime.includes(mimeType)) {
    throw new AppError(42201, `MIME 类型不允许：${mimeType}`, 422);
  }
  if (size > rule.maxSize) {
    throw new AppError(
      42202,
      `文件超过大小限制：${(size / 1024 / 1024).toFixed(1)}MB > ${(rule.maxSize / 1024 / 1024).toFixed(0)}MB`,
      422,
    );
  }
}

export interface SavedFile {
  filename: string;
  storagePath: string;
  url: string;
  size: number;
  sha256: string;
}

/** 流式落盘，边写边算 SHA-256，避免大文件占用内存 */
export async function saveStream(
  stream: Readable,
  bizType: FileBizType,
  originalName: string,
): Promise<SavedFile> {
  const dir = path.join(config.uploadDir, SUBDIR[bizType]);
  await fsp.mkdir(dir, { recursive: true });

  const ext = path.extname(originalName).toLowerCase() || '.bin';
  const base = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')
    .slice(0, 60);
  const hash = crypto.createHash('sha256');
  let size = 0;

  // 先写临时文件，算完 hash 再用 hash 命名，保证内容寻址
  const tmpName = `.tmp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
  const tmpPath = path.join(dir, tmpName);

  const counter = new (await import('node:stream')).Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk);
      size += chunk.length;
      cb(null, chunk);
    },
  });

  await pipeline(stream, counter, fs.createWriteStream(tmpPath));

  const digest = hash.digest('hex');
  const filename = `${base}_${digest.slice(0, 12)}${ext}`;
  const finalPath = path.join(dir, filename);
  await fsp.rename(tmpPath, finalPath);

  return {
    filename,
    storagePath: finalPath,
    url: `/files/${SUBDIR[bizType]}/${filename}`,
    size,
    sha256: digest,
  };
}

export function resolveStoredFile(urlPath: string): string | null {
  // url 形如 /files/apk/xxx.apk
  const rel = urlPath.replace(/^\/files\//, '');
  if (rel.includes('..')) return null;
  const full = path.join(config.uploadDir, rel);
  if (!full.startsWith(config.uploadDir)) return null;
  return fs.existsSync(full) ? full : null;
}

export async function removeFile(storagePath: string): Promise<void> {
  try {
    await fsp.unlink(storagePath);
  } catch {
    /* 文件不存在时忽略 */
  }
}
