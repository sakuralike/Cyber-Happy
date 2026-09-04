import { z } from 'zod';

export const updateSiteConfigSchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().max(10000).default(''),
  apkUrl: z.string().trim().max(500).optional().nullable(),
  apkFileId: z.string().trim().min(1).optional().nullable(),
});

export type UpdateSiteConfigInput = z.infer<typeof updateSiteConfigSchema>;
