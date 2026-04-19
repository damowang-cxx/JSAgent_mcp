import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type ListPagesParams = z.infer<typeof schema>;

export const listPagesTool = defineTool<ListPagesParams>({
  name: 'list_pages',
  description: 'List browser pages managed by the shared browser session.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true
  },
  schema,
  handler: async (_request, context) => {
    const pages = await context.browserSession.listPages();

    return {
      pages,
      total: pages.length
    };
  }
});
