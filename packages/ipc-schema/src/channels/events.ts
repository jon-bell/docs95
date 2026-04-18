import { z } from 'zod';

export const menuCommandPayload = z.object({
  commandId: z.string(),
});

export const documentExternalChangePayload = z.object({
  path: z.string(),
});

export type MenuCommandPayload = z.infer<typeof menuCommandPayload>;
export type DocumentExternalChangePayload = z.infer<typeof documentExternalChangePayload>;
