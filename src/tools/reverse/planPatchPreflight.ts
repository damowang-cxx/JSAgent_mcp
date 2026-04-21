import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  targetUrl: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  maxCandidates: z.number().int().min(1).max(30).optional(),
  writeEvidence: z.boolean().optional()
});

type PlanPatchPreflightParams = z.infer<typeof schema>;

export const planPatchPreflightTool = defineTool<PlanPatchPreflightParams>({
  name: 'plan_patch_preflight',
  description: 'Plan the first explainable patch focus from compare anchors and reverse evidence; hook/replay/boundary evidence is preferred and debugger is only an enhancer.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getPatchPreflightPlanner().plan({
      maxCandidates: params.maxCandidates,
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
        candidateCount: result.candidates.length,
        compareAnchorUsed: result.compareAnchorUsed ?? null,
        kind: 'patch_preflight',
        selected: result.selected,
        stopIf: result.stopIf
      });
      await context.runtime.getPatchPreflightRegistry().storeToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        patchPreflight: 'patch-preflight/latest'
      });
      evidenceWritten = true;
    } else {
      context.runtime.getPatchPreflightRegistry().setLast(result);
    }

    return {
      evidenceWritten,
      result
    };
  }
});
