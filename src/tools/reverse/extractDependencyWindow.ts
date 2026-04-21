import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  source: z.enum(['helper-boundary-last', 'scenario-last', 'capture-last', 'task-artifact']).optional(),
  targetName: z.string().optional(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type ExtractDependencyWindowParams = z.infer<typeof schema>;

export const extractDependencyWindowTool = defineTool<ExtractDependencyWindowParams>({
  name: 'extract_dependency_window',
  description: 'Export a minimal, probe-ready dependency window from helper boundary, scenario, capture, or task artifacts.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getDependencyWindowExtractor().extract({
      source: params.source,
      targetName: params.targetName,
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
        exportHints: result.exportHints,
        inputs: result.inputs,
        kind: 'dependency_window',
        outputs: result.outputs,
        targetName: result.targetName,
        validationAnchors: result.validationAnchors,
        windowId: result.windowId
      });
      await context.runtime.getDependencyWindowRegistry().storeToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        dependencyWindow: 'dependency-window/latest'
      });
    } else {
      context.runtime.getDependencyWindowRegistry().setLast(result);
    }

    return {
      evidenceWritten: Boolean(params.taskId && params.writeEvidence),
      result
    };
  }
});
