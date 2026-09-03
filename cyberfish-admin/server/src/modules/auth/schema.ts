import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(2, '用户名至少 2 个字符').max(50),
  password: z.string().min(6, '密码至少 6 个字符').max(100),
});

export type LoginInput = z.infer<typeof loginSchema>;
