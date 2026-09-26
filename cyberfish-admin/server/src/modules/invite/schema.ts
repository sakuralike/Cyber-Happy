import { z } from 'zod';
import { listQuerySchema } from '../../lib/zod';

export const inviteModeSchema = z.enum(['SINGLE', 'MULTI']);
export const inviteStatusSchema = z.enum(['ACTIVE', 'EXPIRED', 'EXHAUSTED', 'REVOKED']);

export const createInviteSchema = z.object({
  mode: inviteModeSchema,
  quantity: z.number().int().min(1).max(500),
  maxUses: z.number().int().min(1).max(100000),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().trim().max(300).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.mode === 'SINGLE' && value.maxUses !== 1)
    ctx.addIssue({ code: 'custom', path: ['maxUses'], message: '单次邀请码的最大使用次数必须为 1' });
  if (value.mode === 'MULTI' && value.maxUses < 2)
    ctx.addIssue({ code: 'custom', path: ['maxUses'], message: '多次邀请码的最大使用次数至少为 2' });
  if (value.expiresAt && new Date(value.expiresAt).getTime() <= Date.now())
    ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: '失效时间必须晚于当前时间' });
});

export const inviteListSchema = listQuerySchema.extend({
  mode: inviteModeSchema.optional(),
  status: inviteStatusSchema.optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
});

export const inviteIdSchema = z.object({ id: z.string().trim().min(1) });
export const redemptionListSchema = listQuerySchema;

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type InviteListQuery = z.infer<typeof inviteListSchema>;
export type RedemptionListQuery = z.infer<typeof redemptionListSchema>;
