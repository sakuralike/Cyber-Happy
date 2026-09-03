import { z } from 'zod';
import { rangeQuerySchema } from '../../lib/zod';

export const dashboardQuerySchema = rangeQuerySchema;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
