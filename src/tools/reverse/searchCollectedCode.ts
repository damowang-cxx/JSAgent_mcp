import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  limit: z.number().int().positive().optional(),
  pattern: z.string()
});

type SearchCollectedCodeParams = z.infer<typeof schema>;

export const searchCollectedCodeTool = defineTool<SearchCollectedCodeParams>({
  name: 'search_collected_code',
  description: 'Search the in-memory collected JavaScript cache with a regular expression.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: ({ params }, context) => ({
    ...context.runtime.getCodeCollector().searchInCollectedCode(params.pattern, params.limit)
  })
});
