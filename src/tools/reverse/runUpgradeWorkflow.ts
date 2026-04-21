import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  versionLabel: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type RunUpgradeWorkflowParams = z.infer<typeof schema>;

export const runUpgradeWorkflowTool = defineTool<RunUpgradeWorkflowParams>({
  name: 'run_upgrade_workflow',
  description: 'Run artifact-backed upgrade regression using versioned baseline, regression, and intermediate alignment.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    result: await context.runtime.getUpgradeWorkflowRunner().run(params)
  })
});
