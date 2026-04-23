import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { buildBattlefieldSnapshot, recordBattlefieldSnapshot } from './battlefieldToolHelpers.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  writeEvidence: z.boolean().optional()
});

type PlanBattlefieldActionParams = z.infer<typeof schema>;

export const planBattlefieldActionTool = defineTool<PlanBattlefieldActionParams>({
  name: 'plan_battlefield_action',
  description: 'Battlefield-first action planning that recommends the next real tool chain across browser ops, source precision, function scalpel, debugger, and structured reverse phases.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const battlefieldContext = await context.runtime.getBattlefieldContextResolver().resolve({
      source: params.source,
      taskId: params.taskId
    });
    const result = context.runtime.getBattlefieldActionPlanner().plan(battlefieldContext);
    const snapshot = buildBattlefieldSnapshot({
      actionPlan: result,
      context: battlefieldContext,
      notes: [
        `Battlefield plan ${result.planId} selected phase ${result.phase}.`
      ]
    });
    const evidenceWritten = await recordBattlefieldSnapshot(context, {
      evidence: {
        kind: 'battlefield_action_plan',
        phase: result.phase,
        planId: result.planId,
        recommendedTools: result.recommendedTools,
        why: result.why
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

