import { z } from 'zod';

export const setTitleRequest = z.object({
  title: z.string().max(512),
});

export const setTitleResponse = z.object({
  ok: z.literal(true),
});

export type SetTitleRequest = z.infer<typeof setTitleRequest>;
export type SetTitleResponse = z.infer<typeof setTitleResponse>;
