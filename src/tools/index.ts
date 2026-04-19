import { getServerInfoTool } from './core/getServerInfo.js';
import { listToolsSummaryTool } from './core/listToolsSummary.js';
import { pingTool } from './core/ping.js';
import { evaluateScriptTool } from './debugging/evaluateScript.js';
import { checkBrowserHealthTool } from './navigation/checkBrowserHealth.js';
import { listPagesTool } from './navigation/listPages.js';
import { navigatePageTool } from './navigation/navigatePage.js';
import { newPageTool } from './navigation/newPage.js';
import { selectPageTool } from './navigation/selectPage.js';
import { clearNetworkRequestsTool } from './network/clearNetworkRequests.js';
import { getNetworkRequestTool } from './network/getNetworkRequest.js';
import { listNetworkRequestsTool } from './network/listNetworkRequests.js';
import { collectCodeTool } from './reverse/collectCode.js';
import { clearHookDataTool } from './reverse/clearHookData.js';
import { createHookTool } from './reverse/createHook.js';
import { getHookDataTool } from './reverse/getHookData.js';
import { injectHookTool } from './reverse/injectHook.js';
import { listCollectedCodeTool } from './reverse/listCollectedCode.js';
import { listHooksTool } from './reverse/listHooks.js';
import { openReverseTaskTool } from './reverse/openReverseTask.js';
import { recordReverseEvidenceTool } from './reverse/recordReverseEvidence.js';
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
export const networkTools = [
  listNetworkRequestsTool,
  getNetworkRequestTool,
  clearNetworkRequestsTool
] satisfies readonly RegisteredToolDefinition[];
export const reverseTools = [
  collectCodeTool,
  listCollectedCodeTool,
  searchCollectedCodeTool,
  createHookTool,
  listHooksTool,
  injectHookTool,
  getHookDataTool,
  clearHookDataTool,
  openReverseTaskTool,
  recordReverseEvidenceTool
] satisfies readonly RegisteredToolDefinition[];
export const allTools = [...coreTools, ...navigationTools, ...debuggingTools, ...networkTools, ...reverseTools] satisfies readonly RegisteredToolDefinition[];

export {
  checkBrowserHealthTool,
  clearHookDataTool,
  clearNetworkRequestsTool,
  collectCodeTool,
  createHookTool,
  evaluateScriptTool,
  getServerInfoTool,
  getHookDataTool,
  getNetworkRequestTool,
  injectHookTool,
  listCollectedCodeTool,
  listHooksTool,
  listNetworkRequestsTool,
  listPagesTool,
  listToolsSummaryTool,
  navigatePageTool,
  newPageTool,
  openReverseTaskTool,
  pingTool,
  recordReverseEvidenceTool,
  searchCollectedCodeTool,
  selectPageTool
};
