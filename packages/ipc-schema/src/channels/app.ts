import { z } from 'zod';

export const versionRequest = z.object({});

export const versionResponse = z.object({
  app: z.string(),
  electron: z.string(),
  chrome: z.string(),
  node: z.string(),
});

export type VersionRequest = z.infer<typeof versionRequest>;
export type VersionResponse = z.infer<typeof versionResponse>;
