import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { StoredFixtureCandidate } from '../../fixture/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['fixture-last', 'task-artifact']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportBoundaryFixtureReportParams = z.infer<typeof schema>;

export const exportBoundaryFixtureReportTool = defineTool<ExportBoundaryFixtureReportParams>({
  name: 'export_boundary_fixture_report',
  description: 'Export a boundary fixture candidate report from task artifacts or the latest fixture candidate.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readFixture(params, context);
    if (!resolved) {
      throw new AppError(
        'BOUNDARY_FIXTURE_NOT_FOUND',
        'No boundary fixture candidate is available. Run generate_boundary_fixture or provide taskId with boundary-fixture/latest.'
      );
    }

    const built = await context.runtime.getFixtureCandidateReportBuilder().build(resolved.result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.writeSnapshot(params.taskId, `boundary-fixture/report-${format}`, report);
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readFixture(
  params: ExportBoundaryFixtureReportParams,
  context: ToolContext
): Promise<{ result: StoredFixtureCandidate['result']; source: 'fixture-last' | 'task-artifact' } | null> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_boundary_fixture_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'fixture-last') {
    try {
      const snapshot = await context.runtime.getEvidenceStore().readSnapshot(params.taskId, 'boundary-fixture/latest');
      if (isStoredFixtureCandidate(snapshot)) {
        return { result: snapshot.result, source: 'task-artifact' };
      }
    } catch {
      // Fall through to runtime cache.
    }
  }

  const latest = context.runtime.getFixtureCandidateRegistry().getLast();
  return latest ? { result: latest, source: 'fixture-last' } : null;
}

function isStoredFixtureCandidate(value: unknown): value is StoredFixtureCandidate {
  return Boolean(value && typeof value === 'object' && 'fixtureId' in value && 'result' in value);
}
