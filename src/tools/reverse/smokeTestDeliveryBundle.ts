import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { sdkTargetSchema } from './taskToolHelpers.js';

const schema = z.object({
  bundleDir: z.string(),
  target: sdkTargetSchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type SmokeTestDeliveryBundleParams = z.infer<typeof schema>;

export const smokeTestDeliveryBundleTool = defineTool<SmokeTestDeliveryBundleParams>({
  name: 'smoke_test_delivery_bundle',
  description: 'Run the minimal smoke test for a delivery bundle.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const smoke = await context.runtime.getDeliverySmokeTester().test({
      bundleDir: params.bundleDir,
      target: params.target ?? 'dual',
      timeoutMs: params.timeoutMs
    });
    if (params.writeSnapshot && params.taskId) {
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, 'delivery/smoke', smoke);
    }

    return {
      smoke,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
