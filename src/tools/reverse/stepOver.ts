import { z } from 'zod';

import type { PausedStateSummary } from '../../debugger/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool, type ToolContext } from '../ToolDefinition.js';
import { writePausedEvidence } from './pauseExecution.js';

const schema = z.object({
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type StepParams = z.infer<typeof schema>;
type StepType = 'over' | 'into' | 'out';

export const stepOverTool = defineTool<StepParams>({
  name: 'step_over',
  description: 'Breakpoint-last debugger inspection: step over one paused call frame; prefer hooks/replay/boundary evidence before stepping.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => runDebuggerStep(context, params, 'over')
});

export async function runDebuggerStep(
  context: ToolContext,
  params: StepParams,
  stepType: StepType
): Promise<{
  ok: boolean;
  pausedState: PausedStateSummary | null;
  evidenceWritten: boolean;
  notes: string[];
}> {
  const manager = context.runtime.getDebuggerSessionManager();
  if (stepType === 'over') {
    await manager.stepOver();
  } else if (stepType === 'into') {
    await manager.stepInto();
  } else {
    await manager.stepOut();
  }

  const state = manager.getPausedState();
  const evidenceWritten = await writePausedEvidence(context, {
    kind: 'debugger_step',
    state: state.isPaused ? state : undefined,
    stepType,
    taskId: params.taskId,
    writeEvidence: params.writeEvidence
  });

  return {
    evidenceWritten,
    notes: state.isPaused
      ? [`Step ${stepType} completed and execution is paused again.`]
      : [`Step ${stepType} resumed execution and no new paused state was observed within the short wait window.`],
    ok: true,
    pausedState: state.isPaused ? state : null
  };
}
