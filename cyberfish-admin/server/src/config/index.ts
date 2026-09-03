import path from 'node:path';
import fs from 'node:fs';

export type AppEnv = 'development' | 'production' | 'test';

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

const raw = {
  nodeEnv: (process.env.NODE_ENV || 'development') as AppEnv,
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  jwtSecret: process.env.JWT_SECRET || 'cyberfish-admin-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  uploadDir: path.resolve(rootDir, process.env.UPLOAD_DIR || './uploads'),
  maxUploadSize: Number(process.env.MAX_UPLOAD_SIZE || 209715200),
  logLevel: process.env.LOG_LEVEL || 'info',
  appApiToken: process.env.APP_API_TOKEN || 'cyberfish-app-token-dev',
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

if (!raw.jwtSecret || raw.jwtSecret.length < 8) {
  throw new Error('JWT_SECRET 长度必须 >= 8');
}

export const config = {
  ...raw,
  isProd: raw.nodeEnv === 'production',
  rootDir,
  prismaSchemaDir: path.resolve(rootDir, 'prisma'),
};
export type Config = typeof config;
