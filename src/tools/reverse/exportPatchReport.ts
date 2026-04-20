import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['patch-last']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportPatchReportParams = z.infer<typeof schema>;

export const exportPatchReportTool = defineTool<ExportPatchReportParams>({
  name: 'export_patch_report',
  description: 'Export a patch iteration or patch workflow report from the latest patch result.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const source = params.source ?? 'patch-last';
    const workflow = context.runtime.getPatchWorkflowRunner().getLastPatchWorkflowResult();
    const iteration = context.runtime.getPatchLoopRunner().getLastPatchIterationResult();

    if (!workflow && !iteration) {
      throw new AppError('PATCH_RESULT_NOT_FOUND', 'No patch workflow or patch iteration result is cached in this runtime yet.');
    }

    const built = workflow
      ? await context.runtime.getPatchReportBuilder().buildPatchWorkflow(workflow, format)
      : await context.runtime.getPatchReportBuilder().buildPatchIteration(iteration!, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.writeSnapshot(params.taskId, `patch-report-${format}`, report);
    }

    return {
      format,
      report,
      source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
