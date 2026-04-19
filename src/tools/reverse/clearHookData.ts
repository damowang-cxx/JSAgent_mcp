import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  hookId: z.string().optional()
});

type ClearHookDataParams = z.infer<typeof schema>;

export const clearHookDataTool = defineTool<ClearHookDataParams>({
  name: 'clear_hook_data',
  description: 'Clear hook records from the current page for one hook or all hooks.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const page = await context.browserSession.getSelectedPage();
    await context.runtime.getHookManager().clearHookData(page, params.hookId);

    return {
      ...(params.hookId ? { hookId: params.hookId } : {}),
      cleared: true
    };
  }
});
