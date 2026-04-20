import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { pureSourceSchema } from './pureToolHelpers.js';

const schema = z.object({
  source: pureSourceSchema.optional(),
  taskId: z.string().optional()
});

type FreezeRuntimeSampleParams = z.infer<typeof schema>;

export const freezeRuntimeSampleTool = defineTool<FreezeRuntimeSampleParams>({
  name: 'freeze_runtime_sample',
  description: 'Freeze an accepted runtime sample after the PureExtraction gate is satisfied.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    frozenSample: await context.runtime.getFreezeManager().freeze(params)
  })
});
