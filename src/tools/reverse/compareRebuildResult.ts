import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { asRebuildRunResult, extractFixtureForSource, fixtureSourceSchema, rebuildRunResultSchema } from './rebuildToolHelpers.js';

const schema = z.object({
  expected: z.unknown().optional(),
  fixtureSource: fixtureSourceSchema.optional(),
  runResult: rebuildRunResultSchema
});

type CompareRebuildResultParams = z.infer<typeof schema>;

export const compareRebuildResultTool = defineTool<CompareRebuildResultParams>({
  name: 'compare_rebuild_result',
  description: 'Compare a rebuild probe result with expected output or fixture context and return the first divergence.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    const fixture = await extractFixtureForSource(context.runtime, params.fixtureSource);

    return {
      comparison: await context.runtime.getDivergenceComparator().compare({
        expected: params.expected,
        fixture: fixture ?? undefined,
        runResult: asRebuildRunResult(params.runResult)
      })
    };
  }
});
