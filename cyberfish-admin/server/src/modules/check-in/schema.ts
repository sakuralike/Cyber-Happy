import { z } from 'zod';
import { dateStr, listQuerySchema } from '../../lib/zod';

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, '月份格式应为 YYYY-MM');

export const historySchema = listQuerySchema.extend({
  month: monthSchema.optional(),
});

export type HistoryQuery = z.infer<typeof historySchema>;

export const checkInBodySchema = z.object({
  deviceId: z.string().trim().min(1).max(200).optional(),
});
export type CheckInBody = z.infer<typeof checkInBodySchema>;

export const riskEventQuerySchema = listQuerySchema.extend({
  reason: z.string().trim().min(1).max(50).optional(),
  from: dateStr,
  to: dateStr,
});
export type RiskEventQuery = z.infer<typeof riskEventQuerySchema>;
