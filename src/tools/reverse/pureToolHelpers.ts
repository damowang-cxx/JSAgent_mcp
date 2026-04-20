import { z } from 'zod';

import type { PureBoundary, PureFixture, RuntimeTraceExport } from '../../pure/types.js';

export const pureSourceSchema = z.enum(['patch-last', 'analyze-target-last', 'current-page']);

export const runtimeTraceSchema = z
  .object({
    createdAt: z.string(),
    records: z.array(z.unknown()),
    sourceBundleDir: z.string(),
    targetFunctionName: z.string().nullable().optional(),
    warnings: z.array(z.string())
  })
  .passthrough();

export const pureBoundarySchema = z
  .object({
    createdAt: z.string(),
    derivedInputs: z.array(z.string()),
    environmentState: z.array(z.string()),
    excludedRuntimeNoise: z.array(z.string()),
    explicitInputs: z.array(z.string()),
    intermediates: z.array(z.string()),
    notes: z.array(z.string()),
    outputs: z.array(z.string())
  })
  .passthrough();

export const pureFixtureSchema = z
  .object({
    boundary: pureBoundarySchema,
    createdAt: z.string(),
    expectedOutput: z.unknown(),
    input: z.record(z.string(), z.unknown()),
    intermediates: z.record(z.string(), z.unknown()).optional(),
    notes: z.array(z.string()),
    source: z.object({
      sampleType: z.string(),
      taskId: z.string().nullable().optional()
    })
  })
  .passthrough();

export function asRuntimeTrace(value: z.infer<typeof runtimeTraceSchema>): RuntimeTraceExport {
  return value as RuntimeTraceExport;
}

export function asPureBoundary(value: z.infer<typeof pureBoundarySchema>): PureBoundary {
  return value as PureBoundary;
}

export function asPureFixture(value: z.infer<typeof pureFixtureSchema>): PureFixture {
  return value as PureFixture;
}
