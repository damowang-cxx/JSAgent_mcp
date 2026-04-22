import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const aiModeSchema = z.enum([
  'deobfuscation-explain',
  'analyze-target-explain',
  'flow-reasoning-explain',
  'compare-anchor-explain',
  'patch-preflight-explain',
  'rebuild-context-explain',
  'pure-preflight-explain',
  'generic-reverse-explain'
]);

const schema = z.object({
  mode: aiModeSchema,
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  targetUrl: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type ExplainReverseContextWithAiParams = z.infer<typeof schema>;

export const explainReverseContextWithAiTool = defineTool<ExplainReverseContextWithAiParams>({
  name: 'explain_reverse_context_with_ai',
  description: 'Generate an optional AI semantic explanation from deterministic reverse/rebuild/pure artifacts; AI is enhancer-only and never replaces compare, patch, rebuild, or pure truth.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getAiAugmentationService().explain({
      mode: params.mode,
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
        augmentationId: result.augmentationId,
        basedOn: result.basedOn.map((artifact) => ({
          id: artifact.id,
          kind: artifact.kind
        })),
        kind: 'ai_augmentation',
        mode: result.mode,
        providerAvailable: result.providerAvailable,
        providerName: result.providerName ?? null
      });
      await context.runtime.getAiAugmentationRegistry().storeToTask(params.taskId, result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        aiAugmentation: 'ai-augmentation/latest'
      });
      evidenceWritten = true;
    } else {
      context.runtime.getAiAugmentationRegistry().setLast(result);
    }

    return {
      evidenceWritten,
      result
    };
  }
});
