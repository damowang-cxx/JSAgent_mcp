import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  targetUrl: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type PrepareRebuildContextParams = z.infer<typeof schema>;

export const prepareRebuildContextTool = defineTool<PrepareRebuildContextParams>({
  name: 'prepare_rebuild_context',
  description: 'Prepare a rebuild context from boundary fixture, compare anchor, patch preflight, and related reverse evidence; hook/replay artifacts are preferred and debugger evidence is only an enhancer.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getRebuildInputResolver().resolve({
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
        fixtureSource: result.fixtureSource,
        kind: 'rebuild_context',
        usedCompareAnchor: result.usedCompareAnchor ?? null,
        usedPatchPreflight: result.usedPatchPreflight ?? null
      });
      await context.runtime.getRebuildContextRegistry().storeToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        rebuildContext: 'rebuild-context/latest'
      });
      evidenceWritten = true;
    } else {
      context.runtime.getRebuildContextRegistry().setLast(result);
    }

    return {
      evidenceWritten,
      result
    };
  }
});
