import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional()
});

type ListPatchHistoryParams = z.infer<typeof schema>;

export const listPatchHistoryTool = defineTool<ListPatchHistoryParams>({
  name: 'list_patch_history',
  description: 'List managed patch plans, applied patch records, and task acceptance records cached by this runtime.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    acceptances: params.taskId ? await context.runtime.getAcceptanceRecorder().list(params.taskId) : [],
    applied: await context.runtime.getPatchPlanManager().listApplied(params.taskId),
    plans: await context.runtime.getPatchPlanManager().listPlans(params.taskId)
  })
});
