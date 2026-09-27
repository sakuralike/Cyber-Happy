import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { config } from '../../config';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import type { CreateChallengeInput, EnrollDeviceInput, ExchangeTokenInput } from './schema';

export const DEVICE_SCOPES = [
  'config:read',
  'app-version:check',
  'event:write',
  'media:write',
  'model:check',
  'model:key-register',
  'model:report',
] as const;

export interface DeviceJwtClaims {
  sub: string;
  kind: 'DEVICE';
  deviceId: string;
  keyId: string;
  scopes: string[];
  ver: number;
  jti: string;
  iat: number;
  exp: number;
}

export interface CurrentDevice {
  credentialId: string;
  deviceId: string;
  keyId: string;
  scopes: string[];
  authMode: 'DEVICE';
}

type SignToken = (payload: DeviceJwtClaims) => string;
type VerifyToken = (token: string) => unknown;

function decodeBase64(value: string, field: string): Buffer {
  const normalized = value.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) throw AppError.badRequest(`${field} 不是有效的 Base64`);
  const decoded = Buffer.from(normalized, 'base64');
  if (!decoded.length) throw AppError.badRequest(`${field} 不能为空`);
  return decoded;
}

function validateSigningPublicKey(value: string): { keyId: string; publicKey: string } {
  try {
    const der = decodeBase64(value, 'signingPublicKey');
    const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
      throw AppError.badRequest('设备签名公钥必须是 ECDSA P-256 SPKI 公钥');
    }
    const canonicalDer = key.export({ type: 'spki', format: 'der' }) as Buffer;
    const hash = crypto.createHash('sha256').update(canonicalDer).digest('hex');
    return { keyId: `ec-${hash.slice(0, 32)}`, publicKey: canonicalDer.toString('base64') };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.badRequest('设备签名公钥格式无效');
  }
}

function keyObject(publicKey: string): crypto.KeyObject {
  return crypto.createPublicKey({ key: decodeBase64(publicKey, 'signingPublicKey'), format: 'der', type: 'spki' });
}

function safeTextEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isValidLegacyToken(value: unknown): boolean {
  return typeof value === 'string' && safeTextEqual(value, config.appApiToken);
}

export async function enroll(input: EnrollDeviceInput, userId?: string) {
  const signing = validateSigningPublicKey(input.signingPublicKey);
  const now = new Date();
  const existing = await prisma.appDeviceCredential.findUnique({ where: { deviceId: input.deviceId } });

  if (existing?.status === 'REVOKED' || existing?.revokedAt) {
    throw AppError.forbidden('设备凭据已撤销，不能重新激活');
  }
  if (existing && existing.signingKeyId !== signing.keyId) {
    throw AppError.conflict('设备已绑定其他签名密钥');
  }

  try {
    const row = existing
      ? await prisma.appDeviceCredential.update({
          where: { id: existing.id },
          data: {
            signingPublicKey: signing.publicKey,
            securityLevel: input.securityLevel,
            appVersionCode: input.appVersionCode,
            userId: userId ?? undefined,
            status: 'ACTIVE',
            activatedAt: existing.activatedAt ?? now,
            lastSeenAt: now,
          },
        })
      : await prisma.appDeviceCredential.create({
          data: {
            deviceId: input.deviceId,
            signingKeyId: signing.keyId,
            signingPublicKey: signing.publicKey,
            securityLevel: input.securityLevel,
            appVersionCode: input.appVersionCode,
            userId: userId ?? null,
            status: 'ACTIVE',
            activatedAt: now,
            lastSeenAt: now,
          },
        });

    return {
      credentialId: row.id,
      deviceId: row.deviceId,
      signingKeyId: row.signingKeyId,
      status: row.status,
      scopes: [...DEVICE_SCOPES],
      createdAt: row.createdAt,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw AppError.conflict('设备 ID 或签名密钥已被登记');
    }
    throw error;
  }
}

export async function createChallenge(input: CreateChallengeInput) {
  const credential = await prisma.appDeviceCredential.findUnique({ where: { deviceId: input.deviceId } });
  if (!credential || credential.signingKeyId !== input.signingKeyId) throw AppError.unauthorized('设备凭据不存在');
  if (credential.status !== 'ACTIVE' || credential.revokedAt) throw AppError.forbidden('设备凭据不可用');

  const challenge = crypto.randomBytes(32).toString('base64url');
  const challengeHash = crypto.createHash('sha256').update(challenge, 'utf8').digest('hex');
  const expiresAt = new Date(Date.now() + config.deviceChallengeTtlSeconds * 1000);
  const row = await prisma.deviceAuthChallenge.create({
    data: {
      credentialId: credential.id,
      deviceId: credential.deviceId,
      challengeHash,
      expiresAt,
    },
  });
  return { challengeId: row.id, challenge, expiresAt: row.expiresAt.toISOString() };
}

