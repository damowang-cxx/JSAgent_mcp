import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  basedOnBaselineId: z.string().optional(),
  label: z.string(),
  notes: z.array(z.string()).optional(),
  taskId: z.string().optional()
});

type RegisterUpgradeBaselineParams = z.infer<typeof schema>;

export const registerUpgradeBaselineTool = defineTool<RegisterUpgradeBaselineParams>({
  name: 'register_upgrade_baseline',
  description: 'Register a versioned upgrade baseline after regression or delivery gate passes.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    baseline: await context.runtime.getVersionedBaselineRegistry().registerVersion(params)
  })
});
