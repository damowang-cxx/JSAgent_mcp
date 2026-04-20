import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type ListXhrBreakpointsParams = z.infer<typeof schema>;

export const listXhrBreakpointsTool = defineTool<ListXhrBreakpointsParams>({
  name: 'list_xhr_breakpoints',
  description: 'List configured XHR/fetch watchpoints.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: (_request, context) => {
    const rules = context.runtime.getXhrWatchpointManager().listRules();

    return {
      rules,
      total: rules.length
    };
  }
});
