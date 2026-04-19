import { getServerInfoTool } from './core/getServerInfo.js';
import { listToolsSummaryTool } from './core/listToolsSummary.js';
import { pingTool } from './core/ping.js';
import { evaluateScriptTool } from './debugging/evaluateScript.js';
import { checkBrowserHealthTool } from './navigation/checkBrowserHealth.js';
import { listPagesTool } from './navigation/listPages.js';
import { navigatePageTool } from './navigation/navigatePage.js';
import { newPageTool } from './navigation/newPage.js';
import { selectPageTool } from './navigation/selectPage.js';
import { collectCodeTool } from './reverse/collectCode.js';
import { listCollectedCodeTool } from './reverse/listCollectedCode.js';
import { searchCollectedCodeTool } from './reverse/searchCollectedCode.js';
import type { RegisteredToolDefinition } from './ToolDefinition.js';

export const coreTools = [pingTool, getServerInfoTool, listToolsSummaryTool] satisfies readonly RegisteredToolDefinition[];
export const navigationTools = [
  checkBrowserHealthTool,
  listPagesTool,
  selectPageTool,
  newPageTool,
  navigatePageTool
] satisfies readonly RegisteredToolDefinition[];
export const debuggingTools = [evaluateScriptTool] satisfies readonly RegisteredToolDefinition[];
export const reverseTools = [
  collectCodeTool,
  listCollectedCodeTool,
  searchCollectedCodeTool
] satisfies readonly RegisteredToolDefinition[];
export const allTools = [...coreTools, ...navigationTools, ...debuggingTools, ...reverseTools] satisfies readonly RegisteredToolDefinition[];

export {
  checkBrowserHealthTool,
  collectCodeTool,
  evaluateScriptTool,
  getServerInfoTool,
  listCollectedCodeTool,
  listPagesTool,
  listToolsSummaryTool,
  navigatePageTool,
  newPageTool,
  pingTool,
  searchCollectedCodeTool,
  selectPageTool
};
