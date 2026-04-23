import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps } from './browserOpsToolHelpers.js';

const schema = z.object({
  sessionId: z.string(),
  navigateToSavedUrl: z.boolean().optional(),
  clearStorageBeforeRestore: z.boolean().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type RestoreSessionStateParams = z.infer<typeof schema>;

export const restoreSessionStateTool = defineTool<RestoreSessionStateParams>({
  name: 'restore_session_state',
  description: 'Restore saved cookies/localStorage/sessionStorage to the selected page; field-operation state control before workflow escalation.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getSessionStateManager().restore(params);
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        kind: 'browser_session_state',
        operation: 'restore',
        restored: result.restored,
        sessionId: result.sessionId
      },
      snapshotPatch: {
        activeSessionStates: context.runtime.getSessionStateManager().list(),
        notes: [`Restored browser session state ${result.sessionId}.`]
      },
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    return {
      evidenceWritten,
      restored: result.restored,
      sessionId: result.sessionId
    };
  }
});
