import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { UpgradeWorkflowResult } from '../../regression/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['upgrade-last']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportUpgradeReportParams = z.infer<typeof schema>;

export const exportUpgradeReportTool = defineTool<ExportUpgradeReportParams>({
  name: 'export_upgrade_report',
  description: 'Export the latest upgrade workflow report.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = context.runtime.getUpgradeWorkflowRunner().getLastUpgradeWorkflowResult() ??
      (params.taskId
        ? await context.runtime.getEvidenceStore().readSnapshot(params.taskId, 'run/upgrade-workflow')
        : undefined);
    if (!result) {
      throw new AppError('UPGRADE_RESULT_NOT_FOUND', 'No upgrade workflow result is cached or available from task artifacts.');
    }

    const format = params.format ?? 'json';
    const report = await context.runtime.getUpgradeReportBuilder().build(result as UpgradeWorkflowResult, format);
    if (params.writeSnapshot && params.taskId) {
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, `delivery/upgrade-report-${format}`, report);
    }

    return {
      format,
      report,
      source: params.source ?? 'upgrade-last',
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
