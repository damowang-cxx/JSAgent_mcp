import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  includeExternal: z.boolean().optional(),
  includeInline: z.boolean().optional(),
  maxFileSize: z.number().int().positive().optional(),
  maxTotalSize: z.number().int().positive().optional(),
  returnMode: z.enum(['full', 'summary']).optional(),
  timeout: z.number().int().positive().optional(),
  url: z.string().optional()
});

type CollectCodeParams = z.infer<typeof schema>;

export const collectCodeTool = defineTool<CollectCodeParams>({
  name: 'collect_code',
  description: 'Collect inline and external JavaScript code from the selected page or a target URL.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    const codeCollector = context.runtime.getCodeCollector();
    const result = await codeCollector.collect(params);

    if (params.returnMode === 'summary') {
      const files = codeCollector.getCollectedFilesSummary();

      return {
        files,
        total: files.length
      };
    }

    return {
      ...result
    };
  }
});
