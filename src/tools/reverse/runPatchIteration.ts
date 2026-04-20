import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { patchRunOptionsSchema } from './patchToolHelpers.js';
import { fixtureSourceSchema } from './rebuildToolHelpers.js';

const schema = z.object({
  autoApplyFirstSuggestion: z.boolean().optional(),
  bundleDir: z.string().optional(),
  expected: z.unknown().optional(),
  fixtureSource: fixtureSourceSchema.optional(),
  run: patchRunOptionsSchema,
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type RunPatchIterationParams = z.infer<typeof schema>;

export const runPatchIterationTool = defineTool<RunPatchIterationParams>({
  name: 'run_patch_iteration',
  description: 'Run one first-divergence-centered patch iteration and immediately retest the rebuild bundle.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    iteration: await context.runtime.getPatchLoopRunner().runIteration(params)
  })
});
