import { z } from 'zod';

import type { PythonVerificationResult } from '../../port/types.js';

export const pythonVerificationSchema = z
  .object({
    divergence: z.unknown().nullable().optional(),
    nodeOutput: z.unknown().optional(),
    notes: z.array(z.string()),
    ok: z.boolean(),
    pythonOutput: z.unknown().optional(),
    verifiedAt: z.string()
  })
  .passthrough();

export function asPythonVerification(value: z.infer<typeof pythonVerificationSchema>): PythonVerificationResult {
  return value as PythonVerificationResult;
}
