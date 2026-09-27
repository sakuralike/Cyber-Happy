import { z } from 'zod';
import { rangeQuerySchema } from '../../lib/zod';

export const dashboardQuerySchema = rangeQuerySchema;
export const metricBackfillSchema = z.object({
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'from 必须是 YYYY-MM-DD'),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'to 必须是 YYYY-MM-DD'),
}).refine((value) => value.from <= value.to, { path: ['to'], message: 'to 不能早于 from' });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type MetricBackfillInput = z.infer<typeof metricBackfillSchema>;
