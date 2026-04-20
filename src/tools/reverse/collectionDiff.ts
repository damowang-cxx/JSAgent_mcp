import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const summaryEntrySchema = z.object({
  size: z.number().int().nonnegative(),
  type: z.enum(['inline', 'external']),
  url: z.string()
});

const schema = z.object({
  current: z.array(summaryEntrySchema).optional(),
  includeUnchanged: z.boolean().optional(),
  previous: z.array(summaryEntrySchema)
});

type CollectionDiffParams = z.infer<typeof schema>;

export const collectionDiffTool = defineTool<CollectionDiffParams>({
  name: 'collection_diff',
  description: 'Compare two collected code summaries and show added, removed, and changed files.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: ({ params }, context) => ({
    ...context.runtime
      .getCodeCollector()
      .diffSummaries(params.previous, params.current, params.includeUnchanged ?? false)
  })
});
