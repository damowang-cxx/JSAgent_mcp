import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { reverseStageSchema } from './taskToolHelpers.js';

const schema = z.object({
  all: z.boolean().optional(),
  stage: reverseStageSchema.optional(),
  taskId: z.string()
});

type EvaluateStageGateParams = z.infer<typeof schema>;

export const evaluateStageGateTool = defineTool<EvaluateStageGateParams>({
  name: 'evaluate_stage_gate',
  description: 'Evaluate completion gates for one stage or all reverse-engineering stages.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.all || !params.stage) {
      return {
        gates: await context.runtime.getStageGateEvaluator().evaluateAll(params.taskId)
      };
    }

    return {
      gate: await context.runtime.getStageGateEvaluator().evaluate(params.taskId, params.stage)
    };
  }
});
