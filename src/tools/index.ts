import { getServerInfoTool } from './core/getServerInfo.js';
import { listToolsSummaryTool } from './core/listToolsSummary.js';
import { pingTool } from './core/ping.js';
import type { RegisteredToolDefinition } from './ToolDefinition.js';

export const coreTools = [pingTool, getServerInfoTool, listToolsSummaryTool] satisfies readonly RegisteredToolDefinition[];

export { getServerInfoTool, listToolsSummaryTool, pingTool };
