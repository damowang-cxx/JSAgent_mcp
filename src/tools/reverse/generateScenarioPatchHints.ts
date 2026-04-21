import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  source: z.enum(['probe-last', 'window-last', 'helper-boundary-last', 'task-artifact']).optional(),
  targetName: z.string().optional(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type GenerateScenarioPatchHintsParams = z.infer<typeof schema>;

export const generateScenarioPatchHintsTool = defineTool<GenerateScenarioPatchHintsParams>({
  name: 'generate_scenario_patch_hints',
  description: 'Generate evidence-driven scenario-specific patch hints without applying patches.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getScenarioPatchHintGenerator().generate({
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
        hintCount: result.hints.length,
        hints: result.hints,
        kind: 'scenario_patch_hints',
        setId: result.setId,
        targetName: result.targetName
      });
      await context.runtime.getScenarioPatchHintRegistry().storeToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        scenarioPatchHints: 'scenario-patch-hints/latest'
      });
    } else {
      context.runtime.getScenarioPatchHintRegistry().setLast(result);
    }

    return {
      evidenceWritten: Boolean(params.taskId && params.writeEvidence),
      result
    };
  }
});
