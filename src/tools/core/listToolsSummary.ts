import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({});

type ListToolsSummaryParams = z.infer<typeof schema>;

export const listToolsSummaryTool = defineTool<ListToolsSummaryParams>({
  name: 'list_tools_summary',
  description: '返回当前已注册工具的摘要列表',
  annotations: {
    category: ToolCategory.CORE,
    readOnlyHint: true
  },
  schema,
  handler: (_request, context) => ({
    total: context.registry.values().length,
    tools: context.registry.values().map((tool) => ({
      name: tool.name,
      description: tool.description,
      category: tool.annotations.category,
      readOnlyHint: tool.annotations.readOnlyHint
    }))
  })
});
