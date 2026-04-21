import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  baselineId: z.string().optional(),
  taskId: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  writeEvidence: z.boolean().optional()
});

type RunIntermediateRegressionParams = z.infer<typeof schema>;

export const runIntermediateRegressionTool = defineTool<RunIntermediateRegressionParams>({
  name: 'run_intermediate_regression',
  description: 'Run intermediate-first regression and report first divergence or honest missing-data notes.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    result: await context.runtime.getIntermediateRegressionRunner().run(params)
  })
});
