import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AppError } from '../../lib/errors';
import { resolveStoredFile } from '../../lib/storage';
import { config } from '../../config';

export const MODEL_ENCRYPTION_ALGORITHM = 'AES_256_GCM_RSA_OAEP_SHA256';
export const MODEL_CONTAINER_V1_MAGIC = Buffer.from('CFMODEL1', 'ascii');
export const MODEL_CONTAINER_V2_MAGIC = Buffer.from('CFMODEL2', 'ascii');
const TAG_LENGTH = 16;
const MAX_CONTAINER_BYTES = 120 * 1024 * 1024;
const MAX_HEADER_BYTES = 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;

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
  arch?: string;
  quant?: string;
  framework?: string;
  inputSize?: number;
  numClasses?: number;
  labels?: string;
  minAppCode?: number | null;
  maxAppCode?: number | null;
  inputName?: string | null;
  inputLayout?: string;
  outputName?: string | null;
  outputLayout?: string;
  coordinatesNormalized?: boolean;
  valuesPerDetection?: number;
  containerVersion?: number;
  generation?: number;
  manifestSignature?: string | null;
  manifestSignatureAlgorithm?: string | null;
  manifestPublicKeyId?: string | null;
  manifestHash?: string | null;
  signatureExpiresAt?: string | null;
};

export type ModelContainerV2Manifest = {
  version: 2;
  modelId: string;
  modelVersion: string;
  generation: number;
  deviceId: string;
  keyId: string;
  descriptor: {
    modelVersion: string;
    architecture: string;
    quantization: string;
    framework: string;
    inputSize: number;
    numClasses: number;
    labels: string[];
    inputName: string;
    inputLayout: string;
    outputName: string;
    outputLayout: string;
    coordinatesNormalized: boolean;
    valuesPerDetection: number;
    minAppCode: number | null;
    maxAppCode: number | null;
    sha256: string;
  };
  sha256: string;
  authorizedUntil: string;
};

type ParsedEncryptedContainer = {
  version: 1 | 2;
  header: Record<string, unknown>;
  ciphertext: Buffer;
  tag: Buffer;
};

function canonicalJsonValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('manifest contains non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJsonValue).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonValue(record[key])}`).join(',')}}`;
  }
  throw new Error('manifest contains unsupported value');
}

export function canonicalManifest(manifest: ModelContainerV2Manifest): Buffer {
  const bytes = Buffer.from(canonicalJsonValue(manifest), 'utf8');
  if (bytes.length > MAX_MANIFEST_BYTES) throw AppError.invalidState('CFMODEL2 manifest 超过长度上限');
  return bytes;
}

export function manifestHash(manifestBytes: Buffer): string {
  return crypto.createHash('sha256').update(manifestBytes).digest('hex');
}

function parseLabels(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

export function buildModelManifest(model: ModelRow, device: DeviceKey): ModelContainerV2Manifest {
  if (!model.sha256 || !/^[a-f0-9]{64}$/i.test(model.sha256)) throw AppError.invalidState('模型明文 SHA-256 缺失');
  if (!model.arch || !model.quant || !model.framework || !model.inputSize || !model.numClasses) {
    throw AppError.invalidState('CFMODEL2 模型描述字段缺失');
  }
  const labels = parseLabels(model.labels);
  const inputName = model.inputName?.trim();
  const outputName = model.outputName?.trim();
  if (!inputName || !outputName || !model.outputLayout || !model.inputLayout || !model.valuesPerDetection) {
    throw AppError.invalidState('CFMODEL2 NCNN 契约字段缺失');
  }
  if (labels.length !== model.numClasses || !['NCHW', 'NHWC'].includes(model.inputLayout) ||
    !['FIELDS_BY_CANDIDATES', 'CANDIDATES_BY_FIELDS'].includes(model.outputLayout) ||
    model.valuesPerDetection < 4 + model.numClasses) {
    throw AppError.invalidState('CFMODEL2 NCNN 契约字段不一致');
  }
  return {
    version: 2,
    modelId: model.id,
    modelVersion: model.modelVersion,
    generation: model.generation ?? 0,
    deviceId: device.deviceId,
    keyId: device.keyId,
    descriptor: {
      modelVersion: model.modelVersion,
      architecture: model.arch,
      quantization: model.quant,
      framework: model.framework,
      inputSize: model.inputSize,
      numClasses: model.numClasses,
      labels,
      inputName,
      inputLayout: model.inputLayout,
      outputName,
      outputLayout: model.outputLayout,
      coordinatesNormalized: model.coordinatesNormalized ?? false,
      valuesPerDetection: model.valuesPerDetection,
      minAppCode: model.minAppCode ?? null,
      maxAppCode: model.maxAppCode ?? null,
      sha256: model.sha256.toLowerCase(),
    },
    sha256: model.sha256.toLowerCase(),
    authorizedUntil: device.authorizedUntil.toISOString(),
  };
}

export function manifestHashForDevice(model: ModelRow, device: DeviceKey): string {
  return manifestHash(canonicalManifest(buildModelManifest(model, device)));
}

function manifestSigningMaterial(): { key: crypto.KeyObject; keyId: string } {
  if (!config.modelManifestSigningPrivateKey) {
    throw AppError.invalidState('CFMODEL2 未配置 manifest 签名私钥');
  }
  let key: crypto.KeyObject;
  try {
    key = crypto.createPrivateKey(config.modelManifestSigningPrivateKey);
  } catch {
    throw AppError.invalidState('CFMODEL2 manifest 签名私钥无效');
  }
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw AppError.invalidState('CFMODEL2 manifest 签名私钥必须是 ECDSA P-256');
  }
  const publicKey = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' }) as Buffer;
  const derivedKeyId = `ec-${crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 32)}`;
  return { key, keyId: config.modelManifestSigningKeyId || derivedKeyId };
}

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

