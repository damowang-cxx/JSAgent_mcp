import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps, writeSessionStateArtifact } from './browserOpsToolHelpers.js';

const schema = z.object({
  sessionId: z.string(),
  snapshotJson: z.string().optional(),
  path: z.string().optional(),
  overwrite: z.boolean().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type LoadSessionStateParams = z.infer<typeof schema>;

export const loadSessionStateTool = defineTool<LoadSessionStateParams>({
  name: 'load_session_state',
  description: 'Load bounded cookies/localStorage/sessionStorage state from JSON or path for browser field operations.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getSessionStateManager().load(params);
    if (params.taskId && params.writeEvidence) {
      await writeSessionStateArtifact(context, params.taskId, result);
    }
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        kind: 'browser_session_state',
        operation: 'load',
        sessionId: result.sessionId
      },
      snapshotPatch: {
        activeSessionStates: context.runtime.getSessionStateManager().list(),
        notes: [`Loaded browser session state ${result.sessionId}.`]
      },
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    return {
      evidenceWritten,
      result
    };
  }
});
