import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  helperName: z.string().optional(),
  source: z.enum(['scenario-last', 'capture-last', 'task-artifact']).optional(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type ExtractHelperBoundaryParams = z.infer<typeof schema>;

export const extractHelperBoundaryTool = defineTool<ExtractHelperBoundaryParams>({
  name: 'extract_helper_boundary',
  description: 'Extract an evidence-backed helper boundary with inputs, outputs, request bindings, hooks, rebuild hints, and pure hints.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getHelperBoundaryExtractor().extract({
      helperName: params.helperName,
      source: params.source,
      targetUrl: params.targetUrl,
      taskId: params.taskId
    });

    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({
        targetUrl: params.targetUrl,
        taskId: params.taskId
      });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        helperName: result.helperName,
        kind: 'helper_boundary',
        outputs: result.outputs,
        relatedRequests: result.relatedRequests,
        rebuildHints: result.rebuildHints,
        pureHints: result.pureHints
      });
      await context.runtime.getHelperBoundaryRegistry().storeToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        helperBoundary: 'helper-boundary/latest'
      });
    } else {
      context.runtime.getHelperBoundaryRegistry().setLast(result);
    }

    return {
      evidenceWritten: Boolean(params.taskId && params.writeEvidence),
      result
    };
  }
});