export function parseEncryptedContainer(input: Buffer): ParsedEncryptedContainer {
  const magic = input.subarray(0, MODEL_CONTAINER_V2_MAGIC.length);
  const isV2 = magic.equals(MODEL_CONTAINER_V2_MAGIC);
  const expectedMagic = isV2 ? MODEL_CONTAINER_V2_MAGIC : MODEL_CONTAINER_V1_MAGIC;
  if (input.length < expectedMagic.length + 4 + TAG_LENGTH || input.length > MAX_CONTAINER_BYTES || !input.subarray(0, expectedMagic.length).equals(expectedMagic)) {
    throw new Error('encrypted model magic mismatch');
  }
  const headerLength = input.readUInt32BE(expectedMagic.length);
  const headerStart = expectedMagic.length + 4;
  const bodyStart = headerStart + headerLength;
  if (headerLength <= 0 || headerLength > MAX_HEADER_BYTES || bodyStart + TAG_LENGTH > input.length) throw new Error('encrypted model header invalid');
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(input.subarray(headerStart, bodyStart).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('encrypted model header JSON invalid');
  }
  const ciphertext = input.subarray(bodyStart, input.length - TAG_LENGTH);
  const tag = input.subarray(input.length - TAG_LENGTH);
  if (isV2) validateModelContainerV2Header(header, ciphertext);
  return { version: isV2 ? 2 : 1, header, ciphertext, tag };
}

function decodeBase64Field(header: Record<string, unknown>, name: string): Buffer {
  const value = header[name];
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error(`CFMODEL2 ${name} missing or invalid`);
  }
  try {
    const bytes = Buffer.from(value, 'base64');
    if (!bytes.length) throw new Error('empty');
    return bytes;
  } catch {
    throw new Error(`CFMODEL2 ${name} invalid`);
  }
}

