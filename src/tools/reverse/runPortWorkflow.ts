import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  overwrite: z.boolean().optional(),
  taskId: z.string().optional(),
  verifyTimeoutMs: z.number().int().positive().optional(),
  writeEvidence: z.boolean().optional()
});

type RunPortWorkflowParams = z.infer<typeof schema>;

export const runPortWorkflowTool = defineTool<RunPortWorkflowParams>({
  name: 'run_port_workflow',
  description: 'Run the port workflow: gate check, Python scaffold, cross-language verification, and diff.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    result: await context.runtime.getPortWorkflowRunner().run(params)
  })
});
