import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  id: z.string()
});

type GetNetworkRequestParams = z.infer<typeof schema>;

export const getNetworkRequestTool = defineTool<GetNetworkRequestParams>({
  name: 'get_network_request',
  description: 'Get one observed network request record by its collected id.',
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => ({
    request: await context.runtime.getNetworkCollector().getRequest(params.id)
  })
});