function validateModelContainerV2Header(header: Record<string, unknown>, ciphertext: Buffer): void {
  if (header.version !== 2 || header.algorithm !== MODEL_ENCRYPTION_ALGORITHM || header.keyWrap !== 'RSA_OAEP_SHA256_MGF1_SHA1') {
    throw new Error('CFMODEL2 header contract invalid');
  }
  if (typeof header.manifest !== 'string' || Buffer.byteLength(header.manifest, 'utf8') > MAX_MANIFEST_BYTES) {
    throw new Error('CFMODEL2 manifest invalid');
  }
  const manifestBytes = Buffer.from(header.manifest, 'utf8');
  const expectedManifestHash = manifestHash(manifestBytes);
  if (typeof header.manifestHash !== 'string' || !/^[a-f0-9]{64}$/i.test(header.manifestHash) || header.manifestHash.toLowerCase() !== expectedManifestHash) {
    throw new Error('CFMODEL2 manifest hash mismatch');
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(header.manifest) as Record<string, unknown>;
  } catch {
    throw new Error('CFMODEL2 manifest JSON invalid');
  }
  if (!Buffer.from(canonicalJsonValue(manifest), 'utf8').equals(manifestBytes)) {
    throw new Error('CFMODEL2 manifest is not canonical JSON');
  }
  if (manifest.version !== 2 || typeof manifest.modelId !== 'string' || typeof manifest.modelVersion !== 'string' ||
    typeof manifest.deviceId !== 'string' || typeof manifest.keyId !== 'string' ||
    !Number.isInteger(manifest.generation) || (manifest.generation as number) < 1 ||
    typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
    throw new Error('CFMODEL2 manifest fields invalid');
  }
  if (header.aad !== header.manifest) throw new Error('CFMODEL2 AAD must equal raw manifest');
  decodeBase64Field(header, 'nonce');
  decodeBase64Field(header, 'wrappedKey');
  if (typeof header.ciphertextSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(header.ciphertextSha256)) {
    throw new Error('CFMODEL2 ciphertext hash missing');
  }
  const actualCiphertextHash = crypto.createHash('sha256').update(ciphertext).digest('hex');
  if (actualCiphertextHash !== header.ciphertextSha256.toLowerCase()) throw new Error('CFMODEL2 ciphertext hash mismatch');
  if (typeof header.manifestSignature !== 'string' || !header.manifestSignature ||
    header.manifestSignatureAlgorithm !== 'ECDSA_P256_SHA256' ||
    typeof header.manifestPublicKeyId !== 'string' || !header.manifestPublicKeyId) {
    throw new Error('CFMODEL2 manifest signature metadata missing');
  }
  decodeBase64Field(header, 'manifestSignature');
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
    if ((model.containerVersion ?? 1) === 2) {
      return encryptModelV2(model, device, plaintext, dek);
    }
    if (!config.modelLegacyV1Allowed) {
      throw AppError.invalidState('当前仅允许 CFMODEL2 模型容器');
    }
    const nonce = crypto.randomBytes(12);
    const wrappedKey = wrapKeyForAndroid(publicKeyObject(device.publicKey), dek);
    const nonceText = nonce.toString('base64');
    const wrappedKeyText = wrappedKey.toString('base64');
    const authorizedUntil = device.authorizedUntil.toISOString();
    const aad = [
      'cyberfish-model-v2',
      model.id,
      model.modelVersion,
      device.deviceId,
      device.keyId,
      authorizedUntil,
      nonceText,
      wrappedKeyText,
      model.sha256,
    ].join('|');
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, nonce, { authTagLength: TAG_LENGTH });
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const header = Buffer.from(JSON.stringify({
      version: 2,
      algorithm: MODEL_ENCRYPTION_ALGORITHM,
      modelId: model.id,
      modelVersion: model.modelVersion,
      deviceId: device.deviceId,
      keyId: device.keyId,
      nonce: nonceText,
      wrappedKey: wrappedKeyText,
      keyWrap: 'RSA_OAEP_SHA256_MGF1_SHA1',
      aad,
      plaintextSha256: model.sha256,
      authorizedUntil,
    }), 'utf8');
    const prefix = Buffer.alloc(MODEL_CONTAINER_V1_MAGIC.length + 4);
    MODEL_CONTAINER_V1_MAGIC.copy(prefix, 0);
    prefix.writeUInt32BE(header.length, MODEL_CONTAINER_V1_MAGIC.length);
    return Buffer.concat([prefix, header, ciphertext, tag]);
  } finally {
    plaintext.fill(0);
    dek.fill(0);
  }
}

function encryptModelV2(model: ModelRow, device: DeviceKey, plaintext: Buffer, dek: Buffer): Buffer {
  const manifest = buildModelManifest(model, device);
  const manifestBytes = canonicalManifest(manifest);
  const manifestHashValue = manifestHash(manifestBytes);
  const signing = manifestSigningMaterial();
  const signatureAlgorithm = 'ECDSA_P256_SHA256';
  const manifestSignature = crypto.sign('sha256', Buffer.from(manifestHashValue, 'utf8'), signing.key).toString('base64');
  const manifestPublicKeyId = signing.keyId;
  const nonce = crypto.randomBytes(12);
  const wrappedKey = wrapKeyForAndroid(publicKeyObject(device.publicKey), dek);
  const nonceText = nonce.toString('base64');
  const wrappedKeyText = wrappedKey.toString('base64');
  const aad = manifestBytes;
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, nonce, { authTagLength: TAG_LENGTH });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const headerObject = {
    version: 2,
    algorithm: MODEL_ENCRYPTION_ALGORITHM,
    manifest: manifestBytes.toString('utf8'),
    manifestHash: manifestHashValue,
    manifestSignature,
    manifestSignatureAlgorithm: signatureAlgorithm,
    manifestPublicKeyId,
    nonce: nonceText,
    wrappedKey: wrappedKeyText,
    keyWrap: 'RSA_OAEP_SHA256_MGF1_SHA1',
    aad: manifestBytes.toString('utf8'),
    plaintextSha256: model.sha256!.toLowerCase(),
    ciphertextSha256: crypto.createHash('sha256').update(ciphertext).digest('hex'),
  };
  const header = Buffer.from(JSON.stringify(headerObject), 'utf8');
  if (header.length > MAX_HEADER_BYTES) throw AppError.invalidState('CFMODEL2 包头超过长度上限');
  const prefix = Buffer.alloc(MODEL_CONTAINER_V2_MAGIC.length + 4);
  MODEL_CONTAINER_V2_MAGIC.copy(prefix, 0);
  prefix.writeUInt32BE(header.length, MODEL_CONTAINER_V2_MAGIC.length);
  return Buffer.concat([prefix, header, ciphertext, tag]);
}
