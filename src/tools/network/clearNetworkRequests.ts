import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type ClearNetworkRequestsParams = z.infer<typeof schema>;

export const clearNetworkRequestsTool = defineTool<ClearNetworkRequestsParams>({
  name: 'clear_network_requests',
  description: 'Clear observed network requests for the currently selected page.',
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: false
  },
  schema,
  handler: (_request, context) => context.runtime.getNetworkCollector().clearSelectedPageRequests()
});
