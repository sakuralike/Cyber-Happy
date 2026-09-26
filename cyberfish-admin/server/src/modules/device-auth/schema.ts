import { z } from 'zod';

const deviceId = z.string().trim().min(1).max(200);
const signingKeyId = z.string().trim().min(1).max(120);

export const enrollDeviceSchema = z.object({
  deviceId,
  signingPublicKey: z.string().trim().min(80).max(10000),
  securityLevel: z.enum(['SOFTWARE', 'TEE', 'STRONGBOX', 'UNKNOWN']),
  appVersionCode: z.number().int().nonnegative(),
});

export const createChallengeSchema = z.object({
  deviceId,
  signingKeyId,
});

export const exchangeTokenSchema = z.object({
  deviceId,
  signingKeyId,
  challengeId: z.string().trim().min(1).max(200),
  challenge: z.string().trim().min(20).max(500),
  signature: z.string().trim().min(40).max(1000),
});

export const revokeDeviceParamSchema = z.object({
  id: z.string().trim().min(1),
});

export type EnrollDeviceInput = z.infer<typeof enrollDeviceSchema>;
export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
export type ExchangeTokenInput = z.infer<typeof exchangeTokenSchema>;
