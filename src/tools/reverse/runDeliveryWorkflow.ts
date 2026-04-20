import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { sdkTargetSchema } from './taskToolHelpers.js';

const schema = z.object({
  target: sdkTargetSchema.optional(),
  taskId: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  writeEvidence: z.boolean().optional()
});

type RunDeliveryWorkflowParams = z.infer<typeof schema>;

export const runDeliveryWorkflowTool = defineTool<RunDeliveryWorkflowParams>({
  name: 'run_delivery_workflow',
  description: 'Run the delivery workflow: gates, baseline, regression, and SDK packaging.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    result: await context.runtime.getDeliveryWorkflowRunner().run(params)
  })
});
