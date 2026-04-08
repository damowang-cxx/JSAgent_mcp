import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  message: z.string().optional()
});

type PingParams = z.infer<typeof schema>;

export const pingTool = defineTool<PingParams>({
  name: 'ping',
  description: '返回简单 pong',
  annotations: {
    category: ToolCategory.CORE,
    readOnlyHint: true
  },
  schema,
  handler: ({ params }) => ({
    ok: true,
    tool: 'ping',
    pong: params.message ?? 'pong',
    timestamp: new Date().toISOString()
  })
});
