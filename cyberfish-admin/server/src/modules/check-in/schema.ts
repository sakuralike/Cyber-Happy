import { z } from 'zod';
import { listQuerySchema } from '../../lib/zod';

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, '月份格式应为 YYYY-MM');

export const historySchema = listQuerySchema.extend({
  month: monthSchema.optional(),
});

export type HistoryQuery = z.infer<typeof historySchema>;
