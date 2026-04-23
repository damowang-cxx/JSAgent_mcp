import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import type { ToolContext } from '../ToolDefinition.js';
import { defineTool } from '../ToolDefinition.js';
import type { BattlefieldIntegrationSnapshot } from '../../battlefield/types.js';
import { buildBattlefieldSnapshot, readBattlefieldSnapshot } from './battlefieldToolHelpers.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportBattlefieldIntegrationReportParams = z.infer<typeof schema>;

export const exportBattlefieldIntegrationReportTool = defineTool<ExportBattlefieldIntegrationReportParams>({
  name: 'export_battlefield_integration_report',
  description: 'Export battlefield integration report that summarizes browser ops, source precision, debugger finishing, function scalpel, substrate, and structured reverse readiness.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = params.source === 'task-artifact' || params.taskId
      ? await readBattlefieldSnapshot(context, params, 'export_battlefield_integration_report')
      : {
          snapshot: context.runtime.getBattlefieldIntegrationRegistry().getLast(),
          source: 'runtime-last' as const
        };
    const snapshot = resolved.snapshot ?? await buildRuntimeSnapshot(context);
    if (!snapshot) {
      throw new AppError('BATTLEFIELD_SNAPSHOT_NOT_FOUND', 'No battlefield snapshot is available.');
    }

    const built = await context.runtime.getBattlefieldIntegrationReportBuilder().build(snapshot, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await context.runtime.getBattlefieldIntegrationRegistry().storeToTask(params.taskId, snapshot);
      const jsonReport = await context.runtime.getBattlefieldIntegrationReportBuilder().build(snapshot, 'json');
      const markdownReport = await context.runtime.getBattlefieldIntegrationReportBuilder().build(snapshot, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'battlefield/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'battlefield/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function buildRuntimeSnapshot(context: ToolContext): Promise<BattlefieldIntegrationSnapshot> {
  const battlefieldContext = await context.runtime.getBattlefieldContextResolver().resolve();
  const actionPlan = context.runtime.getBattlefieldActionPlanner().plan(battlefieldContext);
  return buildBattlefieldSnapshot({
    actionPlan,
    context: battlefieldContext
  });
}
