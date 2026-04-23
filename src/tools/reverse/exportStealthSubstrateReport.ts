import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { readStealthSubstrateState } from './stealthSubstrateToolHelpers.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportStealthSubstrateReportParams = z.infer<typeof schema>;

export const exportStealthSubstrateReportTool = defineTool<ExportStealthSubstrateReportParams>({
  name: 'export_stealth_substrate_report',
  description: 'Export stealth substrate report for preset, feature toggles, and preload coordination; not a full anti-detection matrix.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readStealthSubstrateState(context, params, 'export_stealth_substrate_report');
    if (!resolved.state) {
      throw new AppError('STEALTH_SUBSTRATE_SNAPSHOT_NOT_FOUND', 'No stealth substrate state is available.');
    }
    const built = await context.runtime.getStealthSubstrateReportBuilder().build(resolved.state, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await context.runtime.getStealthCoordinator().storeToTask(params.taskId, resolved.state);
      const jsonReport = await context.runtime.getStealthSubstrateReportBuilder().build(resolved.state, 'json');
      const markdownReport = await context.runtime.getStealthSubstrateReportBuilder().build(resolved.state, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'stealth-substrate/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'stealth-substrate/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
