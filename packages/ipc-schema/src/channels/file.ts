import { z } from 'zod';

const DialogFilter = z.object({
  name: z.string(),
  extensions: z.array(z.string()),
});

export const openDialogRequest = z.object({
  title: z.string().optional(),
  filters: z.array(DialogFilter).optional(),
});

export const openDialogResponse = z.union([
  z.object({ cancelled: z.literal(true) }),
  z.object({ cancelled: z.literal(false), path: z.string() }),
]);

export const saveDialogRequest = z.object({
  title: z.string().optional(),
  defaultPath: z.string().optional(),
  filters: z.array(DialogFilter).optional(),
});

export const saveDialogResponse = z.union([
  z.object({ cancelled: z.literal(true) }),
  z.object({ cancelled: z.literal(false), path: z.string() }),
]);

export const readBytesRequest = z.object({
  path: z.string(),
});

export const readBytesResponse = z.object({
  bytes: z.string(), // base64-encoded
  size: z.number().int().nonnegative(),
});

export const writeBytesRequest = z.object({
  path: z.string(),
  bytes: z.string(), // base64-encoded
  atomic: z.boolean().optional(),
});

export const writeBytesResponse = z.object({
  ok: z.literal(true),
  bytesWritten: z.number().int().nonnegative(),
});

// Type exports
export type OpenDialogRequest = z.infer<typeof openDialogRequest>;
export type OpenDialogResponse = z.infer<typeof openDialogResponse>;
export type SaveDialogRequest = z.infer<typeof saveDialogRequest>;
export type SaveDialogResponse = z.infer<typeof saveDialogResponse>;
export type ReadBytesRequest = z.infer<typeof readBytesRequest>;
export type ReadBytesResponse = z.infer<typeof readBytesResponse>;
export type WriteBytesRequest = z.infer<typeof writeBytesRequest>;
export type WriteBytesResponse = z.infer<typeof writeBytesResponse>;
