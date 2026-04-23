import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  defaultMode: z.enum(['deterministic-only', 'prefer-openai-compatible', 'prefer-anthropic-compatible', 'auto']),
  modeOverrides: z.record(z.string(), z.string()).optional()
});

type SetAiRoutingPolicyParams = z.infer<typeof schema>;

export const setAiRoutingPolicyTool = defineTool<SetAiRoutingPolicyParams>({
  name: 'set_ai_routing_policy',
  description: 'Set routing-lite AI substrate policy without changing deterministic truth or enabling AI auto patching.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    result: context.runtime.getAiRoutingPolicy().set(params)
  })
});
