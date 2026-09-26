import assert from 'node:assert/strict';
import { unwrapAndroidOaep } from './model-encryption-helper';
import crypto from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const testDir = mkdtempSync(join(process.cwd(), 'tmp-model-encryption-'));
process.env.UPLOAD_DIR = join(testDir, 'uploads');

after(() => rmSync(testDir, { recursive: true, force: true }));

describe('per-device encrypted model delivery', () => {
  it('wraps an AES-256-GCM model key for one RSA device and detects tampering', async () => {
    const { encryptModelForDevice, keyIdForPublicKey, parseEncryptedContainer } = await import('../src/modules/model/encryption');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicKeyText = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const keyId = keyIdForPublicKey(publicKeyText);
    const modelDir = join(process.env.UPLOAD_DIR!, 'models');
    mkdirSync(modelDir, { recursive: true });
    const plaintext = Buffer.from('ncnn-bundle-plaintext');
    writeFileSync(join(modelDir, 'fixture.bin'), plaintext);
    const model = { id: 'model-1', modelVersion: 'model-v1', fileUrl: '/files/models/fixture.bin', sha256: crypto.createHash('sha256').update(plaintext).digest('hex') };
    const container = await encryptModelForDevice(model, { deviceId: 'device-1', keyId, publicKey: publicKeyText, authorizedUntil: new Date('2099-01-01T00:00:00Z') });
    const parsed = parseEncryptedContainer(container);
    const header = parsed.header as Record<string, string>;
    const dek = unwrapAndroidOaep(privateKey, Buffer.from(header.wrappedKey, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(header.nonce, 'base64'));
    decipher.setAAD(Buffer.from(header.aad));
    decipher.setAuthTag(parsed.tag);
    assert.deepEqual(Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]), plaintext);

    const tampered = Buffer.from(container);
    tampered[tampered.length - 17] ^= 1;
    const bad = parseEncryptedContainer(tampered);
    const badDecipher = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(header.nonce, 'base64'));
    badDecipher.setAAD(Buffer.from(header.aad));
    badDecipher.setAuthTag(bad.tag);
    assert.throws(() => Buffer.concat([badDecipher.update(bad.ciphertext), badDecipher.final()]));
  });
});
