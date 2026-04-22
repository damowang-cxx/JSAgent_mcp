import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { sdkTargetSchema } from './taskToolHelpers.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  target: sdkTargetSchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
  writeEvidence: z.boolean().optional()
});

type RunDeliveryFromContextParams = z.infer<typeof schema>;

export const runDeliveryFromContextTool = defineTool<RunDeliveryFromContextParams>({
  name: 'run_delivery_from_context',
  description: 'Resolve delivery context from deterministic reverse/regression provenance, then run delivery workflow with optional AI explanation as handoff enhancer only.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' && !params.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'run_delivery_from_context with source=task-artifact requires taskId.');
    }

    const deliveryContext = await context.runtime.getDeliveryContextAssembler().assemble({
      source: params.source,
      taskId: params.taskId
    });

    let evidenceWritten = false;
    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await context.runtime.getDeliveryContextRegistry().storeDeliveryToTask(params.taskId, deliveryContext);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId);
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        deliveryContext: 'delivery-context/latest'
      });
      evidenceWritten = true;
    } else {
      context.runtime.getDeliveryContextRegistry().setLastDeliveryContext(deliveryContext);
    }

    const result = await context.runtime.getDeliveryWorkflowRunner().runWithContext({
      deliveryContext,
      source: params.source === 'task-artifact' ? 'task-artifact' : 'delivery-context-last',
      target: params.target,
      taskId: params.taskId,
      timeoutMs: params.timeoutMs,
      writeEvidence: params.writeEvidence
    });

    if (params.taskId && params.writeEvidence) {
      await context.runtime.getEvidenceStore().appendLog(params.taskId, 'runtime-evidence', {
        contextId: deliveryContext.contextId,
        kind: 'delivery_context_run',
        readyForDelivery: result.readyForDelivery,
        regressionMatched: result.regression?.matchedBaseline ?? false,
        sdkTarget: result.sdk?.target ?? params.target ?? null
      });
    }

    return {
      deliveryContextUsed: deliveryContext,
      evidenceWritten,
      result
    };
  }
});
