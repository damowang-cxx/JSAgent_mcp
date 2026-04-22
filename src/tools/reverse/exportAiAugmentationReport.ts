import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { AiAugmentationResult } from '../../ai/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportAiAugmentationReportParams = z.infer<typeof schema>;

export const exportAiAugmentationReportTool = defineTool<ExportAiAugmentationReportParams>({
  name: 'export_ai_augmentation_report',
  description: 'Export an AI augmentation report with provider provenance and deterministic truth cautions.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readAiAugmentation(params, context);
    if (!resolved.result) {
      throw new AppError('AI_AUGMENTATION_NOT_FOUND', 'No AI augmentation result is available. Run explain_reverse_context_with_ai first.');
    }

    const built = await context.runtime.getAiAugmentationReportBuilder().build(resolved.result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      const jsonReport = await context.runtime.getAiAugmentationReportBuilder().build(resolved.result, 'json');
      const markdownReport = await context.runtime.getAiAugmentationReportBuilder().build(resolved.result, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'ai-augmentation/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'ai-augmentation/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readAiAugmentation(
  params: ExportAiAugmentationReportParams,
  context: ToolContext
): Promise<{ result: AiAugmentationResult | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_ai_augmentation_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getAiAugmentationRegistry().readFromTask(params.taskId);
    if (snapshot) {
      return {
        result: snapshot.result,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('AI_AUGMENTATION_NOT_FOUND', `No ai-augmentation/latest snapshot found for task ${params.taskId}.`);
    }
  }

  return {
    result: context.runtime.getAiAugmentationRegistry().getLast(),
    source: 'runtime-last'
  };
}
