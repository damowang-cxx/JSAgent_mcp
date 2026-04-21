import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type {
  DebuggerCallFrameDetail,
  DebuggerCorrelationHint,
  DebuggerReportInput,
  ManagedBreakpoint,
  PausedStateSummary,
  StoredBreakpointSnapshot,
  StoredPausedSnapshot
} from '../../debugger/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';
import { readDebuggerInspectionSnapshot } from './debuggerInspectionArtifacts.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportDebuggerReportParams = z.infer<typeof schema>;

export const exportDebuggerReportTool = defineTool<ExportDebuggerReportParams>({
  name: 'export_debugger_report',
  description: 'Export a debugger inspection report. This is a breakpoint-last report for paused-site evidence, not a full DevTools dump.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const format = params.format ?? 'json';
    const resolved = await readDebuggerReportInput(params, context);
    const built = await context.runtime.getDebuggerReportBuilder().build(resolved.input, format);
    const report = format === 'markdown' ? { markdown: built.markdown } : { json: built.json };

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.writeSnapshot(params.taskId, `debugger/report-${format}`, report);
    }

    return {
      format,
      report,
      source: resolved.source,
      writtenSnapshot: Boolean(params.writeSnapshot && params.taskId)
    };
  }
});

async function readDebuggerReportInput(
  params: ExportDebuggerReportParams,
  context: ToolContext
): Promise<{ input: DebuggerReportInput; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'export_debugger_report with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const artifactInput = await readTaskArtifactReportInput(params.taskId, context);
    if (artifactInput) {
      return {
        input: artifactInput,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('DEBUGGER_ARTIFACTS_NOT_FOUND', `No debugger report artifacts found for task ${params.taskId}.`);
    }
  }

  return {
    input: await readRuntimeReportInput(context),
    source: 'runtime-last'
  };
}

async function readTaskArtifactReportInput(taskId: string, context: ToolContext): Promise<DebuggerReportInput | null> {
  const [breakpointSnapshot, pausedSnapshot, inspectionSnapshot] = await Promise.all([
    context.runtime.getBreakpointRegistry().readFromTask(taskId),
    readPausedSnapshot(taskId, context),
    readDebuggerInspectionSnapshot(context, taskId)
  ]);

  if (!breakpointSnapshot && !pausedSnapshot && !inspectionSnapshot) {
    return null;
  }

  return {
    breakpoints: breakpointSnapshot?.items ?? [],
    callFrames: inspectionSnapshot?.callFrames ?? [],
    correlations: inspectionSnapshot?.correlations ?? [],
    notes: [
      'Report was assembled from task debugger artifacts.',
      ...(inspectionSnapshot?.notes ?? [])
    ],
    pausedState: pausedSnapshot?.state ?? emptyPausedState()
  };
}

async function readRuntimeReportInput(context: ToolContext): Promise<DebuggerReportInput> {
  const manager = context.runtime.getDebuggerSessionManager();
  try {
    await manager.ensureAttached();
    context.runtime.getBreakpointRegistry().setItems(manager.listBreakpoints());
  } catch {
    // Runtime report still includes registry cache if no selected page is available.
  }

  const pausedState = manager.getPausedState();
  let callFrames: DebuggerCallFrameDetail[] = [];
  let correlations: DebuggerCorrelationHint[] = [];
  if (pausedState.isPaused) {
    callFrames = await context.runtime.getPausedInspector().getCallFrames();
    correlations = await context.runtime.getDebuggerEvidenceCorrelator().correlatePausedState();
  }

  return {
    breakpoints: context.runtime.getBreakpointRegistry().getItems(),
    callFrames,
    correlations,
    notes: [
      'Runtime report assembled from current debugger caches.',
      'Debugger inspection remains breakpoint-last; prefer hooks and replay capture before using it.'
    ],
    pausedState
  };
}

async function readPausedSnapshot(taskId: string, context: ToolContext): Promise<StoredPausedSnapshot | null> {
  const snapshot = await context.runtime.getEvidenceStore().readSnapshot(taskId, 'debugger/paused-last');
  return isStoredPausedSnapshot(snapshot) ? snapshot : null;
}

function isStoredPausedSnapshot(value: unknown): value is StoredPausedSnapshot {
  return Boolean(value && typeof value === 'object' && 'createdAt' in value && 'state' in value);
}

function emptyPausedState(): PausedStateSummary {
  return {
    callFrames: [],
    hitBreakpoints: [],
    isPaused: false,
    topFrame: null
  };
}
