import { z } from 'zod';
import { listQuerySchema, dateStr } from '../../lib/zod';

export const auditLogListSchema = listQuerySchema.extend({
  module: z.string().trim().optional(),
  action: z.string().trim().optional(),
  operatorId: z.string().trim().optional(),
  result: z.string().trim().optional(),
  targetType: z.string().trim().optional(),
  createdFrom: dateStr,
  createdTo: dateStr,
});

export type AuditLogListQuery = z.infer<typeof auditLogListSchema>;
