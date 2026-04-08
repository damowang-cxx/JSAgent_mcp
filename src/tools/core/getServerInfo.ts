import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type GetServerInfoParams = z.infer<typeof schema>;

export const getServerInfoTool = defineTool<GetServerInfoParams>({
  name: 'get_server_info',
  description: '返回当前服务基本信息',
  annotations: {
    category: ToolCategory.CORE,
    readOnlyHint: true
  },
  schema,
  handler: (_request, context) => {
    const now = Date.now();
    const categories = Array.from(new Set(context.registry.values().map((tool) => tool.annotations.category)));

    return {
      name: context.serverName,
      version: context.serverVersion,
      startedAt: context.serverStartedAt.toISOString(),
      uptimeMs: now - context.serverStartedAt.getTime(),
      toolCount: context.registry.values().length,
      categories
    };
  }
});
