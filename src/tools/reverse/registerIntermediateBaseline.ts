import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  notes: z.array(z.string()).optional(),
  taskId: z.string().optional()
});

type RegisterIntermediateBaselineParams = z.infer<typeof schema>;

export const registerIntermediateBaselineTool = defineTool<RegisterIntermediateBaselineParams>({
  name: 'register_intermediate_baseline',
  description: 'Register an artifact-backed intermediate baseline from fixture.intermediates and probe registry data.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const baseline = await context.runtime.getIntermediateProbeRegistry().registerBaseline(params);
    return { baseline };
  }
});
