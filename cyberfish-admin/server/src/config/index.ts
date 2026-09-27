import path from 'node:path';
import fs from 'node:fs';

export type AppEnv = 'development' | 'production' | 'test';

const DEFAULT_JWT_SECRET = 'cyberfish-admin-dev-secret-change-me';
const DEFAULT_JWT_SECRET_EXAMPLE = 'cyberfish-admin-dev-secret-change-me-in-production';
const DEFAULT_APP_API_TOKEN = 'cyberfish-app-token-dev';
const DEFAULT_INVITE_CODE_SECRET = 'cyberfish-invite-secret-dev';
const DEFAULT_INVITE_CODE_SECRET_EXAMPLE = 'cyberfish-invite-secret-change-me';

/** 极简 .env 解析，避免额外依赖 */
function loadEnvFile(): void {
  const rootDir = process.cwd();
  for (const file of [path.resolve(rootDir, '.env'), path.resolve(process.cwd(), '.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
    return;
  }
}

loadEnvFile();

const rootDir = process.cwd();

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value === '') return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new Error(`${name} 必须是 true 或 false`);
}

function envPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} 必须是正整数`);
  return value;
}

export type ProductionConfigInput = {
  jwtSecret: string;
  appApiToken: string;
  inviteCodeSecret: string;
  corsOrigin: string;
  deviceAuthDualMode: boolean;
  modelLegacyV1Allowed: boolean;
  securityMigrationMode: boolean;
};

export function validateProductionConfig(input: ProductionConfigInput): void {
  const errors: string[] = [];
  if ([DEFAULT_JWT_SECRET, DEFAULT_JWT_SECRET_EXAMPLE].includes(input.jwtSecret)) {
    errors.push('JWT_SECRET 不能使用开发默认值');
  }
  if (input.appApiToken === DEFAULT_APP_API_TOKEN) errors.push('APP_API_TOKEN 不能使用开发默认值');
  if ([DEFAULT_INVITE_CODE_SECRET, DEFAULT_INVITE_CODE_SECRET_EXAMPLE].includes(input.inviteCodeSecret)) {
    errors.push('INVITE_CODE_SECRET 不能使用开发默认值');
  }
  if (input.corsOrigin.split(',').some((origin) => origin.trim() === '*')) {
    errors.push('CORS_ORIGIN 不能使用 *');
  }
  if (input.deviceAuthDualMode && !input.securityMigrationMode) errors.push('DEVICE_AUTH_DUAL_MODE 必须为 false，或显式开启 SECURITY_MIGRATION_MODE');
  if (input.modelLegacyV1Allowed && !input.securityMigrationMode) errors.push('MODEL_LEGACY_V1_ALLOWED 必须为 false，或显式开启 SECURITY_MIGRATION_MODE');
  if (errors.length > 0) throw new Error(`生产配置校验失败：${errors.join('；')}`);
}

const raw = {
  nodeEnv: (process.env.NODE_ENV || 'development') as AppEnv,
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  uploadDir: path.resolve(rootDir, process.env.UPLOAD_DIR || './uploads'),
  maxUploadSize: Number(process.env.MAX_UPLOAD_SIZE || 209715200),
  logLevel: process.env.LOG_LEVEL || 'info',
  appApiToken: process.env.APP_API_TOKEN || DEFAULT_APP_API_TOKEN,
  deviceAuthDualMode: envBoolean('DEVICE_AUTH_DUAL_MODE', true),
  deviceTokenTtlSeconds: envPositiveInt('DEVICE_TOKEN_TTL_SECONDS', 15 * 60),
  deviceChallengeTtlSeconds: envPositiveInt('DEVICE_CHALLENGE_TTL_SECONDS', 5 * 60),
  deviceRequestClockSkewSeconds: envPositiveInt('DEVICE_REQUEST_CLOCK_SKEW_SECONDS', 5 * 60),
  modelContainerV2Enabled: envBoolean('MODEL_CONTAINER_V2_ENABLED', false),
  modelLegacyV1Allowed: envBoolean('MODEL_LEGACY_V1_ALLOWED', true),
  securityMigrationMode: envBoolean('SECURITY_MIGRATION_MODE', false),
  modelManifestSigningPrivateKey: process.env.MODEL_MANIFEST_SIGNING_PRIVATE_KEY_B64
    ? Buffer.from(process.env.MODEL_MANIFEST_SIGNING_PRIVATE_KEY_B64, 'base64').toString('utf8')
    : (process.env.MODEL_MANIFEST_SIGNING_PRIVATE_KEY || ''),
  modelManifestSigningKeyId: process.env.MODEL_MANIFEST_SIGNING_KEY_ID || '',
  privacyConsentMinAppCode: Number(process.env.PRIVACY_CONSENT_MIN_APP_CODE || 147),
  inviteCodeSecret: process.env.INVITE_CODE_SECRET || process.env.JWT_SECRET || DEFAULT_INVITE_CODE_SECRET,
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

if (!raw.jwtSecret || raw.jwtSecret.length < 8) {
  throw new Error('JWT_SECRET 长度必须 >= 8');
}

if (raw.nodeEnv === 'production') validateProductionConfig(raw);

export const config = {
  ...raw,
  isProd: raw.nodeEnv === 'production',
  rootDir,
  prismaSchemaDir: path.resolve(rootDir, 'prisma'),
};
export type Config = typeof config;
