import fs from 'node:fs';
import { FileBizType } from '../../lib/enums';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { saveStream, validateUpload, resolveStoredFile, removeFile, uploadRule } from '../../lib/storage';
import type { Readable } from 'node:stream';
import { Prisma } from '@prisma/client';

export async function upload(
  stream: Readable,
  bizType: FileBizType,
  originalName: string,
  mimeType: string,
  uploadedById?: string,
  expectedSha256?: string,
  ownerUserId?: string,
  deviceId?: string,
  idempotencyKey?: string,
) {
  if (idempotencyKey) {
    const existing = await prisma.fileAsset.findUnique({ where: { idempotencyKey } });
    if (existing) {
      assertIdempotentAsset(existing, { bizType, mimeType, expectedSha256, ownerUserId, deviceId });
      return normalizeAsset(existing);
    }
  }
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
  if (expectedSha256 && saved.sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    await removeFile(saved.storagePath);
    throw new AppError(40100, '媒体内容摘要与设备签名不一致', 401);
  }

  let asset;
  try {
    asset = await prisma.fileAsset.create({
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
        ownerUserId: ownerUserId ?? null,
        deviceId: deviceId ?? null,
        idempotencyKey: idempotencyKey ?? null,
      },
    });
  } catch (error) {
    await removeFile(saved.storagePath);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && idempotencyKey) {
      const existing = await prisma.fileAsset.findUnique({ where: { idempotencyKey } });
      if (existing) {
        assertIdempotentAsset(existing, { bizType, mimeType, expectedSha256, ownerUserId, deviceId });
        return normalizeAsset(existing);
      }
    }
    throw error;
  }

  return normalizeAsset(asset);
}

function assertIdempotentAsset(
  asset: {
    bizType: string;
    mimeType: string;
    size: bigint;
    sha256: string;
    ownerUserId: string | null;
    deviceId: string | null;
    status: string;
  },
  expected: {
    bizType: FileBizType;
    mimeType: string;
    expectedSha256?: string;
    ownerUserId?: string;
    deviceId?: string;
  },
): void {
  const ownerMatches = asset.ownerUserId === (expected.ownerUserId ?? null);
  const deviceMatches = asset.deviceId === (expected.deviceId ?? null);
  const hashMatches = !expected.expectedSha256 || asset.sha256.toLowerCase() === expected.expectedSha256.toLowerCase();
  const rule = uploadRule(expected.bizType);
  const contentMatches = asset.mimeType === expected.mimeType && asset.status === 'READY' && asset.size > 0n && asset.size <= BigInt(rule.maxSize);
  if (asset.bizType !== expected.bizType || !ownerMatches || !deviceMatches || !hashMatches || !contentMatches) {
    throw AppError.conflict('媒体幂等键已绑定其他资产');
  }
}

function normalizeAsset(asset: {
  id: string;
  bizType: string;
  originalName: string;
  filename: string;
  size: bigint;
  sha256: string;
  url: string;
  createdAt: Date;
}) {
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
