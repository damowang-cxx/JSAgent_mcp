import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  McpError,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { normalizeError } from './core/errors.js';
import { logger } from './core/logger.js';
import { ToolRegistry } from './tools/ToolRegistry.js';
import { coreTools } from './tools/index.js';
import type { RegisteredToolDefinition, ToolContext, ToolResult } from './tools/ToolDefinition.js';

const serverName = 'js-reverser-mcp';
const serverVersion = '0.1.0';

function toJsonToolResponse(result: ToolResult) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result
  };
}

function toErrorToolResponse(error: unknown) {
  const payload = normalizeError(error);

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true
  };
}

function registerTool(server: McpServer, tool: RegisteredToolDefinition, context: ToolContext): void {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: {
        readOnlyHint: tool.annotations.readOnlyHint
      }
    },
    async (params) => {
      try {
        const result = await tool.handler({ params }, context);
        return toJsonToolResponse(result);
      } catch (error) {
        logger.error(`Tool call failed: ${tool.name}`, error);
        return toErrorToolResponse(error);
      }
    }
  );
}

function registerEmptyResourceDiscovery(server: McpServer): void {
  server.server.registerCapabilities({
    resources: {
      listChanged: false
    }
  });

  server.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: []
  }));

  server.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: []
  }));

  server.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${request.params.uri}`);
  });
}

async function main(): Promise<void> {
  const registry = new ToolRegistry();
  registry.registerMany(coreTools);

  const context: ToolContext = {
    serverStartedAt: new Date(),
    registry,
    serverName,
    serverVersion
  };

  const server = new McpServer({ name: serverName, version: serverVersion });

  for (const tool of registry.values()) {
    registerTool(server, tool, context);
  }
  registerEmptyResourceDiscovery(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(`${serverName} ${serverVersion} started with ${registry.values().length} tools`);
}

main().catch((error: unknown) => {
  logger.error('Failed to start MCP server', error);
  process.exit(1);
});
