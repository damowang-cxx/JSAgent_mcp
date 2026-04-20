import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  isRegex: z.boolean().optional(),
  methods: z.array(z.string()).optional(),
  mode: z.enum(['record', 'debugger-statement']).optional(),
  url: z.string()
});

type BreakOnXhrParams = z.infer<typeof schema>;

export const breakOnXhrTool = defineTool<BreakOnXhrParams>({
  name: 'break_on_xhr',
  description: 'Add an XHR/fetch watchpoint that records or pauses when matching URLs are requested.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const manager = context.runtime.getXhrWatchpointManager();
    const rule = manager.addRule(params);
    await manager.ensureInjectedToSelectedPage();

    return {
      rule
    };
  }
});
