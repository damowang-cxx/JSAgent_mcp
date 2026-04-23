import { AppError } from '../../core/errors.js';
import type { EventOccurrence, FunctionScalpelSnapshot, ObjectInspectionResult } from '../../function-scalpel/types.js';
import type { ToolContext } from '../ToolDefinition.js';

export async function buildFunctionScalpelSnapshot(
  context: ToolContext,
  patch: FunctionScalpelSnapshot = {}
): Promise<FunctionScalpelSnapshot> {
  await refreshRuntimeScalpelRecords(context);
  const current = context.runtime.getFunctionScalpelRegistry().getLast();
  return {
    hooks: context.runtime.getFunctionHookManager().list(),
    traces: context.runtime.getFunctionTraceRegistry().list({ limit: 200 }),
    inspections: patch.inspections ?? current?.inspections,
    monitors: context.runtime.getEventMonitorRegistry().listMonitors(),
    events: patch.events ?? await listRuntimeEvents(context, { limit: 200 }),
    ...patch,
    notes: patch.notes ?? ['Function scalpel is a hook-preferred micro-operation path before broad workflow escalation.']
  };
}

export async function recordFunctionScalpel(
  context: ToolContext,
  input: {
    taskId?: string;
    writeEvidence?: boolean;
    evidence: Record<string, unknown>;
    snapshot: FunctionScalpelSnapshot;
  }
): Promise<boolean> {
  context.runtime.getFunctionScalpelRegistry().setLast(input.snapshot);

  if (!input.taskId || !input.writeEvidence) {
    return false;
  }

  const evidenceStore = context.runtime.getEvidenceStore();
  await evidenceStore.openTask({ taskId: input.taskId });
  await evidenceStore.appendLog(input.taskId, 'runtime-evidence', input.evidence);
  await context.runtime.getFunctionScalpelRegistry().storeToTask(input.taskId, input.snapshot);
  return true;
}

export async function readFunctionScalpelSnapshot(
  context: ToolContext,
  params: {
    taskId?: string;
    source?: 'runtime-last' | 'task-artifact';
  },
  toolName: string
): Promise<{ snapshot: FunctionScalpelSnapshot | null; source: 'runtime-last' | 'task-artifact' }> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', `${toolName} with source=task-artifact requires taskId.`);
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await context.runtime.getFunctionScalpelRegistry().readFromTask(params.taskId);
    if (snapshot) {
      return {
        snapshot,
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('FUNCTION_SCALPEL_SNAPSHOT_NOT_FOUND', `No function-scalpel/latest snapshot found for task ${params.taskId}.`);
    }
  }

  return {
    snapshot: context.runtime.getFunctionScalpelRegistry().getLast(),
    source: 'runtime-last'
  };
}

export function appendInspection(
  context: ToolContext,
  result: ObjectInspectionResult
): ObjectInspectionResult[] {
  return [
    ...(context.runtime.getFunctionScalpelRegistry().getLast()?.inspections ?? []),
    result
  ].slice(-40);
}

export function filterEvents(
  items: readonly EventOccurrence[],
  options: { monitorId?: string; limit?: number }
): EventOccurrence[] {
  const limit = Math.max(1, Math.min(500, Math.floor(options.limit ?? 100)));
  return items
    .filter((item) => !options.monitorId || item.monitorId === options.monitorId)
    .slice(-limit)
    .map((item) => ({ ...item, payloadPreview: item.payloadPreview ? { ...item.payloadPreview } : undefined }));
}

async function refreshRuntimeScalpelRecords(context: ToolContext): Promise<void> {
  try {
    const traces = await context.runtime.getFunctionHookManager().collectTraceRecords();
    context.runtime.getFunctionTraceRegistry().appendMany(traces);
  } catch {
    // Runtime may not have a selected page while exporting an existing snapshot.
  }
}

async function listRuntimeEvents(
  context: ToolContext,
  options: { monitorId?: string; limit?: number }
): Promise<EventOccurrence[]> {
  try {
    return await context.runtime.getEventMonitorRegistry().listEvents(options);
  } catch {
    return context.runtime.getFunctionScalpelRegistry().getLast()?.events ?? [];
  }
}
