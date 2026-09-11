import { z } from 'zod';
import { listQuerySchema } from '../../lib/zod';

const usernameSchema = z.string().trim().min(2, '用户名至少 2 个字符').max(50);
const passwordSchema = z.string().min(6, '密码至少 6 个字符').max(100);
const emailSchema = z.union([z.string().trim().email().max(160), z.literal('')]);

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1, '昵称不能为空').max(80).optional(),
  email: emailSchema.optional(),
});

export const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const updateMeSchema = z.object({
  displayName: z.string().trim().min(1, '昵称不能为空').max(80),
  email: emailSchema.optional(),
});

export const feedbackSchema = z.object({
  content: z.string().trim().min(1, '反馈内容不能为空').max(2000),
  contact: z.string().trim().max(160).optional(),
});

export const feedbackListSchema = listQuerySchema;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
export type FeedbackListQuery = z.infer<typeof feedbackListSchema>;
