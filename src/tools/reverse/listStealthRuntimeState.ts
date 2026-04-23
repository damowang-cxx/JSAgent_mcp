import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordStealthSubstrate } from './stealthSubstrateToolHelpers.js';

const schema = z.object({
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type ListStealthRuntimeStateParams = z.infer<typeof schema>;

export const listStealthRuntimeStateTool = defineTool<ListStealthRuntimeStateParams>({
  name: 'list_stealth_runtime_state',
  description: 'List current stealth substrate runtime state; observe-first preload coordination, not a full anti-detection platform.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = context.runtime.getStealthCoordinator().getRuntimeState();
    const evidenceWritten = await recordStealthSubstrate(context, {
      evidence: {
        enabledFeatures: result.enabledFeatures,
        kind: 'stealth_substrate',
        presetId: result.presetId ?? null
      },
      state: result,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    return {
      evidenceWritten,
      result
    };
  }
});
