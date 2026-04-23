import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { readAstSubstrateSnapshot } from './astSubstrateToolHelpers.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportAstSubstrateReportParams = z.infer<typeof schema>;

export const exportAstSubstrateReportTool = defineTool<ExportAstSubstrateReportParams>({
  name: 'export_ast_substrate_report',
  description: 'Export bounded AST substrate report; deterministic AST assistance, not a full SSA/taint/callgraph platform.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readAstSubstrateSnapshot(context, params, 'export_ast_substrate_report');
    const snapshot = resolved.snapshot;
    if (!snapshot) {
      throw new AppError('AST_SUBSTRATE_SNAPSHOT_NOT_FOUND', 'No AST substrate snapshot is available. Run find_ast_references or preview_ast_rewrite first.');
    }
    const built = await context.runtime.getAstSubstrateReportBuilder().build(snapshot, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await context.runtime.getAstSubstrateRegistry().storeToTask(params.taskId, snapshot);
      const jsonReport = await context.runtime.getAstSubstrateReportBuilder().build(snapshot, 'json');
      const markdownReport = await context.runtime.getAstSubstrateReportBuilder().build(snapshot, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'ast-substrate/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'ast-substrate/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});
