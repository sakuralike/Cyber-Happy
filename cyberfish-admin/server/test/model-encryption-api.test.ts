import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unwrapAndroidOaep } from './model-encryption-helper';

const serverDir = process.cwd();
const testDir = mkdtempSync(join(serverDir, 'prisma', 'model-encryption-api-'));
const testDatabase = join(testDir, 'model-encryption.db');
const uploadDir = join(testDir, 'uploads');
writeFileSync(testDatabase, '');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${testDatabase.replaceAll('\\', '/')}`;
process.env.UPLOAD_DIR = uploadDir;
process.env.APP_API_TOKEN = 'model-encryption-test-token';

let prisma: any;
let app: Awaited<ReturnType<typeof import('../src/app').buildApp>>;

before(async () => {
  mkdirSync(uploadDir, { recursive: true });
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

describe('encrypted model API', () => {
  it('registers a device key, returns only an encrypted URL, and blocks the raw model path', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicKeyText = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const plaintext = Buffer.from('ncnn-api-fixture');
    const modelDir = join(uploadDir, 'models');
    mkdirSync(modelDir, { recursive: true });
    const modelPath = join(modelDir, 'fixture.bin');
    writeFileSync(modelPath, plaintext);
    const sha256 = crypto.createHash('sha256').update(plaintext).digest('hex');
    const asset = await prisma.fileAsset.create({ data: {
      bizType: 'MODEL', originalName: 'fixture.bin', filename: 'fixture.bin', storagePath: modelPath,
      url: '/files/models/fixture.bin', mimeType: 'application/octet-stream', size: BigInt(plaintext.length), sha256,
    } });
    const model = await prisma.mlModel.create({ data: {
      modelVersion: 'encrypted-v1', name: 'encrypted-v1', arch: 'YOLO26n', quant: 'FP32', framework: 'NCNN',
      fileUrl: asset.url, fileSize: asset.size, sha256, fileId: asset.id, status: 'ONLINE', labels: '["fish_float"]',
      signature: 'test', signatureAlgorithm: 'ECDSA_P256_SHA256', publicKeyId: 'test-key',
    } });
    const headers = { 'x-app-token': process.env.APP_API_TOKEN };
    const register = await app.inject({ method: 'POST', url: '/api/v1/models/devices/register', headers, payload: {
      deviceId: 'device-api-1', publicKey: publicKeyText, algorithm: 'RSA_OAEP_SHA256', securityLevel: 'SOFTWARE', appVersionCode: 145,
    } });
    assert.equal(register.statusCode, 200);
    const keyId = register.json().data.keyId as string;
    const check = await app.inject({ method: 'GET', url: `/api/v1/models/check?appVersionCode=145&deviceId=device-api-1&keyId=${keyId}`, headers });
    assert.equal(check.statusCode, 200);
    const data = check.json().data;
    assert.equal(data.model.encrypted, true);
    assert.match(data.model.url, /^\/api\/v1\/models\/encrypted\//);
    assert.notEqual(data.model.url, asset.url);
    const download = await app.inject({ method: 'GET', url: data.model.url, headers });
    assert.equal(download.statusCode, 200);
    const raw = await app.inject({ method: 'GET', url: asset.url, headers });
    assert.equal(raw.statusCode, 403);
    const rawById = await app.inject({ method: 'GET', url: `/api/v1/files/${asset.id}/download`, headers });
    assert.equal(rawById.statusCode, 403);

    const bytes = download.rawPayload;
    const magic = Buffer.from('CFMODEL1');
    assert.equal(bytes.subarray(0, magic.length).compare(magic), 0);
    const headerLength = bytes.readUInt32BE(magic.length);
    const bodyStart = magic.length + 4 + headerLength;
    const envelope = JSON.parse(bytes.subarray(magic.length + 4, bodyStart).toString('utf8'));
    const dek = unwrapAndroidOaep(privateKey, Buffer.from(envelope.wrappedKey, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(envelope.nonce, 'base64'));
    decipher.setAAD(Buffer.from(envelope.aad));
    decipher.setAuthTag(bytes.subarray(bytes.length - 16));
    assert.deepEqual(Buffer.concat([decipher.update(bytes.subarray(bodyStart, bytes.length - 16)), decipher.final()]), plaintext);
    assert.equal(model.id, envelope.modelId);
  });
});
