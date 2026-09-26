import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AppError } from '../../lib/errors';
import { resolveStoredFile } from '../../lib/storage';

export const MODEL_ENCRYPTION_ALGORITHM = 'AES_256_GCM_RSA_OAEP_SHA256';
const MAGIC = Buffer.from('CFMODEL1', 'ascii');
const TAG_LENGTH = 16;

type DeviceKey = {
  deviceId: string;
  keyId: string;
  publicKey: string;
  authorizedUntil: Date;
};

type ModelRow = {
  id: string;
  modelVersion: string;
  fileUrl: string | null;
  sha256: string | null;
};

function publicKeyObject(publicKey: string): crypto.KeyObject {
  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    if (key.asymmetricKeyType !== 'rsa') throw new Error('not rsa');
    const details = key.asymmetricKeyDetails as { modulusLength?: number } | undefined;
    if ((details?.modulusLength ?? 0) < 2048) throw new Error('rsa key too short');
    return key;
  } catch {
    throw AppError.badRequest('设备公钥无效，必须是 RSA 2048+ SPKI DER Base64');
  }
}

function mgf1(seed: Buffer, length: number, algorithm: 'sha1'): Buffer {
  const output = Buffer.alloc(length);
  let offset = 0;
  for (let counter = 0; offset < length; counter += 1) {
    const block = Buffer.alloc(4);
    block.writeUInt32BE(counter, 0);
    const digest = crypto.createHash(algorithm).update(seed).update(block).digest();
    digest.copy(output, offset, 0, Math.min(digest.length, length - offset));
    offset += digest.length;
  }
  return output;
}

function xor(left: Buffer, right: Buffer): Buffer {
  const output = Buffer.alloc(left.length);
  for (let index = 0; index < left.length; index += 1) output[index] = left[index]! ^ right[index]!;
  return output;
}

function wrapKeyForAndroid(publicKey: crypto.KeyObject, message: Buffer): Buffer {
  const modulusBits = (publicKey.asymmetricKeyDetails as { modulusLength?: number } | undefined)?.modulusLength ?? 0;
  const modulusBytes = Math.ceil(modulusBits / 8);
  const hashLength = 32;
  if (message.length > modulusBytes - 2 * hashLength - 2) throw new Error('RSA OAEP message too long');
  const labelHash = crypto.createHash('sha256').update(Buffer.alloc(0)).digest();
  const padding = Buffer.alloc(modulusBytes - message.length - 2 * hashLength - 2);
  const dataBlock = Buffer.concat([labelHash, padding, Buffer.from([1]), message]);
  const seed = crypto.randomBytes(hashLength);
  const maskedDataBlock = xor(dataBlock, mgf1(seed, modulusBytes - hashLength - 1, 'sha1'));
  const maskedSeed = xor(seed, mgf1(maskedDataBlock, hashLength, 'sha1'));
  const encoded = Buffer.concat([Buffer.from([0]), maskedSeed, maskedDataBlock]);
  return crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_NO_PADDING }, encoded);
}

export function keyIdForPublicKey(publicKey: string): string {
  return `rsa-${crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 32)}`;
}

export function validateDevicePublicKey(publicKey: string): string {
  publicKeyObject(publicKey);
  return keyIdForPublicKey(publicKey);
}

export function parseEncryptedContainer(input: Buffer): { header: Record<string, unknown>; ciphertext: Buffer; tag: Buffer } {
  if (input.length < MAGIC.length + 4 + TAG_LENGTH || !input.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('encrypted model magic mismatch');
  }
  const headerLength = input.readUInt32BE(MAGIC.length);
  const headerStart = MAGIC.length + 4;
  const bodyStart = headerStart + headerLength;
  if (headerLength <= 0 || bodyStart + TAG_LENGTH > input.length) throw new Error('encrypted model header invalid');
  const header = JSON.parse(input.subarray(headerStart, bodyStart).toString('utf8')) as Record<string, unknown>;
  return {
    header,
    ciphertext: input.subarray(bodyStart, input.length - TAG_LENGTH),
    tag: input.subarray(input.length - TAG_LENGTH),
  };
}

export async function encryptModelForDevice(model: ModelRow, device: DeviceKey): Promise<Buffer> {
  if (!model.fileUrl || !model.sha256) throw AppError.invalidState('模型文件或 SHA-256 缺失，无法加密下发');
  const filePath = resolveStoredFile(model.fileUrl);
  if (!filePath) throw AppError.notFound('模型文件已丢失');
  const plaintext = await readFile(filePath);
  const dek = crypto.randomBytes(32);
  try {
    const actualSha256 = crypto.createHash('sha256').update(plaintext).digest('hex');
    if (actualSha256 !== model.sha256.toLowerCase()) throw AppError.invalidState('模型文件 SHA-256 与登记值不一致');
    const nonce = crypto.randomBytes(12);
    const aad = `cyberfish-model-v1|${model.id}|${model.modelVersion}|${device.deviceId}|${model.sha256}`;
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, nonce, { authTagLength: TAG_LENGTH });
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const wrappedKey = wrapKeyForAndroid(publicKeyObject(device.publicKey), dek);
    const header = Buffer.from(JSON.stringify({
      version: 1,
      algorithm: MODEL_ENCRYPTION_ALGORITHM,
      modelId: model.id,
      modelVersion: model.modelVersion,
      deviceId: device.deviceId,
      keyId: device.keyId,
      nonce: nonce.toString('base64'),
      wrappedKey: wrappedKey.toString('base64'),
      keyWrap: 'RSA_OAEP_SHA256_MGF1_SHA1',
      aad,
      plaintextSha256: model.sha256,
      authorizedUntil: device.authorizedUntil.toISOString(),
    }), 'utf8');
    const prefix = Buffer.alloc(MAGIC.length + 4);
    MAGIC.copy(prefix, 0);
    prefix.writeUInt32BE(header.length, MAGIC.length);
    return Buffer.concat([prefix, header, ciphertext, tag]);
  } finally {
    plaintext.fill(0);
    dek.fill(0);
  }
}
