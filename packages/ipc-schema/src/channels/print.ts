import { z } from 'zod';

export const toPdfRequest = z.object({
  path: z.string().optional(),
  options: z
    .object({
      landscape: z.boolean().optional(),
      scale: z.number().optional(),
      marginsMM: z
        .object({
          top: z.number(),
          bottom: z.number(),
          left: z.number(),
          right: z.number(),
        })
        .optional(),
    })
    .optional(),
});

export const toPdfResponse = z.union([
  z.object({ cancelled: z.literal(true) }),
  z.object({
    cancelled: z.literal(false),
    path: z.string(),
    bytesWritten: z.number().int().nonnegative(),
  }),
]);

export type ToPdfRequest = z.infer<typeof toPdfRequest>;
export type ToPdfResponse = z.infer<typeof toPdfResponse>;
