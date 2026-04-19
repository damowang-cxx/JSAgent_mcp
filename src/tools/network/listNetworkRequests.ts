import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  limit: z.number().int().positive().optional(),
  method: z.string().optional(),
  resourceType: z.string().optional(),
  urlPattern: z.string().optional()
});

type ListNetworkRequestsParams = z.infer<typeof schema>;

export const listNetworkRequestsTool = defineTool<ListNetworkRequestsParams>({
  name: 'list_network_requests',
  description: 'List observed network request summaries for the currently selected page.',
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    const networkCollector = context.runtime.getNetworkCollector();
    await networkCollector.ensureAttachedToSelectedPage();
    return networkCollector.listRequests(params);
  }
});
