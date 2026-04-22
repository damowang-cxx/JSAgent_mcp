import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeEvidence: z.boolean().optional()
});

type PrepareRegressionContextParams = z.infer<typeof schema>;

export const prepareRegressionContextTool = defineTool<PrepareRegressionContextParams>({
  name: 'prepare_regression_context',
  description: 'Prepare regression consumption context from compare anchor, patch preflight, rebuild context, pure preflight, and flow reasoning; hooks/replay evidence stay primary and AI is not gate truth.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getRegressionContextResolver().resolve({
      source: params.source,
      taskId: params.taskId
    });

    let evidenceWritten = false;
    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        baselineId: result.baselineId ?? null,
        compareAnchor: result.compareAnchor ?? null,
        contextId: result.contextId,
        flowReasoning: result.flowReasoning ?? null,
        kind: 'regression_context',
        patchPreflight: result.patchPreflight ?? null,
        purePreflight: result.purePreflight ?? null,
        rebuildContext: result.rebuildContext ?? null
      });
      await context.runtime.getDeliveryContextRegistry().storeRegressionToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId);
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        regressionContext: 'regression-context/latest'
      });
      evidenceWritten = true;
    } else {
      context.runtime.getDeliveryContextRegistry().setLastRegressionContext(result);
    }

    return {
      evidenceWritten,
      result
    };
  }
});
