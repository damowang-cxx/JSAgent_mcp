import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  fieldName: z.string().optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeEvidence: z.boolean().optional()
});

type TraceRequestFieldBindingParams = z.infer<typeof schema>;

export const traceRequestFieldBindingTool = defineTool<TraceRequestFieldBindingParams>({
  name: 'trace_request_field_binding',
  description: 'Trace where sign/token/auth/challenge-like request fields are bound, preferring observed hook/replay artifacts and using debugger only as breakpoint-last enhancer evidence.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getFlowReasoningEngine().traceRequestFieldBinding({
      fieldName: params.fieldName,
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
