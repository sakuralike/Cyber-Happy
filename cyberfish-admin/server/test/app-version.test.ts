import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppVersionSchema } from '../src/modules/app-version/schema';

const serverDir = process.cwd();
const testDir = mkdtempSync(join(serverDir, 'prisma', 'cyberfish-app-version-'));
const testDatabase = join(testDir, 'app-version.db');
writeFileSync(testDatabase, '');
const databasePath = `./${relative(join(serverDir, 'prisma'), testDatabase).replaceAll('\\', '/')}`;
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${databasePath}`;

let prisma: any;
let service: typeof import('../src/modules/app-version/service');

before(async () => {
  const prismaCli = join(serverDir, '..', 'node_modules/prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
    stdio: 'pipe',
  });
  ({ prisma } = await import('../src/lib/prisma'));
  service = await import('../src/modules/app-version/service');
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(testDir, { recursive: true, force: true });
});

describe('app version download modes', () => {
  async function createApk(label: string, sha256: string, size: number) {
    return prisma.fileAsset.create({
      data: {
        bizType: 'APK', originalName: `${label}.apk`, filename: `${label}.apk`,
        storagePath: `/tmp/${label}.apk`, url: `/files/apk/${label}.apk`,
        mimeType: 'application/vnd.android.package-archive', size: BigInt(size), sha256,
      },
    });
  }

  it('validates external and server address contracts', () => {
    assert.equal(createAppVersionSchema.safeParse({
      versionName: '2.0.0', versionCode: 200, downloadMode: 'EXTERNAL', apkUrl: 'https://disk.example/app',
    }).success, true);
    assert.equal(createAppVersionSchema.safeParse({
      versionName: '2.0.1', versionCode: 201, downloadMode: 'SERVER', apkUrl: 'https://download.example/app.apk',
    }).success, false);
    assert.equal(createAppVersionSchema.safeParse({
      versionName: '2.0.2', versionCode: 202, downloadMode: 'SERVER', apkUrl: 'https://download.example/app.apk', apkSize: 1234, apkSha256: 'a'.repeat(64),
    }).success, false);
    assert.equal(createAppVersionSchema.safeParse({
      versionName: '2.0.2', versionCode: 202, downloadMode: 'SERVER', apkFileId: 'file-1',
    }).success, true);
    assert.equal(createAppVersionSchema.safeParse({
      versionName: '2.0.3', versionCode: 203, downloadMode: 'EXTERNAL', apkUrl: 'file:///opt/app.apk',
    }).success, false);
  });

  it('publishes both modes and returns an explicit mode to the APP', async () => {
    const external = await service.create({
      versionName: '2.1.0', versionCode: 210, platform: 'ANDROID', channel: 'official', updateType: 'OPTIONAL',
      releaseNotes: '', downloadMode: 'EXTERNAL', apkUrl: 'https://disk.example/app',
    });
    await service.doAction(external.id, { action: 'PUBLISH_ONLINE' });
    const externalCheck = await service.checkUpdate({ versionCode: 209, deviceId: 'external-device', platform: 'ANDROID', channel: 'official' });
    assert.equal(externalCheck.latest?.downloadMode, 'EXTERNAL');
    assert.equal(externalCheck.latest?.sha256, null);

    const apk = await createApk('server-release', 'b'.repeat(64), 1234);
    const server = await service.create({
      versionName: '2.2.0', versionCode: 220, platform: 'ANDROID', channel: 'official', updateType: 'OPTIONAL',
      releaseNotes: '', downloadMode: 'SERVER', apkFileId: apk.id,
    });
    await service.doAction(server.id, { action: 'PUBLISH_ONLINE' });
    const serverCheck = await service.checkUpdate({ versionCode: 219, deviceId: 'server-device', platform: 'ANDROID', channel: 'official' });
    assert.equal(serverCheck.latest?.downloadMode, 'SERVER');
    assert.equal(serverCheck.latest?.apkUrl, `/api/v1/files/${apk.id}/download`);
    assert.equal(serverCheck.latest?.apkSize, 1234);
    assert.equal(serverCheck.latest?.sha256, 'b'.repeat(64));
  });

  it('clears mode-specific metadata when switching back to an external link', async () => {
    const apk = await createApk('beta-release', 'c'.repeat(64), 4321);
    const created = await service.create({
      versionName: '2.3.0', versionCode: 230, platform: 'ANDROID', channel: 'beta', updateType: 'OPTIONAL',
      releaseNotes: '', downloadMode: 'SERVER', apkFileId: apk.id,
    });
    const { after } = await service.update(created.id, {
      downloadMode: 'EXTERNAL', apkUrl: 'https://disk.example/beta', apkSize: null, apkSha256: null, apkFileId: null,
    });
    assert.equal(after.downloadMode, 'EXTERNAL');
    assert.equal(after.apkUrl, 'https://disk.example/beta');
    assert.equal(after.apkSize, null);
    assert.equal(after.apkSha256, null);
    assert.equal(after.apkFileId, null);

    const external = await service.create({
      versionName: '2.3.1', versionCode: 231, platform: 'ANDROID', channel: 'internal', updateType: 'OPTIONAL',
      releaseNotes: '', downloadMode: 'EXTERNAL', apkUrl: 'https://disk.example/internal',
    });
    await assert.rejects(
      service.update(external.id, {
        downloadMode: 'SERVER', apkUrl: null, apkFileId: null,
      }),
      /上传 APK/,
    );

    const invalid = await prisma.appVersion.create({
      data: {
        versionName: '2.3.2', versionCode: 232, platform: 'ANDROID', channel: 'invalid',
        updateType: 'OPTIONAL', downloadMode: 'SERVER', apkUrl: 'https://download.example/invalid.apk',
      },
    });
    await assert.rejects(service.doAction(invalid.id, { action: 'PUBLISH_ONLINE' }), /上传 APK/);
  });
});
