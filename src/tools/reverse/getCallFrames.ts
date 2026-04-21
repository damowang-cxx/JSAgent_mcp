import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import type { DebuggerCallFrameDetail, DebuggerCorrelationHint } from '../../debugger/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';
import { readDebuggerInspectionSnapshot, writeDebuggerInspectionEvidence } from './debuggerInspectionArtifacts.js';

const schema = z.object({
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type GetCallFramesParams = z.infer<typeof schema>;

export const getCallFramesTool = defineTool<GetCallFramesParams>({
  name: 'get_call_frames',
  description: 'Return paused debugger call frame details for fallback inspection; use hooks/scenario/capture first when possible.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const resolved = await readCallFrames(params, context);
    const evidenceWritten = resolved.source === 'runtime-last'
      ? await writeDebuggerInspectionEvidence(context, {
        callFrames: resolved.callFrames,
        correlations: resolved.correlations,
        notes: ['Call frames captured from live paused debugger state.'],
        taskId: params.taskId,
        writeEvidence: params.writeEvidence
      })
      : false;

    return {
      callFrames: resolved.callFrames,
      correlations: resolved.correlations,
      evidenceWritten,
      source: resolved.source
    };
  }
});

async function readCallFrames(
  params: GetCallFramesParams,
  context: ToolContext
): Promise<{
  callFrames: DebuggerCallFrameDetail[];
  correlations: DebuggerCorrelationHint[];
  source: 'runtime-last' | 'task-artifact';
}> {
  if (params.source === 'task-artifact' && !params.taskId) {
    throw new AppError('TASK_ID_REQUIRED', 'get_call_frames with source=task-artifact requires taskId.');
  }

  if (params.taskId && params.source !== 'runtime-last') {
    const snapshot = await readDebuggerInspectionSnapshot(context, params.taskId);
    if (snapshot) {
      return {
        callFrames: snapshot.callFrames,
        correlations: snapshot.correlations ?? [],
        source: 'task-artifact'
      };
    }
    if (params.source === 'task-artifact') {
      throw new AppError('DEBUGGER_INSPECTION_SNAPSHOT_NOT_FOUND', `No debugger inspection snapshot found for task ${params.taskId}.`);
    }
  }

  const callFrames = await context.runtime.getPausedInspector().getCallFrames();
  const correlations = await context.runtime.getDebuggerEvidenceCorrelator().correlatePausedState();
  return {
    callFrames,
    correlations,
    source: 'runtime-last'
  };
}
