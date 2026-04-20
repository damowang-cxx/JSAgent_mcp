import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  notes: z.array(z.string()).optional(),
  source: z.enum(['pure', 'port']).optional(),
  taskId: z.string().optional()
});

type RegisterRegressionBaselineParams = z.infer<typeof schema>;

export const registerRegressionBaselineTool = defineTool<RegisterRegressionBaselineParams>({
  name: 'register_regression_baseline',
  description: 'Register a fixture-based regression baseline after pure or port gate passes.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    baseline: await context.runtime.getBaselineRegistry().register(params)
  })
});
