import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type ListCollectedCodeParams = z.infer<typeof schema>;

export const listCollectedCodeTool = defineTool<ListCollectedCodeParams>({
  name: 'list_collected_code',
  description: 'List the summary of JavaScript files currently stored in the collector cache.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async (_request, context) => {
    const files = context.runtime.getCodeCollector().getCollectedFilesSummary();

    return {
      files,
      total: files.length
    };
  }
});
