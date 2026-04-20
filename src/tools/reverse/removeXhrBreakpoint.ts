import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z
  .object({
    ruleId: z.string().optional(),
    url: z.string().optional()
  })
  .refine((value) => value.ruleId !== undefined || value.url !== undefined, {
    message: 'ruleId or url is required'
  });

type RemoveXhrBreakpointParams = z.infer<typeof schema>;

export const removeXhrBreakpointTool = defineTool<RemoveXhrBreakpointParams>({
  name: 'remove_xhr_breakpoint',
  description: 'Remove one XHR/fetch watchpoint by ruleId or by the original URL pattern.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const manager = context.runtime.getXhrWatchpointManager();
    const result = manager.removeRule(params);
    const selectedPage = await context.browserSession.getSelectedPageOrNull();
    if (selectedPage) {
      await manager.ensureInjectedToSelectedPage();
    }

    return result;
  }
});
