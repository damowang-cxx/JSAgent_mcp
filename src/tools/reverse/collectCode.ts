import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  includeDynamic: z.boolean().optional(),
  dynamicWaitMs: z.number().int().positive().optional(),
  includeExternal: z.boolean().optional(),
  includeInline: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
  maxFileSize: z.number().int().positive().optional(),
  maxTotalSize: z.number().int().positive().optional(),
  pattern: z.string().optional(),
  returnMode: z.enum(['full', 'summary', 'pattern', 'top-priority']).optional(),
  timeout: z.number().int().positive().optional(),
  topN: z.number().int().positive().optional(),
  url: z.string().optional()
});

type CollectCodeParams = z.infer<typeof schema>;

export const collectCodeTool = defineTool<CollectCodeParams>({
  name: 'collect_code',
  description: 'Collect JavaScript code from the selected page or a target URL with multiple return modes.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    const codeCollector = context.runtime.getCodeCollector();
    const result = await codeCollector.collect(params);
    const returnMode = params.returnMode ?? 'full';

    switch (returnMode) {
      case 'summary': {
        const files = codeCollector.getCollectedFilesSummary();
        return {
          files,
          total: files.length
        };
      }
      case 'pattern': {
        if (!params.pattern) {
          throw new AppError('COLLECT_PATTERN_REQUIRED', 'collect_code returnMode=pattern requires pattern.');
        }

        return {
          ...codeCollector.getFilesByPattern(params.pattern, params.limit, params.maxTotalSize)
        };
      }
      case 'top-priority':
        return {
          ...codeCollector.getTopPriorityFiles(params.topN, params.maxTotalSize)
        };
      case 'full':
      default:
        return {
          ...result
        };
    }
  }
});
