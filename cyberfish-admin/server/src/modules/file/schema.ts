import { z } from 'zod';
import { FileBizType } from '../../lib/enums';

export const uploadQuerySchema = z.object({
  bizType: z.nativeEnum(FileBizType),
});

export const fileIdParamSchema = z.object({ id: z.string().min(1) });

export type UploadQuery = z.infer<typeof uploadQuerySchema>;
