import { z } from 'zod';

import type { SavedSessionState } from '../../browser-ops/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps } from './browserOpsToolHelpers.js';

const schema = z.object({
  sessionId: z.string(),
  pretty: z.boolean().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type DumpSessionStateParams = z.infer<typeof schema>;

export const dumpSessionStateTool = defineTool<DumpSessionStateParams>({
  name: 'dump_session_state',
  description: 'Dump a bounded saved session state as JSON; useful for artifact-backed field handoff, not full profile restore.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    let result = await context.runtime.getSessionStateManager().dump(params).catch(async (error) => {
      if (!params.taskId) {
        throw error;
      }
      const snapshot = await context.runtime.getEvidenceStore().readSnapshot(params.taskId, `browser-ops/session-states/${params.sessionId}`)
        .catch(() => undefined) as SavedSessionState | undefined;
      if (!snapshot) {
        throw error;
      }
      return {
        sessionId: params.sessionId,
        snapshotJson: JSON.stringify(snapshot, null, params.pretty ? 2 : 0)
      };
    });
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        kind: 'browser_session_state',
        operation: 'dump',
        sessionId: result.sessionId
      },
      snapshotPatch: {
        activeSessionStates: context.runtime.getSessionStateManager().list(),
        notes: [`Dumped browser session state ${result.sessionId}.`]
      },
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    result = {
      ...result,
      snapshotJson: result.snapshotJson
    };
    return {
      ...result,
      evidenceWritten
    };
  }
});
