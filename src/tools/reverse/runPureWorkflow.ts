import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { pureSourceSchema } from './pureToolHelpers.js';

const schema = z.object({
  overwrite: z.boolean().optional(),
  probeExpressions: z.array(z.string()).optional(),
  source: pureSourceSchema.optional(),
  targetFunctionName: z.string().optional(),
  taskId: z.string().optional(),
  traceTimeoutMs: z.number().int().positive().optional(),
  verifyTimeoutMs: z.number().int().positive().optional(),
  writeEvidence: z.boolean().optional()
});

type RunPureWorkflowParams = z.infer<typeof schema>;

export const runPureWorkflowTool = defineTool<RunPureWorkflowParams>({
  name: 'run_pure_workflow',
  description: 'Run PureExtraction workflow: freeze, trace, boundary, fixture, Node pure scaffold, and verification.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    ...(await context.runtime.getPureExtractionRunner().run(params))
  })
});
