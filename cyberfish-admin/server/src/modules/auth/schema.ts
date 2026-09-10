import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(2, '用户名至少 2 个字符').max(50),
  password: z.string().min(6, '密码至少 6 个字符').max(100),
});

export const updateMeSchema = z.object({
  displayName: z.string().trim().min(1, '显示名不能为空').max(80),
  email: z.union([z.string().trim().email().max(160), z.literal(''), z.null()]).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
