import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const serverDir = process.cwd();
const testDir = mkdtempSync(join(serverDir, 'prisma', 'device-auth-'));
const testDatabase = join(testDir, 'device-auth.db');
writeFileSync(testDatabase, '');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${testDatabase.replaceAll('\\', '/')}`;
process.env.UPLOAD_DIR = join(testDir, 'uploads');
process.env.APP_API_TOKEN = 'device-auth-test-token';
process.env.DEVICE_AUTH_DUAL_MODE = 'true';
process.env.DEVICE_TOKEN_TTL_SECONDS = '900';
process.env.DEVICE_CHALLENGE_TTL_SECONDS = '300';
process.env.DEVICE_REQUEST_CLOCK_SKEW_SECONDS = '300';

let prisma: any;
let app: Awaited<ReturnType<typeof import('../src/app').buildApp>>;
let signingPrivateKey: crypto.KeyObject;
let signingPublicKey: string;
let credentialId: string;
let deviceId: string;
let signingKeyId: string;
let deviceToken: string;

function canonicalJson(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(urlText: string): string {
  const url = new URL(urlText, 'http://test.local');
  const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  return [...url.searchParams.entries()]
    .sort(([ak, av], [bk, bv]) => compare(ak, bk) || compare(av, bv))
    .map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`)
    .join('&');
}

function signedHeaders(input: {
  method: string;
  url: string;
  body?: unknown;
  token?: string;
  timestamp?: number;
  nonce?: string;
}) {
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const nonce = input.nonce ?? crypto.randomBytes(18).toString('base64url');
  const bodyHash = crypto.createHash('sha256').update(canonicalJson(input.body), 'utf8').digest('hex');
  const url = new URL(input.url, 'http://test.local');
  const canonical = [
    'CYBERFISH-REQUEST-V1',
    input.method.toUpperCase(),
    url.pathname,
    canonicalQuery(input.url),
    bodyHash,
    timestamp,
    nonce,
  ].join('\n');
  return {
    'x-device-authorization': `Device ${input.token ?? deviceToken}`,
    'x-device-id': deviceId,
    'x-device-key-id': signingKeyId,
    'x-timestamp': timestamp,
    'x-nonce': nonce,
    'x-body-sha256': bodyHash,
    'x-device-signature': crypto.sign('sha256', Buffer.from(canonical, 'utf8'), signingPrivateKey).toString('base64'),
  };
}

