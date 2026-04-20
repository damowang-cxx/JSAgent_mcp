import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  url: z.string()
});

type GetCollectedCodeFileParams = z.infer<typeof schema>;

export const getCollectedCodeFileTool = defineTool<GetCollectedCodeFileParams>({
  name: 'get_collected_code_file',
  description: 'Return one collected JavaScript file from the in-memory collector cache by URL.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: ({ params }, context) => ({
    file: context.runtime.getCodeCollector().getFileByUrl(params.url)
  })
});
