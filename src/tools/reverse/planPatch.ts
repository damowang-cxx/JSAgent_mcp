import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { asRebuildRunResult, extractFixtureForSource, fixtureSourceSchema, rebuildRunResultSchema } from './rebuildToolHelpers.js';

const schema = z.object({
  fixtureSource: fixtureSourceSchema.optional(),
  runResult: rebuildRunResultSchema,
  taskId: z.string().optional()
});

type PlanPatchParams = z.infer<typeof schema>;

export const planPatchTool = defineTool<PlanPatchParams>({
  name: 'plan_patch',
  description: 'Create a managed patch plan from a rebuild run result and its current first divergence.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const fixture = await extractFixtureForSource(context.runtime, params.fixtureSource);
    const runResult = asRebuildRunResult(params.runResult);
    const comparison = await context.runtime.getDivergenceComparator().compare({
      fixture: fixture ?? undefined,
      runResult
    });
    const patch = await context.runtime.getPatchAdvisor().suggest({
      divergence: comparison.divergence,
      fixture: fixture ?? undefined,
      runResult
    });
    const plan = await context.runtime.getPatchPlanManager().createPlan({
      divergence: comparison.divergence,
      notes: ['Created by plan_patch from a supplied rebuild run result.'],
      suggestions: patch.suggestions,
      taskId: params.taskId
    });

    return {
      comparison,
      plan
    };
  }
});