export function deviceAuthCanonical(input: {
  deviceId: string;
  signingKeyId: string;
  challengeId: string;
  challenge: string;
  expiresAt: string;
}): string {
  return [
    'CYBERFISH-DEVICE-AUTH-V1',
    'TOKEN',
    input.deviceId,
    input.signingKeyId,
    input.challengeId,
    input.challenge,
    input.expiresAt,
  ].join('\n');
}

function issueToken(
  credential: { id: string; deviceId: string; signingKeyId: string; tokenVersion: number },
  sign: SignToken,
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAt + config.deviceTokenTtlSeconds;
  const scopes = [...DEVICE_SCOPES];
  const token = sign({
    sub: credential.id,
    kind: 'DEVICE',
    deviceId: credential.deviceId,
    keyId: credential.signingKeyId,
    scopes,
    ver: credential.tokenVersion,
    jti: crypto.randomUUID(),
    iat: issuedAt,
    exp: expiresAtSeconds,
  });
  return {
    token,
    tokenType: 'Device' as const,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    scopes,
  };
}

export async function exchangeToken(input: ExchangeTokenInput, sign: SignToken) {
  const row = await prisma.deviceAuthChallenge.findUnique({
    where: { id: input.challengeId },
    include: { credential: true },
  });
  const now = new Date();
  if (!row || row.deviceId !== input.deviceId || row.credential.signingKeyId !== input.signingKeyId) {
    throw AppError.unauthorized('设备挑战无效');
  }
  if (row.usedAt) throw AppError.conflict('设备挑战已使用');
  if (row.expiresAt <= now) throw AppError.unauthorized('设备挑战已过期');
  if (row.credential.status !== 'ACTIVE' || row.credential.revokedAt) throw AppError.forbidden('设备凭据不可用');

  const actualHash = crypto.createHash('sha256').update(input.challenge, 'utf8').digest('hex');
  if (!safeTextEqual(actualHash, row.challengeHash)) throw AppError.unauthorized('设备挑战无效');

  let signature: Buffer;
  try {
    signature = decodeBase64(input.signature, 'signature');
  } catch {
    throw AppError.unauthorized('设备挑战签名无效');
  }
  const canonical = deviceAuthCanonical({
    deviceId: input.deviceId,
    signingKeyId: input.signingKeyId,
    challengeId: input.challengeId,
    challenge: input.challenge,
    expiresAt: row.expiresAt.toISOString(),
  });
  if (!crypto.verify('sha256', Buffer.from(canonical, 'utf8'), keyObject(row.credential.signingPublicKey), signature)) {
    throw AppError.unauthorized('设备挑战签名无效');
  }

  const consumed = await prisma.deviceAuthChallenge.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (consumed.count !== 1) throw AppError.conflict('设备挑战已使用或过期');
  await prisma.appDeviceCredential.update({ where: { id: row.credential.id }, data: { lastSeenAt: now } });
  return issueToken(row.credential, sign);
}

function quoteCanonicalString(value: string): string {
  let result = '"';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    switch (character) {
      case '"': result += '\\"'; break;
      case '\\': result += '\\\\'; break;
      case '\b': result += '\\b'; break;
      case '\f': result += '\\f'; break;
      case '\n': result += '\\n'; break;
      case '\r': result += '\\r'; break;
      case '\t': result += '\\t'; break;
      default: {
        const code = value.charCodeAt(index);
        result += code < 0x20 ? `\\u${code.toString(16).padStart(4, '0')}` : character;
      }
    }
  }
  return `${result}"`;
}

