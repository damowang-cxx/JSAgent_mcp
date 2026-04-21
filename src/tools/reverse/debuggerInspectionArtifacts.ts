import type {
  CallFrameEvaluationResult,
  DebuggerCallFrameDetail,
  DebuggerCorrelationHint,
  DebuggerScopeSummary,
  StoredDebuggerInspectionSnapshot
} from '../../debugger/types.js';
import type { ToolContext } from '../ToolDefinition.js';

export async function writeDebuggerInspectionEvidence(
  context: ToolContext,
  input: {
    callFrames: DebuggerCallFrameDetail[];
    correlations?: DebuggerCorrelationHint[];
    evaluation?: CallFrameEvaluationResult;
    frameIndex?: number;
    notes?: string[];
    scopes?: DebuggerScopeSummary[];
    targetUrl?: string;
    taskId?: string;
    writeEvidence?: boolean;
  }
): Promise<boolean> {
  if (!input.taskId || !input.writeEvidence) {
    return false;
  }

  const callFrames = attachScopes(input.callFrames, input.frameIndex, input.scopes);
  const snapshot: StoredDebuggerInspectionSnapshot = {
    callFrames,
    correlations: input.correlations ?? [],
    createdAt: new Date().toISOString(),
    evaluations: input.evaluation ? [input.evaluation] : [],
    notes: input.notes ?? [],
    taskId: input.taskId
  };

  const evidenceStore = context.runtime.getEvidenceStore();
  await evidenceStore.openTask({
    targetUrl: input.targetUrl,
    taskId: input.taskId
  });
  await evidenceStore.appendLog(input.taskId, 'runtime-evidence', {
    callFrameCount: callFrames.length,
    correlationCount: snapshot.correlations?.length ?? 0,
    evaluation: input.evaluation ? {
      ok: input.evaluation.ok,
      preview: input.evaluation.preview,
      resultType: input.evaluation.resultType
    } : null,
    kind: 'debugger_inspection',
    scopeCount: input.scopes?.length ?? 0
  });
  await evidenceStore.writeSnapshot(input.taskId, 'debugger/inspection-last', snapshot);
  await context.runtime.getTaskManifestManager().ensureTask(input.taskId, {
    targetUrl: input.targetUrl
  });
  await context.runtime.getTaskManifestManager().updatePointers(input.taskId, {
    debuggerInspection: 'debugger/inspection-last'
  });
  return true;
}

export async function readDebuggerInspectionSnapshot(
  context: ToolContext,
  taskId: string
): Promise<StoredDebuggerInspectionSnapshot | null> {
  const snapshot = await context.runtime.getEvidenceStore().readSnapshot(taskId, 'debugger/inspection-last');
  return isStoredDebuggerInspectionSnapshot(snapshot) ? snapshot : null;
}

export function isStoredDebuggerInspectionSnapshot(value: unknown): value is StoredDebuggerInspectionSnapshot {
  return Boolean(value && typeof value === 'object' && 'createdAt' in value && 'callFrames' in value);
}

function attachScopes(
  callFrames: readonly DebuggerCallFrameDetail[],
  frameIndex: number | undefined,
  scopes: DebuggerScopeSummary[] | undefined
): DebuggerCallFrameDetail[] {
  const next = callFrames.map((frame) => ({
    ...frame,
    ...(frame.scopes ? { scopes: frame.scopes.map((scope) => ({
      ...scope,
      variables: scope.variables.map((variable) => ({ ...variable }))
    })) } : {})
  }));

  if (!scopes || scopes.length === 0 || frameIndex === undefined || !next[frameIndex]) {
    return next;
  }

  next[frameIndex] = {
    ...next[frameIndex],
    scopes
  };
  return next;
}
