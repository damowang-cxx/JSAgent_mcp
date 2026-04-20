import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  format: z.enum(['json', 'markdown']).optional(),
  includeHookData: z.boolean().optional(),
  includeRecentRequests: z.boolean().optional()
});

type ExportSessionReportParams = z.infer<typeof schema>;

export const exportSessionReportTool = defineTool<ExportSessionReportParams>({
  name: 'export_session_report',
  description: 'Export a structured snapshot of collector, hook, network, evidence, and optional risk state.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    ...(await context.runtime.getSessionReporter().export(params.format ?? 'json', {
      includeHookData: params.includeHookData,
      includeRecentRequests: params.includeRecentRequests
    }))
  })
});
