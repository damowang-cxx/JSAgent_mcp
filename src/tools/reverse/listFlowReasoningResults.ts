import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional()
});

type ListFlowReasoningResultsParams = z.infer<typeof schema>;

export const listFlowReasoningResultsTool = defineTool<ListFlowReasoningResultsParams>({
  name: 'list_flow_reasoning_results',
  description: 'List the latest Flow Reasoning Lite result from runtime cache or task artifacts; this is target-chain evidence, not a full callgraph.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' && !params.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'list_flow_reasoning_results with source=task-artifact requires taskId.');
    }

    if (params.taskId && params.source !== 'runtime-last') {
      const snapshot = await context.runtime.getFlowReasoningRegistry().readFromTask(params.taskId);
      if (snapshot) {
        return {
          result: snapshot.result,
          source: 'task-artifact' as const
        };
      }
      if (params.source === 'task-artifact') {
        return {
          result: null,
          source: 'task-artifact' as const
        };
      }
    }

    return {
      result: context.runtime.getFlowReasoningRegistry().getLast(),
      source: 'runtime-last' as const
    };
  }
});
