import { z } from 'zod';

export const appEventSchema = z.object({
  deviceId: z.string().trim().min(1).max(200),
  userId: z.string().trim().max(200).optional(),
  channel: z.string().trim().max(50).default('official'),
  deviceModel: z.string().trim().max(100).optional(),
  appVersionCode: z.number().int().nonnegative().default(0),
  modelVersion: z.string().trim().max(100).default(''),
  eventType: z.enum([
    'LAUNCH',
    'TRIGGER',
    'MODEL_CALL',
    'MISREPORT',
    'CRASH',
    'CHECKIN_ENTRY_EXPOSE',
    'CHECKIN_PAGE_VIEW',
    'CHECKIN_SUCCESS',
    'CHECKIN_FAIL',
    'MILESTONE_POPUP_VIEW',
  ]),
  count: z.number().int().positive().max(1000000).default(1),
  payload: z.record(z.unknown()).default({}),
  occurredAt: z.string().datetime().optional(),
});

export type AppEventInput = z.infer<typeof appEventSchema>;
