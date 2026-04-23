import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  msgId: z.string()
});

type GetConsoleMessageParams = z.infer<typeof schema>;

export const getConsoleMessageTool = defineTool<GetConsoleMessageParams>({
  name: 'get_console_message',
  description: 'Read one cached console message from selected-page field observations; observe-first and breakpoint-last.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    await context.runtime.getConsoleCollector().ensureAttached();
    return {
      item: context.runtime.getConsoleCollector().getMessage(params.msgId)
    };
  }
});
