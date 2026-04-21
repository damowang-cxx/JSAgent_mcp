import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { writePausedEvidence } from './pauseExecution.js';

const schema = z.object({
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type ResumeExecutionParams = z.infer<typeof schema>;

export const resumeExecutionTool = defineTool<ResumeExecutionParams>({
  name: 'resume',
  description: 'Resume the selected page if currently paused by the minimal debugger foundation.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const manager = context.runtime.getDebuggerSessionManager();
    await manager.ensureAttached();
    const wasPaused = manager.isPaused();
    await manager.resume();
    const evidenceWritten = await writePausedEvidence(context, {
      kind: 'debugger_resume',
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      resumed: wasPaused,
      wasPaused
    };
  }
});
