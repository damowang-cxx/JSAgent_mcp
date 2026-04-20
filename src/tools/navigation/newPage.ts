import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  timeout: z.number().int().positive().optional(),
  url: z.string().optional()
});

type NewPageParams = z.infer<typeof schema>;

export const newPageTool = defineTool<NewPageParams>({
  name: 'new_page',
  description: 'Create a new browser page and optionally navigate it to a URL.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const page = await context.browserSession.newPage(params.url, params.timeout);
    await context.runtime.getNetworkCollector().ensureAttachedToSelectedPage();

    return {
      page
    };
  }
});
