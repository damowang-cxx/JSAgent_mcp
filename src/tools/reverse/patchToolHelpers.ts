import { z } from 'zod';

export const patchSuggestionSchema = z.object({
  basedOn: z.array(z.string()),
  confidence: z.number(),
  patchType: z.enum(['shim', 'polyfill', 'value-seed', 'defer-and-observe']),
  reason: z.string(),
  suggestedCode: z.string().optional(),
  target: z.string()
});

export const patchRunOptionsSchema = z
  .object({
    envOverrides: z.record(z.string(), z.unknown()).optional(),
    timeoutMs: z.number().int().positive().optional()
  })
  .optional();
