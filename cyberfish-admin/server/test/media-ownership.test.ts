import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const serverDir = process.cwd();
const testDir = mkdtempSync(join(serverDir, 'prisma', 'media-ownership-'));
const testDatabase = join(testDir, 'media-ownership.db');
writeFileSync(testDatabase, '');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${testDatabase.replaceAll('\\', '/')}`;
process.env.UPLOAD_DIR = join(testDir, 'uploads');

let prisma: any;
let service: typeof import('../src/modules/misreport/service');
let fileService: typeof import('../src/modules/file/service');
let userA: { id: string };
let userB: { id: string };

function assetData(overrides: Record<string, unknown> = {}) {
  return {
    bizType: 'IMAGE',
    originalName: 'snapshot.jpg',
    filename: 'snapshot.jpg',
    storagePath: '/tmp/snapshot.jpg',
    url: `/files/images/${crypto.randomUUID()}.jpg`,
    mimeType: 'image/jpeg',
    size: BigInt(128),
    sha256: 'a'.repeat(64),
    ownerUserId: userA.id,
    deviceId: 'device-a',
    ...overrides,
  };
}

function reportInput(userId: string, deviceId: string, media: { snapshotUrls?: string[]; videoUrl?: string } = {}) {
  return {
    userId,
    deviceId,
    reportType: 'FALSE_POSITIVE' as const,
    severity: 'MEDIUM' as const,
    snapshotUrls: media.snapshotUrls,
    videoUrl: media.videoUrl,
  };
}

before(async () => {
  execFileSync(process.execPath, [join(serverDir, '..', 'node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
    cwd: serverDir,
    env: { ...process.env },
    stdio: 'pipe',
  });
  ({ prisma } = await import('../src/lib/prisma'));
  service = await import('../src/modules/misreport/service');
  fileService = await import('../src/modules/file/service');
  userA = await prisma.userAccount.create({ data: { username: 'media-owner-a', passwordHash: 'test', displayName: 'Media A' } });
  userB = await prisma.userAccount.create({ data: { username: 'media-owner-b', passwordHash: 'test', displayName: 'Media B' } });
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(testDir, { recursive: true, force: true });
});

describe('media ownership and idempotency', () => {
  it('accepts READY media only for the same user and device', async () => {
    const image = await prisma.fileAsset.create({ data: assetData() });
    const video = await prisma.fileAsset.create({
      data: assetData({
        bizType: 'VIDEO',
        originalName: 'clip.mp4',
        filename: 'clip.mp4',
        url: `/files/videos/${crypto.randomUUID()}.mp4`,
        mimeType: 'video/mp4',
        size: BigInt(256),
      }),
    });

    const created = await service.create(reportInput(userA.id, 'device-a', {
      snapshotUrls: [image.url],
      videoUrl: video.url,
    }));
    assert.deepEqual(created.snapshotUrls, [image.url]);
    assert.equal(created.videoUrl, video.url);

    await assert.rejects(
      service.create(reportInput(userB.id, 'device-b', { snapshotUrls: [image.url] })),
      (error: unknown) => error instanceof Error && error.message.includes('不存在、未就绪'),
    );
    await assert.rejects(
      service.create(reportInput(userA.id, 'device-other', { snapshotUrls: [image.url] })),
      (error: unknown) => error instanceof Error && error.message.includes('不存在、未就绪'),
    );
  });

  it('rejects deleted, wrong-MIME, and oversized media', async () => {
    const deleted = await prisma.fileAsset.create({ data: assetData({ status: 'DELETED' }) });
    const wrongMime = await prisma.fileAsset.create({ data: assetData({ mimeType: 'image/gif' }) });
    const oversized = await prisma.fileAsset.create({ data: assetData({ size: BigInt(10 * 1024 * 1024 + 1) }) });

    for (const url of [deleted.url, wrongMime.url, oversized.url]) {
      await assert.rejects(
        service.create(reportInput(userA.id, 'device-a', { snapshotUrls: [url] })),
        (error: unknown) => error instanceof Error && error.message.includes('不存在、未就绪'),
      );
    }
  });

  it('returns the owned idempotent asset and rejects a cross-owner key reuse', async () => {
    const content = Buffer.from('idempotent-media');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const idempotencyKey = `device-a:IMAGE:${hash}`;
    const existing = await prisma.fileAsset.create({
      data: assetData({ sha256: hash, idempotencyKey }),
    });
    const beforeCount = await prisma.fileAsset.count();

    const duplicate = await fileService.upload(
      Readable.from(content),
      'IMAGE',
      'snapshot.jpg',
      'image/jpeg',
      undefined,
      hash,
      userA.id,
      'device-a',
      idempotencyKey,
    );
    assert.equal(duplicate.id, existing.id);
    assert.equal(await prisma.fileAsset.count(), beforeCount);

    await assert.rejects(
      fileService.upload(
        Readable.from(content),
        'IMAGE',
        'snapshot.jpg',
        'image/jpeg',
        undefined,
        hash,
        userB.id,
        'device-b',
        idempotencyKey,
      ),
      (error: unknown) => (error as { httpStatus?: number }).httpStatus === 409,
    );
  });
});
