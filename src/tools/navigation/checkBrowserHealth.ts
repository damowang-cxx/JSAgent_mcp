import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type CheckBrowserHealthParams = z.infer<typeof schema>;

export const checkBrowserHealthTool = defineTool<CheckBrowserHealthParams>({
  name: 'check_browser_health',
  description: 'Return the current browser session health summary.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true
  },
  schema,
  handler: async (_request, context) => ({
    ...(await context.browserSession.getHealth())
  })
});
