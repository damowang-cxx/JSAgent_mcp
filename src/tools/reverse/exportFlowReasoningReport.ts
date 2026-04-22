import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { FlowReasoningResult } from '../../flow/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportFlowReasoningReportParams = z.infer<typeof schema>;

export const exportFlowReasoningReportTool = defineTool<ExportFlowReasoningReportParams>({
  name: 'export_flow_reasoning_report',
  description: 'Export a Flow Reasoning Lite report for helper consumers, request binders, and sink-adjacent bindings; hook/replay evidence stays primary and debugger is enhancer-only.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readFlowReasoningResult(params, context);
    if (!resolved.result) {
      throw new AppError('FLOW_REASONING_NOT_FOUND', 'No flow reasoning result is available. Run analyze_flow_reasoning first.');
    }

    const built = await context.runtime.getFlowReasoningReportBuilder().build(resolved.result, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      const jsonReport = await context.runtime.getFlowReasoningReportBuilder().build(resolved.result, 'json');
      const markdownReport = await context.runtime.getFlowReasoningReportBuilder().build(resolved.result, 'markdown');
      await evidenceStore.writeSnapshot(params.taskId, 'flow-reasoning/report-json', { json: jsonReport.json });
      await evidenceStore.writeSnapshot(params.taskId, 'flow-reasoning/report-markdown', { markdown: markdownReport.markdown });
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readFlowReasoningResult(
  params: ExportFlowReasoningReportParams,
  context: ToolContext
): Promise<{ result: FlowReasoningResult | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_flow_reasoning_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getFlowReasoningRegistry().readFromTask(params.taskId);
    if (snapshot) {
      return {
        result: snapshot.result,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('FLOW_REASONING_NOT_FOUND', `No flow-reasoning/latest snapshot found for task ${params.taskId}.`);
    }
  }

  const cached = context.runtime.getFlowReasoningRegistry().getLast();
  if (cached) {
    return {
      result: cached,
      source: 'runtime-last'
    };
  }

  return {
    result: await context.runtime.getFlowReasoningEngine().analyze({ source: 'runtime-last' }),
    source: 'runtime-last'
  };
}
