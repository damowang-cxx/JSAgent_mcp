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

type SelectCompareAnchorParams = z.infer<typeof schema>;

export const selectCompareAnchorTool = defineTool<SelectCompareAnchorParams>({
  name: 'select_compare_anchor',
  description: 'Select the first useful compare anchor from hook/scenario/boundary/window/fixture/debugger evidence; breakpoint evidence is only an enhancer.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getCompareAnchorSelector().select({
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
        kind: 'compare_anchor_selection',
        selected: result.selected,
        stopIf: result.stopIf
      });
      await context.runtime.getCompareAnchorRegistry().storeToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        compareAnchor: 'compare-anchor/latest'
      });
      evidenceWritten = true;
    } else {
      context.runtime.getCompareAnchorRegistry().setLast(result);
    }

    return {
      evidenceWritten,
      result
    };
  }
});
