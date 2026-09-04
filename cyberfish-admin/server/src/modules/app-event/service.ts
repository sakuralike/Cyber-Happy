import { prisma } from '../../lib/prisma';
import type { AppEventInput } from './schema';

export async function record(input: AppEventInput) {
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  await prisma.$transaction([
    prisma.appUser.upsert({
      where: { deviceId: input.deviceId },
      create: {
        deviceId: input.deviceId,
        userId: input.userId ?? null,
        channel: input.channel,
        deviceModel: input.deviceModel ?? '',
        appVersionCode: input.appVersionCode,
        modelVersion: input.modelVersion,
        modelCallCount: input.eventType === 'MODEL_CALL' ? input.count : 0,
        triggerCount: input.eventType === 'TRIGGER' ? input.count : 0,
        firstSeenAt: occurredAt,
        lastActiveAt: occurredAt,
      },
      update: {
        userId: input.userId ?? undefined,
        channel: input.channel,
        deviceModel: input.deviceModel ?? undefined,
        appVersionCode: input.appVersionCode,
        modelVersion: input.modelVersion,
        lastActiveAt: occurredAt,
        ...(input.eventType === 'MODEL_CALL' ? { modelCallCount: { increment: input.count } } : {}),
        ...(input.eventType === 'TRIGGER' ? { triggerCount: { increment: input.count } } : {}),
      },
    }),
    prisma.appEvent.create({
      data: {
        deviceId: input.deviceId,
        eventType: input.eventType,
        appVersionCode: input.appVersionCode,
        modelVersion: input.modelVersion,
        count: input.count,
        payload: JSON.stringify(input.payload),
        occurredAt,
      },
    }),
  ]);
  return { accepted: true };
}
