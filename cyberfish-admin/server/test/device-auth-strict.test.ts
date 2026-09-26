import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const serverDir = process.cwd();
const testDir = mkdtempSync(join(serverDir, 'prisma', 'device-auth-strict-'));
const testDatabase = join(testDir, 'strict.db');
writeFileSync(testDatabase, '');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${testDatabase.replaceAll('\\', '/')}`;
process.env.UPLOAD_DIR = join(testDir, 'uploads');
process.env.APP_API_TOKEN = 'strict-legacy-token';
process.env.DEVICE_AUTH_DUAL_MODE = 'false';

let prisma: any;
let app: Awaited<ReturnType<typeof import('../src/app').buildApp>>;

before(async () => {
  execFileSync(process.execPath, [join(serverDir, '..', 'node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
    cwd: serverDir,
    env: { ...process.env },
    stdio: 'pipe',
  });
  ({ prisma } = await import('../src/lib/prisma'));
  app = await (await import('../src/app')).buildApp();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
  rmSync(testDir, { recursive: true, force: true });
});

describe('strict device authentication mode', () => {
  it('rejects the shared APP token for model APIs and enrollment', async () => {
    const modelCheck = await app.inject({
      method: 'GET',
      url: '/api/v1/models/check?appVersionCode=146&deviceId=legacy-device',
      headers: { 'x-app-token': process.env.APP_API_TOKEN! },
    });
    assert.equal(modelCheck.statusCode, 401, modelCheck.body);

    const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const enroll = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/enroll',
      headers: { 'x-app-token': process.env.APP_API_TOKEN! },
      payload: {
        deviceId: 'legacy-device',
        signingPublicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        securityLevel: 'SOFTWARE',
        appVersionCode: 146,
      },
    });
    assert.equal(enroll.statusCode, 401, enroll.body);
  });

  it('allows authenticated APP users to bootstrap a device after the shared token is disabled', async () => {
    const user = await prisma.userAccount.create({ data: {
      username: 'strict-user', passwordHash: 'not-used', displayName: 'Strict User', status: 'ACTIVE',
    } });
    const userToken = app.jwt.sign({ sub: user.id, kind: 'APP_USER' }, { expiresIn: '1h' });
    const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const enroll = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/enroll',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        deviceId: 'strict-device',
        signingPublicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        securityLevel: 'TEE',
        appVersionCode: 146,
      },
    });
    assert.equal(enroll.statusCode, 201, enroll.body);
    const credential = await prisma.appDeviceCredential.findUnique({ where: { deviceId: 'strict-device' } });
    assert.equal(credential.userId, user.id);
  });
});
