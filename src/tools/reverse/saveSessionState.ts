import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps, writeSessionStateArtifact } from './browserOpsToolHelpers.js';

const schema = z.object({
  sessionId: z.string(),
  includeCookies: z.boolean().optional(),
  includeLocalStorage: z.boolean().optional(),
  includeSessionStorage: z.boolean().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type SaveSessionStateParams = z.infer<typeof schema>;

export const saveSessionStateTool = defineTool<SaveSessionStateParams>({
  name: 'save_session_state',
  description: 'Save bounded cookies/localStorage/sessionStorage state for browser field operations; not a full browser VM restore.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getSessionStateManager().save(params);
    if (params.taskId && params.writeEvidence) {
      await writeSessionStateArtifact(context, params.taskId, result);
    }
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        kind: 'browser_session_state',
        operation: 'save',
        sessionId: result.sessionId
      },
      snapshotPatch: {
        activeSessionStates: context.runtime.getSessionStateManager().list(),
        notes: [`Saved browser session state ${result.sessionId}.`]
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
