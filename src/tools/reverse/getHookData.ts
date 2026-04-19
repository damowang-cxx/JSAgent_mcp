import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  hookId: z.string().optional()
});

type GetHookDataParams = z.infer<typeof schema>;

export const getHookDataTool = defineTool<GetHookDataParams>({
  name: 'get_hook_data',
  description: 'Read hook records collected in the current page.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    const page = await context.browserSession.getSelectedPage();
    return {
      ...(await context.runtime.getHookManager().getHookData(page, params.hookId))
    };
  }
});
