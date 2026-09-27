import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const serverDir = process.cwd();
const testDir = mkdtempSync(join(serverDir, 'prisma', 'model-container-v2-api-'));
const testDatabase = join(testDir, 'model-container-v2-api.db');
const uploadDir = join(testDir, 'uploads');
writeFileSync(testDatabase, '');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${testDatabase.replaceAll('\\', '/')}`;
process.env.UPLOAD_DIR = uploadDir;
process.env.APP_API_TOKEN = 'model-container-v2-api-token';
process.env.MODEL_CONTAINER_V2_ENABLED = 'true';
process.env.MODEL_LEGACY_V1_ALLOWED = 'false';
const manifestSigningPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
process.env.MODEL_MANIFEST_SIGNING_PRIVATE_KEY = manifestSigningPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
process.env.MODEL_MANIFEST_SIGNING_KEY_ID = 'ec-v2-api-test-signing';

let prisma: any;
let app: Awaited<ReturnType<typeof import('../src/app').buildApp>>;

before(async () => {
  mkdirSync(join(uploadDir, 'models'), { recursive: true });
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

function createRsaKey() {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

async function createModel(modelVersion: string, complete: boolean) {
  const plaintext = Buffer.from(`ncnn-${modelVersion}`);
  const filename = `${modelVersion}.bin`;
  writeFileSync(join(uploadDir, 'models', filename), plaintext);
  const sha256 = crypto.createHash('sha256').update(plaintext).digest('hex');
  const asset = await prisma.fileAsset.create({ data: {
    bizType: 'MODEL', originalName: filename, filename, storagePath: join(uploadDir, 'models', filename),
    url: `/files/models/${filename}`, mimeType: 'application/octet-stream', size: BigInt(plaintext.length), sha256,
  } });
  return prisma.mlModel.create({ data: {
    modelVersion, name: modelVersion, arch: 'YOLO26n', quant: 'FP32', framework: 'NCNN',
    fileUrl: asset.url, fileSize: asset.size, sha256, fileId: asset.id, status: 'ONLINE',
    labels: '["鱼漂"]', inputSize: 640, numClasses: 1, inputName: complete ? 'in0' : null, inputLayout: 'NCHW',
    outputName: 'out0', outputLayout: 'FIELDS_BY_CANDIDATES', coordinatesNormalized: false, valuesPerDetection: 5,
    signature: 'model-signature', signatureAlgorithm: 'ECDSA_P256_SHA256', publicKeyId: 'model-key',
    ...(complete ? {
      containerVersion: 2, generation: 9,
      manifestSignature: Buffer.from('manifest-signature').toString('base64'),
      manifestSignatureAlgorithm: 'ECDSA_P256_SHA256', manifestPublicKeyId: 'manifest-key',
    } : { containerVersion: 2, generation: 9 }),
  } });
}

describe('CFMODEL2 API publication and delivery gates', () => {
  it('returns a v2 descriptor and CFMODEL2 encrypted payload for a complete model', async () => {
    const { publicKey } = createRsaKey();
    const model = await createModel('api-v2-complete', true);
    const key = await prisma.modelDeviceKey.create({ data: {
      deviceId: 'api-v2-device', keyId: 'rsa-api-v2', publicKey, algorithm: 'RSA_OAEP_SHA256',
      securityLevel: 'TEE', appVersionCode: 147, authorizedUntil: new Date(Date.now() + 60_000),
    } });
    const headers = { 'x-app-token': process.env.APP_API_TOKEN! };
    const check = await app.inject({
      method: 'GET',
      url: `/api/v1/models/check?appVersionCode=147&deviceId=${key.deviceId}&keyId=${key.keyId}`,
      headers,
    });
    assert.equal(check.statusCode, 200, check.body);
    assert.equal(check.json().data.model.containerVersion, 2);
    assert.equal(check.json().data.model.generation, 9);
    assert.match(check.json().data.model.manifestHash, /^[a-f0-9]{64}$/);

    const encrypted = await app.inject({
      method: 'GET',
      url: `/api/v1/models/encrypted/${model.id}?deviceId=${key.deviceId}&keyId=${key.keyId}`,
      headers,
    });
    assert.equal(encrypted.statusCode, 200, encrypted.body);
    assert.equal(encrypted.rawPayload.subarray(0, 8).toString('ascii'), 'CFMODEL2');
  });

  it('rejects a v2 model with missing manifest signing metadata before download', async () => {
    const { publicKey } = createRsaKey();
    const model = await createModel('api-v2-incomplete', false);
    const key = await prisma.modelDeviceKey.create({ data: {
      deviceId: 'api-v2-incomplete-device', keyId: 'rsa-api-v2-incomplete', publicKey, algorithm: 'RSA_OAEP_SHA256',
      securityLevel: 'SOFTWARE', appVersionCode: 147, authorizedUntil: new Date(Date.now() + 60_000),
    } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/models/check?appVersionCode=147&deviceId=${key.deviceId}&keyId=${key.keyId}`,
      headers: { 'x-app-token': process.env.APP_API_TOKEN! },
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.match(response.json().message, /契约/);
    assert.equal(model.containerVersion, 2);
  });

  it('does not offer a lower-generation model after a device has accepted a newer one', async () => {
    const { publicKey } = createRsaKey();
    const older = await createModel('api-v2-older', true);
    const newer = await createModel('api-v2-newer', true);
    await prisma.mlModel.update({ where: { id: older.id }, data: { generation: 9 } });
    await prisma.mlModel.update({ where: { id: newer.id }, data: { generation: 10 } });
    const key = await prisma.modelDeviceKey.create({ data: {
      deviceId: 'api-v2-generation-device', keyId: 'rsa-api-v2-generation', publicKey,
      algorithm: 'RSA_OAEP_SHA256', securityLevel: 'TEE', appVersionCode: 148,
      authorizedUntil: new Date(Date.now() + 60_000),
    } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/models/check?appVersionCode=148&deviceId=${key.deviceId}&keyId=${key.keyId}&currentModelVersion=api-v2-newer`,
      headers: { 'x-app-token': process.env.APP_API_TOKEN! },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.hasUpdate, false);
  });
});