before(async () => {
  execFileSync(process.execPath, [join(serverDir, '..', 'node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
    cwd: serverDir,
    env: { ...process.env },
    stdio: 'pipe',
  });
  ({ prisma } = await import('../src/lib/prisma'));
  app = await (await import('../src/app')).buildApp();
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  signingPrivateKey = pair.privateKey;
  signingPublicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
  rmSync(testDir, { recursive: true, force: true });
});

describe('device credential authentication', () => {
  it('enrolls a P-256 credential and exchanges a one-time challenge for a scoped token', async () => {
    deviceId = 'device-auth-1';
    const enroll = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/enroll',
      headers: { 'x-app-token': process.env.APP_API_TOKEN! },
      payload: { deviceId, signingPublicKey, securityLevel: 'TEE', appVersionCode: 146 },
    });
    assert.equal(enroll.statusCode, 201, enroll.body);
    credentialId = enroll.json().data.credentialId;
    signingKeyId = enroll.json().data.signingKeyId;
    assert.match(signingKeyId, /^ec-[a-f0-9]{32}$/);
    assert.ok(enroll.json().data.scopes.includes('model:key-register'));

    const challengeResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/challenges',
      payload: { deviceId, signingKeyId },
    });
    assert.equal(challengeResponse.statusCode, 201, challengeResponse.body);
    const challenge = challengeResponse.json().data;
    const canonical = [
      'CYBERFISH-DEVICE-AUTH-V1',
      'TOKEN',
      deviceId,
      signingKeyId,
      challenge.challengeId,
      challenge.challenge,
      challenge.expiresAt,
    ].join('\n');
    const payload = {
      deviceId,
      signingKeyId,
      challengeId: challenge.challengeId,
      challenge: challenge.challenge,
      signature: crypto.sign('sha256', Buffer.from(canonical, 'utf8'), signingPrivateKey).toString('base64'),
    };
    const tokenResponse = await app.inject({ method: 'POST', url: '/api/v1/devices/token', payload });
    assert.equal(tokenResponse.statusCode, 200, tokenResponse.body);
    deviceToken = tokenResponse.json().data.token;
    assert.equal(tokenResponse.json().data.tokenType, 'Device');
    const claims = app.jwt.verify(deviceToken) as any;
    assert.equal(claims.kind, 'DEVICE');
    assert.equal(claims.deviceId, deviceId);
    assert.equal(claims.keyId, signingKeyId);

    const replayChallenge = await app.inject({ method: 'POST', url: '/api/v1/devices/token', payload });
    assert.equal(replayChallenge.statusCode, 409, replayChallenge.body);
  });

  it('refreshes only signed requests and rejects nonce replay, stale timestamps, and body tampering', async () => {
    const body = {};
    const headers = signedHeaders({ method: 'POST', url: '/api/v1/devices/refresh', body });
    const refresh = await app.inject({ method: 'POST', url: '/api/v1/devices/refresh', headers, payload: body });
    assert.equal(refresh.statusCode, 200, refresh.body);
    assert.notEqual(refresh.json().data.token, deviceToken);

    const replay = await app.inject({ method: 'POST', url: '/api/v1/devices/refresh', headers, payload: body });
    assert.equal(replay.statusCode, 409, replay.body);

    const staleHeaders = signedHeaders({
      method: 'POST',
      url: '/api/v1/devices/refresh',
      body,
      timestamp: Math.floor(Date.now() / 1000) - 301,
    });
    const stale = await app.inject({ method: 'POST', url: '/api/v1/devices/refresh', headers: staleHeaders, payload: body });
    assert.equal(stale.statusCode, 401, stale.body);

    const tamperedHeaders = signedHeaders({ method: 'POST', url: '/api/v1/devices/refresh', body: { changed: false } });
    const tampered = await app.inject({ method: 'POST', url: '/api/v1/devices/refresh', headers: tamperedHeaders, payload: body });
    assert.equal(tampered.statusCode, 401, tampered.body);
  });

  it('binds a model key using device and user identities on the same request', async () => {
    const user = await prisma.userAccount.create({ data: {
      username: 'device-auth-user', passwordHash: 'not-used', displayName: 'Device User', status: 'ACTIVE',
    } });
    const userToken = app.jwt.sign({ sub: user.id, kind: 'APP_USER' }, { expiresIn: '1h' });
    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const body = {
      deviceId,
      publicKey: rsa.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      algorithm: 'RSA_OAEP_SHA256',
      securityLevel: 'TEE',
      appVersionCode: 146,
    };
    const url = '/api/v1/models/devices/register';
    const headers = { ...signedHeaders({ method: 'POST', url, body }), authorization: `Bearer ${userToken}` };
    const response = await app.inject({ method: 'POST', url, headers, payload: body });
    assert.equal(response.statusCode, 200, response.body);

    const credential = await prisma.appDeviceCredential.findUnique({ where: { id: credentialId } });
    const modelKey = await prisma.modelDeviceKey.findUnique({ where: { deviceId } });
    assert.equal(credential.userId, user.id);
    assert.equal(credential.modelKeyId, modelKey.keyId);
    assert.equal(modelKey.userId, user.id);

    const checkUrl = `/api/v1/models/check?keyId=${encodeURIComponent(modelKey.keyId)}&deviceId=${encodeURIComponent(deviceId)}&appVersionCode=146`;
    const check = await app.inject({
      method: 'GET',
      url: checkUrl,
      headers: signedHeaders({ method: 'GET', url: checkUrl }),
    });
    assert.equal(check.statusCode, 200, check.body);
    assert.equal(check.json().data.hasUpdate, false);
  });

  it('rejects a wrong signing key id and revokes outstanding device tokens', async () => {
    const url = '/api/v1/devices/refresh';
    const body = {};
    const wrongKey = signedHeaders({ method: 'POST', url, body });
    wrongKey['x-device-key-id'] = 'ec-wrong';
    const wrongKeyResponse = await app.inject({ method: 'POST', url, headers: wrongKey, payload: body });
    assert.equal(wrongKeyResponse.statusCode, 401, wrongKeyResponse.body);

    const admin = await prisma.adminUser.create({ data: {
      username: 'device-auth-admin', passwordHash: 'not-used', displayName: 'Admin', role: 'ADMIN', status: 'ACTIVE',
    } });
    const adminToken = app.jwt.sign({ sub: admin.id, role: 'ADMIN', username: admin.username }, { expiresIn: '1h' });
    const revoke = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/devices/${credentialId}/revoke`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(revoke.statusCode, 200, revoke.body);
    assert.equal(revoke.json().data.status, 'REVOKED');

    const revokedHeaders = signedHeaders({ method: 'POST', url, body });
    const revoked = await app.inject({ method: 'POST', url, headers: revokedHeaders, payload: body });
    assert.equal(revoked.statusCode, 401, revoked.body);
    const modelKey = await prisma.modelDeviceKey.findUnique({ where: { deviceId } });
    assert.ok(modelKey.revokedAt);
  });
});
