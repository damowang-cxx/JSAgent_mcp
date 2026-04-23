import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildBattlefieldSnapshot, recordBattlefieldSnapshot } from './battlefieldToolHelpers.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeEvidence: z.boolean().optional()
});

type PrepareBattlefieldContextParams = z.infer<typeof schema>;

export const prepareBattlefieldContextTool = defineTool<PrepareBattlefieldContextParams>({
  name: 'prepare_battlefield_context',
  description: 'Observe-first battlefield context preparation that reconciles browser ops, source precision, function scalpel, debugger finishing, and structured reverse readiness before heavier escalation.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getBattlefieldContextResolver().resolve({
      source: params.source,
      taskId: params.taskId
    });
    const snapshot = buildBattlefieldSnapshot({ context: result, actionPlan: null });
    const evidenceWritten = await recordBattlefieldSnapshot(context, {
      evidence: {
        contextId: result.contextId,
        kind: 'battlefield_context',
        nextActions: result.nextActions,
        selectedPage: result.selectedPage ?? null
      },
      snapshot,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      result
    };
  }
});

