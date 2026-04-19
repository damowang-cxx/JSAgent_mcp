import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  pageIdx: z.number().int().min(0)
});

type SelectPageParams = z.infer<typeof schema>;

export const selectPageTool = defineTool<SelectPageParams>({
  name: 'select_page',
  description: 'Select a page from the shared browser session for later tool calls.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    selected: await context.browserSession.selectPage(params.pageIdx)
  })
});
