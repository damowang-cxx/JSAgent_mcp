import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  targetUrl: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type PlanPurePreflightParams = z.infer<typeof schema>;

export const planPurePreflightTool = defineTool<PlanPurePreflightParams>({
  name: 'plan_pure_preflight',
  description: 'Plan reverse-to-pure preflight context from boundary fixture, compare anchor, patch preflight, rebuild context, and flow reasoning; hooks are preferred and debugger is breakpoint-last enhancer only.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getPurePreflightPlanner().plan({
      source: params.source,
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
        contextId: result.contextId,
        expectedOutputs: result.expectedOutputs,
        kind: 'pure_preflight',
        preservedInputs: result.preservedInputs,
        source: result.source,
        usedCompareAnchor: result.usedCompareAnchor ?? null,
        usedFlowReasoning: result.usedFlowReasoning ?? null,
        usedPatchPreflight: result.usedPatchPreflight ?? null,
        usedRebuildContext: result.usedRebuildContext ?? null
      });
      await context.runtime.getPurePreflightRegistry().storeToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        purePreflight: 'pure-preflight/latest'
      });
      evidenceWritten = true;
    } else {
      context.runtime.getPurePreflightRegistry().setLast(result);
    }

    return {
      evidenceWritten,
      result
    };
  }
});
