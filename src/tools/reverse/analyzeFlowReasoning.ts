import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  targetName: z.string().optional(),
  targetUrl: z.string().optional(),
  maxNodes: z.number().int().min(1).max(50).optional(),
  writeEvidence: z.boolean().optional()
});

type AnalyzeFlowReasoningParams = z.infer<typeof schema>;

export const analyzeFlowReasoningTool = defineTool<AnalyzeFlowReasoningParams>({
  name: 'analyze_flow_reasoning',
  description: 'Run target-chain-first Flow Reasoning Lite over collected code and reverse artifacts; hooks/replay/boundary evidence are preferred and debugger is breakpoint-last enhancer only.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getFlowReasoningEngine().analyze({
      maxNodes: params.maxNodes,
      source: params.source,
      targetName: params.targetName,
      targetUrl: params.targetUrl,
      taskId: params.taskId
    });

    let evidenceWritten = false;
    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({
        targetUrl: params.targetUrl,
        taskId: params.taskId
      });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        helperConsumers: result.helperConsumers,
        kind: 'flow_reasoning',
        requestFieldBindings: result.requestFieldBindings,
        resultId: result.resultId,
        sinkAdjacentBindings: result.sinkAdjacentBindings,
        targetName: result.targetName
      });
      await context.runtime.getFlowReasoningRegistry().storeToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
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
