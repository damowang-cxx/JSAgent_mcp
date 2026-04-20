import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  evidence: z.record(z.string(), z.unknown()).optional(),
  notes: z.array(z.string()).optional(),
  status: z.enum(['passed', 'failed', 'partial']),
  targetUrl: z.string().optional(),
  taskId: z.string()
});

type MarkAcceptanceParams = z.infer<typeof schema>;

export const markAcceptanceTool = defineTool<MarkAcceptanceParams>({
  name: 'mark_acceptance',
  description: 'Record a manual or external acceptance result for a patch task.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const acceptance = await context.runtime.getAcceptanceRecorder().record(params);
    const latestPlan = await context.runtime.getPatchPlanManager().getLatestPlan(params.taskId);
    if (params.status === 'passed' && latestPlan) {
      await context.runtime.getPatchPlanManager().markAccepted(latestPlan.planId);
    }

    return {
      acceptance
    };
  }
});
