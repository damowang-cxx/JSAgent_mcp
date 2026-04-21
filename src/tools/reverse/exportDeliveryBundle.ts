import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { sdkTargetSchema } from './taskToolHelpers.js';

const schema = z.object({
  overwrite: z.boolean().optional(),
  target: sdkTargetSchema.optional(),
  taskId: z.string().optional()
});

type ExportDeliveryBundleParams = z.infer<typeof schema>;

export const exportDeliveryBundleTool = defineTool<ExportDeliveryBundleParams>({
  name: 'export_delivery_bundle',
  description: 'Export a stronger delivery bundle with verified implementation files and smoke entries.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    bundle: await context.runtime.getDeliveryAssembler().assemble(params)
  })
});
