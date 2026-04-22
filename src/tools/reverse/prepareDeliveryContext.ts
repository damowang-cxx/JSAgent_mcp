import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeEvidence: z.boolean().optional()
});

type PrepareDeliveryContextParams = z.infer<typeof schema>;

export const prepareDeliveryContextTool = defineTool<PrepareDeliveryContextParams>({
  name: 'prepare_delivery_context',
  description: 'Prepare delivery handoff context from regression context, compare anchor, patch preflight, rebuild context, pure preflight, and optional AI augmentation; deterministic gates remain primary.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getDeliveryContextAssembler().assemble({
      source: params.source,
      taskId: params.taskId
    });

    let evidenceWritten = false;
    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        aiAugmentation: result.aiAugmentation ?? null,
        compareAnchor: result.compareAnchor ?? null,
        contextId: result.contextId,
        kind: 'delivery_context',
        patchPreflight: result.patchPreflight ?? null,
        purePreflight: result.purePreflight ?? null,
        rebuildContext: result.rebuildContext ?? null,
        regressionContextId: result.regressionContext?.contextId ?? null
      });
      await context.runtime.getDeliveryContextRegistry().storeDeliveryToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId);
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        deliveryContext: 'delivery-context/latest'
      });
      evidenceWritten = true;
    } else {
      context.runtime.getDeliveryContextRegistry().setLastDeliveryContext(result);
    }

    return {
      evidenceWritten,
      result
    };
  }
});
