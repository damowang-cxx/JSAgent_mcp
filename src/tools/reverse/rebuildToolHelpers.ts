import { z } from 'zod';

import type { AppRuntime } from '../../runtime/AppRuntime.js';
import type { RebuildRunResult, RuntimeFixture } from '../../rebuild/types.js';

export const rebuildBundleOptionsSchema = z.object({
  entryStrategy: z.enum(['single-file', 'top-priority-merged']).optional(),
  includeAccessLogger: z.boolean().optional(),
  includeEnvShim: z.boolean().optional(),
  includeFixture: z.boolean().optional(),
  overwrite: z.boolean().optional(),
  sourceUrl: z.string().optional(),
  targetFunctionName: z.string().optional(),
  taskId: z.string().optional(),
  topFileUrl: z.string().optional(),
  topN: z.number().int().positive().optional()
});

export const rebuildRunResultSchema = z
  .object({
    durationMs: z.number(),
    endedAt: z.string(),
    envAccessLog: z.array(z.unknown()).optional(),
    envAccessSummary: z
      .object({
        byType: z.record(z.string(), z.number()),
        total: z.number()
      })
      .optional(),
    exitCode: z.number().int().nullable(),
    ok: z.boolean(),
    parsedError: z.unknown().optional(),
    parsedResult: z.unknown().optional(),
    signal: z.string().nullable(),
    startedAt: z.string(),
    stderr: z.string(),
    stdout: z.string(),
    warnings: z.array(z.string()).optional()
  })
  .passthrough();

export const fixtureSourceSchema = z.enum(['current-page', 'analyze-target-last']);

export async function extractFixtureForSource(
  runtime: AppRuntime,
  source: 'current-page' | 'analyze-target-last' | undefined
): Promise<RuntimeFixture | null> {
  const lastAnalyze = runtime.getAnalyzeTargetRunner().getLastAnalyzeTargetResult();

  if (source === 'analyze-target-last') {
    return lastAnalyze ? runtime.getFixtureExtractor().extractFromAnalyzeTargetResult(lastAnalyze) : null;
  }

  try {
    return await runtime.getFixtureExtractor().extractFromCurrentPage({
      analyzeTargetResult: lastAnalyze
    });
  } catch {
    return lastAnalyze ? runtime.getFixtureExtractor().extractFromAnalyzeTargetResult(lastAnalyze) : null;
  }
}

export function asRebuildRunResult(value: z.infer<typeof rebuildRunResultSchema>): RebuildRunResult {
  return value as RebuildRunResult;
}
