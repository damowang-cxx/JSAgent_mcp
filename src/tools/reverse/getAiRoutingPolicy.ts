import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type GetAiRoutingPolicyParams = z.infer<typeof schema>;

export const getAiRoutingPolicyTool = defineTool<GetAiRoutingPolicyParams>({
  name: 'get_ai_routing_policy',
  description: 'Get routing-lite AI substrate policy; deterministic-only remains a supported path.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async (_request, context) => ({
    result: context.runtime.getAiRoutingPolicy().get()
  })
});
