import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type ListHooksParams = z.infer<typeof schema>;

export const listHooksTool = defineTool<ListHooksParams>({
  name: 'list_hooks',
  description: 'List registered hook metadata.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: (_request, context) => {
    const hooks = context.runtime.getHookManager().listHooks();

    return {
      hooks,
      total: hooks.length
    };
  }
});
