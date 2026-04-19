import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  currentDocument: z.boolean().optional(),
  futureDocuments: z.boolean().optional(),
  hookId: z.string()
});

type InjectHookParams = z.infer<typeof schema>;

export const injectHookTool = defineTool<InjectHookParams>({
  name: 'inject_hook',
  description: 'Inject an existing hook into the currently selected page.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const page = await context.browserSession.getSelectedPage();
    const result = await context.runtime.getHookManager().injectHook(params.hookId, page, {
      currentDocument: params.currentDocument,
      futureDocuments: params.futureDocuments
    });

    return {
      hookId: result.hookId,
      injected: true,
      pageUrl: result.pageUrl
    };
  }
});
