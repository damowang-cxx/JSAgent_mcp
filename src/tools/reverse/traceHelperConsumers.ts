import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  helperName: z.string().optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeEvidence: z.boolean().optional()
});

type TraceHelperConsumersParams = z.infer<typeof schema>;

export const traceHelperConsumersTool = defineTool<TraceHelperConsumersParams>({
  name: 'trace_helper_consumers',
  description: 'Trace where a helper return is consumed using lightweight AST facts plus hook/replay/boundary evidence; debugger evidence remains breakpoint-last enhancer context.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getFlowReasoningEngine().traceHelperConsumers({
      helperName: params.helperName,
      source: params.source,
      taskId: params.taskId
    });

    let evidenceWritten = false;
    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        helperConsumers: result.helperConsumers,
        kind: 'flow_reasoning',
        requestFieldBindings: result.requestFieldBindings,
        resultId: result.resultId,
        sinkAdjacentBindings: result.sinkAdjacentBindings,
        targetName: result.targetName
      });
      await context.runtime.getFlowReasoningRegistry().storeToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId);
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        flowReasoning: 'flow-reasoning/latest'
      });
      evidenceWritten = true;
    } else {
      context.runtime.getFlowReasoningRegistry().setLast(result);
    }

    return {
      evidenceWritten,
      result
    };
  }
});
