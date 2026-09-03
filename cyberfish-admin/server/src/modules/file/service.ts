import fs from 'node:fs';
import { FileBizType } from '../../lib/enums';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { saveStream, validateUpload, resolveStoredFile, removeFile } from '../../lib/storage';
import type { Readable } from 'node:stream';

export async function upload(
  stream: Readable,
  bizType: FileBizType,
  originalName: string,
  mimeType: string,
  uploadedById?: string,
) {
  validateUpload(bizType, originalName, mimeType, 0); // 先校验扩展名/MIME，体积在流中累计后二次校验

  const saved = await saveStream(stream, bizType, originalName);
  const rule = (await import('../../lib/storage')).uploadRule(bizType);
  if (saved.size > rule.maxSize) {
    await removeFile(saved.storagePath);
    throw new AppError(
      42202,
      `文件超过大小限制：${(saved.size / 1024 / 1024).toFixed(1)}MB > ${(rule.maxSize / 1024 / 1024).toFixed(0)}MB`,
      422,
    );
  }
  if (saved.size === 0) {
    await removeFile(saved.storagePath);
    throw new AppError(42200, '上传文件为空', 422);
  }

  const asset = await prisma.fileAsset.create({
    data: {
      bizType,
      originalName,
      filename: saved.filename,
      storagePath: saved.storagePath,
      url: saved.url,
      mimeType,
      size: BigInt(saved.size),
      sha256: saved.sha256,
      uploadedById: uploadedById ?? null,
    },
  });

  return {
    id: asset.id,
    bizType: asset.bizType,
    originalName: asset.originalName,
    filename: asset.filename,
    size: Number(asset.size),
    sha256: asset.sha256,
    url: asset.url,
    createdAt: asset.createdAt,
  };
}

export async function detail(id: string) {
  const asset = await prisma.fileAsset.findUnique({
    where: { id },
    include: { uploadedBy: { select: { id: true, username: true, displayName: true } } },
  });
  if (!asset) throw AppError.notFound('文件不存在');
  return { ...asset, size: Number(asset.size) };
}

export function openStream(urlPath: string): fs.ReadStream | null {
  const full = resolveStoredFile(urlPath);
  return full ? fs.createReadStream(full) : null;
}

export function resolvePath(urlPath: string): string | null {
  return resolveStoredFile(urlPath);
}
