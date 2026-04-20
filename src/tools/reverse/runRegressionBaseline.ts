import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  baselineId: z.string().optional(),
  taskId: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  writeEvidence: z.boolean().optional()
});

type RunRegressionBaselineParams = z.infer<typeof schema>;

export const runRegressionBaselineTool = defineTool<RunRegressionBaselineParams>({
  name: 'run_regression_baseline',
  description: 'Run the registered Node/Python regression baseline and report first divergence.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    regression: await context.runtime.getRegressionRunner().run(params)
  })
});
