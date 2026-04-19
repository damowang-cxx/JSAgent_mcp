import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  description: z.string().optional(),
  hookId: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  type: z.enum(['function', 'fetch', 'xhr'])
});

type CreateHookParams = z.infer<typeof schema>;

export const createHookTool = defineTool<CreateHookParams>({
  name: 'create_hook',
  description: 'Create hook metadata without injecting it into the page yet.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: ({ params }, context) => {
    const hook = context.runtime.getHookManager().createHook(params);

    return {
      createdAt: hook.createdAt,
      description: hook.description,
      hookId: hook.hookId,
      type: hook.type
    };
  }
});
