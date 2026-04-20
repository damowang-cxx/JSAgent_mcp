import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { patchSuggestionSchema } from './patchToolHelpers.js';

const schema = z.object({
  bundleDir: z.string(),
  planId: z.string().optional(),
  suggestion: patchSuggestionSchema,
  targetFile: z.string().optional(),
  taskId: z.string().optional()
});

type ApplyPatchParams = z.infer<typeof schema>;

export const applyPatchTool = defineTool<ApplyPatchParams>({
  name: 'apply_patch',
  description: 'Apply one minimal patch suggestion to a rebuild bundle patch region.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const applied = await context.runtime.getPatchApplier().apply({
      bundleDir: params.bundleDir,
      planId: params.planId ?? null,
      suggestion: params.suggestion,
      targetFile: params.targetFile,
      taskId: params.taskId ?? null
    });

    await context.runtime.getPatchPlanManager().recordApplied(applied);
    if (params.planId) {
      await context.runtime.getPatchPlanManager().markApplied(params.planId, params.suggestion);
    }

    return {
      applied
    };
  }
});
