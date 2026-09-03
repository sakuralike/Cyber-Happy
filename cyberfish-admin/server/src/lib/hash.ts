import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function sha256Stream(): crypto.Hash {
  return crypto.createHash('sha256');
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** CRC32：用于灰度百分比的稳定哈希，保证同一设备结果恒定 */
export function crc32(input: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 灰度命中判定：稳定哈希 % 100 < 百分比 */
export function inGray(seed: string, percent: number): boolean {
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  return crc32(seed) % 100 < percent;
}

export function randomHex(bytes = 8): string {
  return crypto.randomBytes(bytes).toString('hex');
}
