import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, describe, it } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unwrapAndroidOaep } from './model-encryption-helper';

const testDir = mkdtempSync(join(process.cwd(), 'tmp-model-container-v2-'));
process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = join(testDir, 'uploads');
process.env.MODEL_CONTAINER_V2_ENABLED = 'true';
process.env.MODEL_LEGACY_V1_ALLOWED = 'false';
const manifestSigningPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
process.env.MODEL_MANIFEST_SIGNING_PRIVATE_KEY = manifestSigningPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
process.env.MODEL_MANIFEST_SIGNING_KEY_ID = 'ec-v2-test-signing';
mkdirSync(join(process.env.UPLOAD_DIR, 'models'), { recursive: true });

after(() => rmSync(testDir, { recursive: true, force: true }));

describe('CFMODEL2 server container contract', () => {
  it('uses the raw manifest as AAD and authenticates manifest/ciphertext metadata', async () => {
    const {
      encryptModelForDevice,
      parseEncryptedContainer,
      MODEL_CONTAINER_V2_MAGIC,
      manifestHashForDevice,
    } = await import('../src/modules/model/encryption');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicKeyText = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const plaintext = Buffer.from('ncnn-v2-container');
    writeFileSync(join(process.env.UPLOAD_DIR!, 'models', 'fixture.bin'), plaintext);
    const manifestSigner = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    process.env.MODEL_MANIFEST_SIGNING_PRIVATE_KEY_B64 = manifestSigner.privateKey
      .export({ type: 'pkcs8', format: 'der' })
      .toString('base64');
    process.env.MODEL_MANIFEST_SIGNING_KEY_ID = 'manifest-key-1';
    const model: any = {
      id: 'model-v2-id',
      modelVersion: 'model-v2',
      fileUrl: '/files/models/fixture.bin',
      sha256: crypto.createHash('sha256').update(plaintext).digest('hex'),
      arch: 'YOLO26n',
      quant: 'FP32',
      framework: 'NCNN',
      inputSize: 640,
      numClasses: 1,
      labels: '["鱼漂"]',
      inputName: 'in0',
      inputLayout: 'NCHW',
      outputName: 'out0',
      outputLayout: 'FIELDS_BY_CANDIDATES',
      coordinatesNormalized: false,
      valuesPerDetection: 5,
      generation: 7,
      containerVersion: 2,
      manifestSignature: '',
      manifestSignatureAlgorithm: 'ECDSA_P256_SHA256',
      manifestPublicKeyId: 'manifest-key-1',
    };
    const device = {
      deviceId: 'device-v2',
      keyId: 'rsa-v2-key',
      publicKey: publicKeyText,
      authorizedUntil: new Date('2099-01-01T00:00:00Z'),
    };
    const container = await encryptModelForDevice(model, device);
    assert.equal(container.subarray(0, MODEL_CONTAINER_V2_MAGIC.length).toString('ascii'), 'CFMODEL2');
    const parsed = parseEncryptedContainer(container);
    assert.equal(parsed.version, 2);
    const header = parsed.header as Record<string, string>;
    assert.equal(header.aad, header.manifest);
    assert.equal(header.manifestHash, manifestHashForDevice(model, device));
    assert.equal(header.ciphertextSha256, crypto.createHash('sha256').update(parsed.ciphertext).digest('hex'));

    const dek = unwrapAndroidOaep(privateKey, Buffer.from(header.wrappedKey, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(header.nonce, 'base64'));
    decipher.setAAD(Buffer.from(header.manifest, 'utf8'));
    decipher.setAuthTag(parsed.tag);
    assert.deepEqual(Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]), plaintext);

    const tamperedManifest = Buffer.from(container);
    const headerLength = tamperedManifest.readUInt32BE(MODEL_CONTAINER_V2_MAGIC.length);
    const headerStart = MODEL_CONTAINER_V2_MAGIC.length + 4;
    const tamperedHeader = JSON.parse(tamperedManifest.subarray(headerStart, headerStart + headerLength).toString('utf8')) as Record<string, unknown>;
    tamperedHeader.manifestHash = '0'.repeat(64);
    const encoded = Buffer.from(JSON.stringify(tamperedHeader), 'utf8');
    assert.equal(encoded.length, headerLength);
    encoded.copy(tamperedManifest, headerStart);
    assert.throws(() => parseEncryptedContainer(tamperedManifest), /manifest hash mismatch/);

    const alteredCiphertext = Buffer.from(container);
    const parsedAltered = parseEncryptedContainer(alteredCiphertext);
    const ciphertextOffset = alteredCiphertext.length - parsedAltered.tag.length - parsedAltered.ciphertext.length;
    alteredCiphertext[ciphertextOffset] ^= 1;
    assert.throws(() => parseEncryptedContainer(alteredCiphertext), /ciphertext hash mismatch/);
  });

  it('rejects malformed v2 manifest fields before decryption', async () => {
    const { parseEncryptedContainer, MODEL_CONTAINER_V2_MAGIC } = await import('../src/modules/model/encryption');
    const header = Buffer.from(JSON.stringify({ version: 2, algorithm: 'AES_256_GCM_RSA_OAEP_SHA256' }), 'utf8');
    const prefix = Buffer.alloc(MODEL_CONTAINER_V2_MAGIC.length + 4);
    MODEL_CONTAINER_V2_MAGIC.copy(prefix);
    prefix.writeUInt32BE(header.length, MODEL_CONTAINER_V2_MAGIC.length);
    assert.throws(() => parseEncryptedContainer(Buffer.concat([prefix, header, Buffer.alloc(16)])), /CFMODEL2/);
  });
});
