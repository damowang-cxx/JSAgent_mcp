import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional()
});

type ListRegressionBaselinesParams = z.infer<typeof schema>;

export const listRegressionBaselinesTool = defineTool<ListRegressionBaselinesParams>({
  name: 'list_regression_baselines',
  description: 'List artifact-backed regression baselines for a task.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    baselines: await context.runtime.getBaselineRegistry().list(params.taskId)
  })
});
