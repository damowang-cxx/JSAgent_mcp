import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { asRebuildRunResult, extractFixtureForSource, fixtureSourceSchema, rebuildRunResultSchema } from './rebuildToolHelpers.js';

const schema = z.object({
  fixtureSource: fixtureSourceSchema.optional(),
  runResult: rebuildRunResultSchema
});

type DiffEnvRequirementsParams = z.infer<typeof schema>;

export const diffEnvRequirementsTool = defineTool<DiffEnvRequirementsParams>({
  name: 'diff_env_requirements',
  description: 'Generate deterministic patch suggestions around the first rebuild divergence or env access miss.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    const fixture = await extractFixtureForSource(context.runtime, params.fixtureSource);
    const runResult = asRebuildRunResult(params.runResult);
    const comparison = await context.runtime.getDivergenceComparator().compare({
      fixture: fixture ?? undefined,
      runResult
    });

    return {
      comparison,
      patch: await context.runtime.getPatchAdvisor().suggest({
        divergence: comparison.divergence,
        fixture: fixture ?? undefined,
        runResult
      })
    };
  }
});
