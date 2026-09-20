import { z } from 'zod';
import { dateStr, listQuerySchema } from '../../lib/zod';

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, '月份格式应为 YYYY-MM');

export const historySchema = listQuerySchema.extend({
  month: monthSchema.optional(),
});

export type HistoryQuery = z.infer<typeof historySchema>;

export const checkInBodySchema = z.object({
  deviceId: z.string().trim().min(1).max(200),
});
export type CheckInBody = z.infer<typeof checkInBodySchema>;

export const riskEventQuerySchema = listQuerySchema.extend({
  reason: z.string().trim().min(1).max(50).optional(),
  from: dateStr,
  to: dateStr,
});
export type RiskEventQuery = z.infer<typeof riskEventQuerySchema>;

const dateKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, '日期格式应为 YYYY-MM-DD');

export const checkInStatsQuerySchema = z.object({
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
}).superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '开始日期不能晚于结束日期', path: ['from'] });
  }
});
export type CheckInStatsQuery = z.infer<typeof checkInStatsQuerySchema>;
