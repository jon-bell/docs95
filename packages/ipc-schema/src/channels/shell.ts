import { z } from 'zod';

const httpOrMailtoUrl = z.string().regex(/^(https?:\/\/|mailto:)/);

export const openExternalRequest = z.object({
  url: httpOrMailtoUrl,
});

export const openExternalResponse = z.object({
  ok: z.boolean(),
});

export type OpenExternalRequest = z.infer<typeof openExternalRequest>;
export type OpenExternalResponse = z.infer<typeof openExternalResponse>;
