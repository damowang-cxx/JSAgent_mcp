import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  goal: z.string().optional(),
  slug: z.string().optional(),
  targetUrl: z.string().optional(),
  taskId: z.string()
});

type OpenReverseTaskParams = z.infer<typeof schema>;

export const openReverseTaskTool = defineTool<OpenReverseTaskParams>({
  name: 'open_reverse_task',
  description: 'Create or open a minimal reverse task artifact directory.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    ...(await context.runtime.getEvidenceStore().openTask(params))
  })
});