function canonicalJsonNumber(value: number): string {
  if (!Number.isFinite(value)) throw AppError.badRequest('请求正文包含无效数字');
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    throw AppError.badRequest('请求正文包含超出安全范围的整数');
  }
  if (Object.is(value, -0)) return '0';

  const [coefficient, exponentText] = value.toString().toLowerCase().split('e');
  if (exponentText === undefined) return coefficient;

  const sign = coefficient.startsWith('-') ? '-' : '';
  const unsigned = sign ? coefficient.slice(1) : coefficient;
  const [integer, fraction = ''] = unsigned.split('.');
  const digits = integer + fraction;
  const decimalPosition = integer.length + Number(exponentText);
  if (decimalPosition <= 0) return `${sign}0.${'0'.repeat(-decimalPosition)}${digits}`;
  if (decimalPosition >= digits.length) return `${sign}${digits}${'0'.repeat(decimalPosition - digits.length)}`;
  return `${sign}${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
}

function canonicalJsonValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return quoteCanonicalString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return canonicalJsonNumber(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJsonValue).join(',')}]`;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${quoteCanonicalString(key)}:${canonicalJsonValue(object[key])}`)
      .join(',')}}`;
  }
  throw AppError.badRequest('请求正文无法规范化');
}

export function canonicalJson(value: unknown): string {
  return value === undefined ? '' : canonicalJsonValue(value);
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function canonicalQuery(rawUrl: string): string {
  const url = new URL(rawUrl, 'http://device.local');
  const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  return [...url.searchParams.entries()]
    .sort(([ak, av], [bk, bv]) => compare(ak, bk) || compare(av, bv))
    .map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`)
    .join('&');
}

export function requestBodySha256(body: unknown): string {
  if (Buffer.isBuffer(body)) return crypto.createHash('sha256').update(body).digest('hex');
  if (typeof body === 'string') return crypto.createHash('sha256').update(body, 'utf8').digest('hex');
  return crypto.createHash('sha256').update(canonicalJson(body), 'utf8').digest('hex');
}

export function deviceRequestCanonical(input: {
  method: string;
  path: string;
  query: string;
  bodySha256: string;
  timestamp: string;
  nonce: string;
}): string {
  return [
    'CYBERFISH-REQUEST-V1',
    input.method.toUpperCase(),
    input.path,
    input.query,
    input.bodySha256,
    input.timestamp,
    input.nonce,
  ].join('\n');
}

function singleHeader(request: FastifyRequest, name: string): string {
  const value = request.headers[name];
  if (typeof value !== 'string' || !value.trim()) throw AppError.unauthorized(`缺少设备请求头 ${name}`);
  return value.trim();
}

function parseDeviceToken(request: FastifyRequest): string {
  const authorization = singleHeader(request, 'x-device-authorization');
  const match = /^Device\s+(.+)$/.exec(authorization);
  if (!match) throw AppError.unauthorized('设备 token 格式无效');
  return match[1];
}

function parseClaims(value: unknown): DeviceJwtClaims {
  const claims = value as Partial<DeviceJwtClaims> | null;
  if (
    !claims || claims.kind !== 'DEVICE' || typeof claims.sub !== 'string' ||
    typeof claims.deviceId !== 'string' || typeof claims.keyId !== 'string' ||
    !Array.isArray(claims.scopes) || !claims.scopes.every((scope) => typeof scope === 'string') ||
    typeof claims.ver !== 'number'
  ) {
    throw AppError.unauthorized('设备 token 无效');
  }
  return claims as DeviceJwtClaims;
}

export async function verifySignedRequest(
  request: FastifyRequest,
  requiredScope: string | undefined,
  verifyToken: VerifyToken,
): Promise<CurrentDevice> {
  let claims: DeviceJwtClaims;
  try {
    claims = parseClaims(verifyToken(parseDeviceToken(request)));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.unauthorized('设备 token 已过期或无效');
  }
  if (requiredScope && !claims.scopes.includes(requiredScope)) throw AppError.forbidden(`设备 token 缺少 scope：${requiredScope}`);

  const deviceId = singleHeader(request, 'x-device-id');
  const keyId = singleHeader(request, 'x-device-key-id');
  if (deviceId !== claims.deviceId || keyId !== claims.keyId) throw AppError.unauthorized('设备身份请求头与 token 不一致');

  const credential = await prisma.appDeviceCredential.findUnique({ where: { id: claims.sub } });
  if (
    !credential || credential.deviceId !== claims.deviceId || credential.signingKeyId !== claims.keyId ||
    credential.tokenVersion !== claims.ver || credential.status !== 'ACTIVE' || credential.revokedAt
  ) {
    throw AppError.unauthorized('设备凭据已失效');
  }

  const timestamp = singleHeader(request, 'x-timestamp');
  if (!/^\d{10}$/.test(timestamp)) throw AppError.unauthorized('设备请求时间戳格式无效');
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > config.deviceRequestClockSkewSeconds) {
    throw AppError.unauthorized('设备请求时间戳已过期');
  }

  const nonce = singleHeader(request, 'x-nonce');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) throw AppError.unauthorized('设备请求 nonce 格式无效');
  const suppliedBodyHash = singleHeader(request, 'x-body-sha256').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(suppliedBodyHash)) throw AppError.unauthorized('设备请求正文哈希格式无效');
  const contentType = String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
  if (
    request.body !== undefined &&
    contentType &&
    contentType !== 'application/json' &&
    contentType !== 'multipart/form-data' &&
    !Buffer.isBuffer(request.body) &&
    typeof request.body !== 'string'
  ) {
    throw AppError.badRequest('当前设备签名只支持 JSON 请求；multipart 请使用设备 token 与 scope 校验');
  }
  const actualBodyHash = requestBodySha256(request.body);
  const contentHash = String(request.headers['x-device-content-sha256'] ?? '').trim().toLowerCase();
  const signedBodyHash = contentType === 'multipart/form-data' ? contentHash : actualBodyHash;
  if (contentType === 'multipart/form-data' && !/^[a-f0-9]{64}$/.test(contentHash)) {
    throw AppError.unauthorized('设备媒体摘要格式无效');
  }
  if (!safeTextEqual(suppliedBodyHash, signedBodyHash)) throw AppError.unauthorized('设备请求正文哈希不匹配');

  const url = new URL(request.raw.url ?? request.url, 'http://device.local');
  const canonical = deviceRequestCanonical({
    method: request.method,
    path: url.pathname,
    query: canonicalQuery(request.raw.url ?? request.url),
    bodySha256: signedBodyHash,
    timestamp,
    nonce,
  });
  let signature: Buffer;
  try {
    signature = decodeBase64(singleHeader(request, 'x-device-signature'), 'x-device-signature');
  } catch {
    throw AppError.unauthorized('设备请求签名无效');
  }
  if (!crypto.verify('sha256', Buffer.from(canonical, 'utf8'), keyObject(credential.signingPublicKey), signature)) {
    throw AppError.unauthorized('设备请求签名无效');
  }

  const now = new Date();
  try {
    await prisma.$transaction([
      prisma.deviceRequestNonce.deleteMany({ where: { expiresAt: { lte: now } } }),
      prisma.deviceRequestNonce.create({
        data: {
          credentialId: credential.id,
          deviceId: credential.deviceId,
          nonce,
          expiresAt: new Date(now.getTime() + config.deviceRequestClockSkewSeconds * 1000),
        },
      }),
      prisma.appDeviceCredential.update({ where: { id: credential.id }, data: { lastSeenAt: now } }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw AppError.conflict('设备请求 nonce 已使用');
    }
    throw error;
  }

  return {
    credentialId: credential.id,
    deviceId: credential.deviceId,
    keyId: credential.signingKeyId,
    scopes: claims.scopes,
    authMode: 'DEVICE',
  };
}

export async function refresh(credentialId: string, sign: SignToken) {
  const credential = await prisma.appDeviceCredential.findUnique({ where: { id: credentialId } });
  if (!credential || credential.status !== 'ACTIVE' || credential.revokedAt) throw AppError.unauthorized('设备凭据已失效');
  return issueToken(credential, sign);
}

export async function revoke(credentialId: string) {
  const credential = await prisma.appDeviceCredential.findUnique({ where: { id: credentialId } });
  if (!credential) throw AppError.notFound('设备凭据不存在');
  if (credential.status === 'REVOKED') return { credentialId: credential.id, deviceId: credential.deviceId, status: credential.status, revokedAt: credential.revokedAt };
  const now = new Date();
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.appDeviceCredential.update({
      where: { id: credential.id },
      data: { status: 'REVOKED', revokedAt: now, tokenVersion: { increment: 1 } },
    }),
  ];
  if (credential.modelKeyId) {
    operations.push(prisma.modelDeviceKey.updateMany({ where: { keyId: credential.modelKeyId }, data: { revokedAt: now } }));
  }
  await prisma.$transaction(operations);
  return { credentialId: credential.id, deviceId: credential.deviceId, status: 'REVOKED', revokedAt: now };
}
