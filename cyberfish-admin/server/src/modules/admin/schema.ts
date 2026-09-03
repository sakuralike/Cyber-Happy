import { z } from 'zod';
import { AdminRole, ActiveStatus } from '../../lib/enums';
import { listQuerySchema } from '../../lib/zod';

export const adminListSchema = listQuerySchema.extend({
  role: z.string().trim().optional(),
  status: z.string().trim().optional(),
});

export const createAdminSchema = z.object({
  username: z.string().trim().min(2).max(50),
  password: z.string().min(6, '密码至少 6 位').max(100),
  displayName: z.string().trim().min(1).max(50),
  role: z.nativeEnum(AdminRole),
  email: z.string().email('邮箱格式不合法').optional().or(z.literal('')),
});

export const updateAdminSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  role: z.nativeEnum(AdminRole).optional(),
  status: z.nativeEnum(ActiveStatus).optional(),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(6).max(100).optional(),
});

export type AdminListQuery = z.infer<typeof adminListSchema>;
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
