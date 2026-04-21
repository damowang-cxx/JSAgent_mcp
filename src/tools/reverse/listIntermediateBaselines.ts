import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional()
});

type ListIntermediateBaselinesParams = z.infer<typeof schema>;

export const listIntermediateBaselinesTool = defineTool<ListIntermediateBaselinesParams>({
  name: 'list_intermediate_baselines',
  description: 'List registered intermediate baselines and probes for a task.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    baselines: await context.runtime.getIntermediateProbeRegistry().listBaselines(params.taskId),
    probes: params.taskId ? await context.runtime.getIntermediateProbeRegistry().list(params.taskId) : []
  })
});
