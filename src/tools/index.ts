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
import { analyzeTargetTool } from './reverse/analyzeTarget.js';
import { breakOnXhrTool } from './reverse/breakOnXhr.js';
import { collectCodeTool } from './reverse/collectCode.js';
import { collectionDiffTool } from './reverse/collectionDiff.js';
import { clearHookDataTool } from './reverse/clearHookData.js';
import { createHookTool } from './reverse/createHook.js';
import { detectCryptoTool } from './reverse/detectCrypto.js';
import { exportSessionReportTool } from './reverse/exportSessionReport.js';
import { getCollectedCodeFileTool } from './reverse/getCollectedCodeFile.js';
import { getHookDataTool } from './reverse/getHookData.js';
import { getRequestInitiatorTool } from './reverse/getRequestInitiator.js';
import { injectHookTool } from './reverse/injectHook.js';
import { listCollectedCodeTool } from './reverse/listCollectedCode.js';
import { listHooksTool } from './reverse/listHooks.js';
import { listXhrBreakpointsTool } from './reverse/listXhrBreakpoints.js';
import { openReverseTaskTool } from './reverse/openReverseTask.js';
import { probeReverseTargetTool } from './reverse/probeReverseTarget.js';
import { recordReverseEvidenceTool } from './reverse/recordReverseEvidence.js';
import { removeXhrBreakpointTool } from './reverse/removeXhrBreakpoint.js';
import { riskPanelTool } from './reverse/riskPanel.js';
import { searchCollectedCodeTool } from './reverse/searchCollectedCode.js';
import { summarizeCodeTool } from './reverse/summarizeCode.js';
import { understandCodeTool } from './reverse/understandCode.js';
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
  collectionDiffTool,
  getCollectedCodeFileTool,
  listCollectedCodeTool,
  searchCollectedCodeTool,
  createHookTool,
  listHooksTool,
  injectHookTool,
  getHookDataTool,
  clearHookDataTool,
  getRequestInitiatorTool,
  breakOnXhrTool,
  removeXhrBreakpointTool,
  listXhrBreakpointsTool,
  openReverseTaskTool,
  recordReverseEvidenceTool,
  probeReverseTargetTool,
  summarizeCodeTool,
  understandCodeTool,
  detectCryptoTool,
  riskPanelTool,
  exportSessionReportTool,
  analyzeTargetTool
] satisfies readonly RegisteredToolDefinition[];
export const allTools = [...coreTools, ...navigationTools, ...debuggingTools, ...networkTools, ...reverseTools] satisfies readonly RegisteredToolDefinition[];

export {
  analyzeTargetTool,
  breakOnXhrTool,
  checkBrowserHealthTool,
  clearHookDataTool,
  clearNetworkRequestsTool,
  collectCodeTool,
  collectionDiffTool,
  createHookTool,
  detectCryptoTool,
  evaluateScriptTool,
  exportSessionReportTool,
  getCollectedCodeFileTool,
  getHookDataTool,
  getNetworkRequestTool,
  getRequestInitiatorTool,
  getServerInfoTool,
  injectHookTool,
  listCollectedCodeTool,
  listHooksTool,
  listNetworkRequestsTool,
  listPagesTool,
  listToolsSummaryTool,
  listXhrBreakpointsTool,
  navigatePageTool,
  newPageTool,
  openReverseTaskTool,
  pingTool,
  probeReverseTargetTool,
  recordReverseEvidenceTool,
  removeXhrBreakpointTool,
  riskPanelTool,
  searchCollectedCodeTool,
  selectPageTool,
  summarizeCodeTool,
  understandCodeTool
};
