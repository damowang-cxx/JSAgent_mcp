import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  targetUrl: z.string().optional(),
  topN: z.number().int().positive().optional()
});

type LocateRequestSinkParams = z.infer<typeof schema>;

export const locateRequestSinkTool = defineTool<LocateRequestSinkParams>({
  name: 'locate_request_sink',
  description: 'Locate request sinks and final-hop helpers near fetch/xhr/axios/ajax/sendBeacon calls.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    result: await context.runtime.getRequestSinkLocator().locate({
      targetUrl: params.targetUrl,
      topN: params.topN
    })
  })
});
