import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  timeout: z.number().int().positive().optional(),
  type: z.enum(['url', 'back', 'forward', 'reload']).optional(),
  url: z.string().optional()
});

type NavigatePageParams = z.infer<typeof schema>;

export const navigatePageTool = defineTool<NavigatePageParams>({
  name: 'navigate_page',
  description: 'Navigate the currently selected page using the shared browser session.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false
  },
  schema,
  handler: ({ params }, context) => context.browserSession.navigateSelectedPage(params)
});
