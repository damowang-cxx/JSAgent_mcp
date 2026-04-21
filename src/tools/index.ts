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
import { analyzeSignatureChainTool } from './reverse/analyzeSignatureChain.js';
import { analyzeUpgradeDiffTool } from './reverse/analyzeUpgradeDiff.js';
import { applyPatchTool } from './reverse/applyPatch.js';
import { breakOnXhrTool } from './reverse/breakOnXhr.js';
import { collectCodeTool } from './reverse/collectCode.js';
import { collectionDiffTool } from './reverse/collectionDiff.js';
import { clearHookDataTool } from './reverse/clearHookData.js';
import { correlateRequestFlowsTool } from './reverse/correlateRequestFlows.js';
import { compareRebuildResultTool } from './reverse/compareRebuildResult.js';
import { createHookTool } from './reverse/createHook.js';
import { deobfuscateCodeTool } from './reverse/deobfuscateCode.js';
import { definePureBoundaryTool } from './reverse/definePureBoundary.js';
import { detectCryptoTool } from './reverse/detectCrypto.js';
import { diffCrossLanguageTool } from './reverse/diffCrossLanguage.js';
import { diffEnvRequirementsTool } from './reverse/diffEnvRequirements.js';
import { exportDeliveryBundleTool } from './reverse/exportDeliveryBundle.js';
import { exportDeliveryReportTool } from './reverse/exportDeliveryReport.js';
import { exportPatchReportTool } from './reverse/exportPatchReport.js';
import { exportPortReportTool } from './reverse/exportPortReport.js';
import { exportPureReportTool } from './reverse/exportPureReport.js';
import { exportRebuildBundleTool } from './reverse/exportRebuildBundle.js';
import { exportRebuildReportTool } from './reverse/exportRebuildReport.js';
import { exportRegressionReportTool } from './reverse/exportRegressionReport.js';
import { exportReverseReportTool } from './reverse/exportReverseReport.js';
import { exportRuntimeTraceTool } from './reverse/exportRuntimeTrace.js';
import { exportCaptureReportTool } from './reverse/exportCaptureReport.js';
import { exportScenarioReportTool } from './reverse/exportScenarioReport.js';
import { exportSdkPackageTool } from './reverse/exportSdkPackage.js';
import { exportSessionReportTool } from './reverse/exportSessionReport.js';
import { exportTaskStateReportTool } from './reverse/exportTaskStateReport.js';
import { exportUpgradeReportTool } from './reverse/exportUpgradeReport.js';
import { extractHelperBoundaryTool } from './reverse/extractHelperBoundary.js';
import { extractNodePureTool } from './reverse/extractNodePure.js';
import { extractPythonPureTool } from './reverse/extractPythonPure.js';
import { freezeRuntimeSampleTool } from './reverse/freezeRuntimeSample.js';
import { getCollectedCodeFileTool } from './reverse/getCollectedCodeFile.js';
import { getHookDataTool } from './reverse/getHookData.js';
import { getRequestInitiatorTool } from './reverse/getRequestInitiator.js';
import { getTaskManifestTool } from './reverse/getTaskManifest.js';
import { injectHookTool } from './reverse/injectHook.js';
import { listCollectedCodeTool } from './reverse/listCollectedCode.js';
import { listCapturePresetsTool } from './reverse/listCapturePresets.js';
import { listHelperBoundariesTool } from './reverse/listHelperBoundaries.js';
import { listHooksTool } from './reverse/listHooks.js';
import { listPatchHistoryTool } from './reverse/listPatchHistory.js';
import { listIntermediateBaselinesTool } from './reverse/listIntermediateBaselines.js';
import { listRegressionBaselinesTool } from './reverse/listRegressionBaselines.js';
import { listScenarioPresetsTool } from './reverse/listScenarioPresets.js';
import { listXhrBreakpointsTool } from './reverse/listXhrBreakpoints.js';
import { locateCryptoHelpersTool } from './reverse/locateCryptoHelpers.js';
import { locateRequestSinkTool } from './reverse/locateRequestSink.js';
import { markAcceptanceTool } from './reverse/markAcceptance.js';
import { openReverseTaskTool } from './reverse/openReverseTask.js';
import { planPatchTool } from './reverse/planPatch.js';
import { probeReverseTargetTool } from './reverse/probeReverseTarget.js';
import { recordReverseEvidenceTool } from './reverse/recordReverseEvidence.js';
import { registerRegressionBaselineTool } from './reverse/registerRegressionBaseline.js';
import { registerIntermediateBaselineTool } from './reverse/registerIntermediateBaseline.js';
import { registerUpgradeBaselineTool } from './reverse/registerUpgradeBaseline.js';
import { removeXhrBreakpointTool } from './reverse/removeXhrBreakpoint.js';
import { riskPanelTool } from './reverse/riskPanel.js';
import { replayTargetActionTool } from './reverse/replayTargetAction.js';
import { runCaptureRecipeTool } from './reverse/runCaptureRecipe.js';
import { runScenarioRecipeTool } from './reverse/runScenarioRecipe.js';
import { runDeliveryWorkflowTool } from './reverse/runDeliveryWorkflow.js';
import { runIntermediateRegressionTool } from './reverse/runIntermediateRegression.js';
import { runPatchIterationTool } from './reverse/runPatchIteration.js';
import { runPortWorkflowTool } from './reverse/runPortWorkflow.js';
import { runPureWorkflowTool } from './reverse/runPureWorkflow.js';
import { runRegressionBaselineTool } from './reverse/runRegressionBaseline.js';
import { runRebuildProbeTool } from './reverse/runRebuildProbe.js';
import { runRebuildWorkflowTool } from './reverse/runRebuildWorkflow.js';
import { runUpgradeWorkflowTool } from './reverse/runUpgradeWorkflow.js';
import { savePureFixtureTool } from './reverse/savePureFixture.js';
import { searchCollectedCodeTool } from './reverse/searchCollectedCode.js';
import { smokeTestDeliveryBundleTool } from './reverse/smokeTestDeliveryBundle.js';
import { stabilizeFixtureTool } from './reverse/stabilizeFixture.js';
import { summarizeCodeTool } from './reverse/summarizeCode.js';
import { traceTokenFamilyTool } from './reverse/traceTokenFamily.js';
import { understandCodeTool } from './reverse/understandCode.js';
import { verifyNodePureTool } from './reverse/verifyNodePure.js';
import { verifyPythonPureTool } from './reverse/verifyPythonPure.js';
import { buildPureFixtureTool } from './reverse/buildPureFixture.js';
import { evaluateStageGateTool } from './reverse/evaluateStageGate.js';
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
  deobfuscateCodeTool,
  correlateRequestFlowsTool,
  listScenarioPresetsTool,
  runScenarioRecipeTool,
  analyzeSignatureChainTool,
  traceTokenFamilyTool,
  locateRequestSinkTool,
  locateCryptoHelpersTool,
  exportScenarioReportTool,
  listCapturePresetsTool,
  runCaptureRecipeTool,
  replayTargetActionTool,
  extractHelperBoundaryTool,
  listHelperBoundariesTool,
  exportCaptureReportTool,
  exportReverseReportTool,
  exportRebuildBundleTool,
  runRebuildProbeTool,
  compareRebuildResultTool,
  diffEnvRequirementsTool,
  savePureFixtureTool,
  runRebuildWorkflowTool,
  exportRebuildReportTool,
  planPatchTool,
  listPatchHistoryTool,
  applyPatchTool,
  runPatchIterationTool,
  markAcceptanceTool,
  stabilizeFixtureTool,
  exportPatchReportTool,
  getTaskManifestTool,
  evaluateStageGateTool,
  registerRegressionBaselineTool,
  listRegressionBaselinesTool,
  runRegressionBaselineTool,
  exportSdkPackageTool,
  exportTaskStateReportTool,
  exportRegressionReportTool,
  runDeliveryWorkflowTool,
  registerIntermediateBaselineTool,
  listIntermediateBaselinesTool,
  runIntermediateRegressionTool,
  registerUpgradeBaselineTool,
  runUpgradeWorkflowTool,
  exportUpgradeReportTool,
  exportDeliveryBundleTool,
  smokeTestDeliveryBundleTool,
  exportDeliveryReportTool,
  freezeRuntimeSampleTool,
  exportRuntimeTraceTool,
  definePureBoundaryTool,
  buildPureFixtureTool,
  extractNodePureTool,
  verifyNodePureTool,
  runPureWorkflowTool,
  exportPureReportTool,
  extractPythonPureTool,
  verifyPythonPureTool,
  diffCrossLanguageTool,
  runPortWorkflowTool,
  exportPortReportTool,
  analyzeUpgradeDiffTool,
  analyzeTargetTool
] satisfies readonly RegisteredToolDefinition[];
export const allTools = [...coreTools, ...navigationTools, ...debuggingTools, ...networkTools, ...reverseTools] satisfies readonly RegisteredToolDefinition[];

export {
  analyzeTargetTool,
  analyzeSignatureChainTool,
  analyzeUpgradeDiffTool,
  applyPatchTool,
  breakOnXhrTool,
  checkBrowserHealthTool,
  clearHookDataTool,
  clearNetworkRequestsTool,
  collectCodeTool,
  collectionDiffTool,
  compareRebuildResultTool,
  correlateRequestFlowsTool,
  createHookTool,
  deobfuscateCodeTool,
  definePureBoundaryTool,
  detectCryptoTool,
  diffCrossLanguageTool,
  diffEnvRequirementsTool,
  evaluateScriptTool,
  exportPatchReportTool,
  exportDeliveryBundleTool,
  exportDeliveryReportTool,
  evaluateStageGateTool,
  exportPortReportTool,
  exportPureReportTool,
  exportRebuildBundleTool,
  exportRebuildReportTool,
  exportRegressionReportTool,
  exportReverseReportTool,
  exportRuntimeTraceTool,
  exportCaptureReportTool,
  exportScenarioReportTool,
  exportSdkPackageTool,
  exportSessionReportTool,
  exportTaskStateReportTool,
  exportUpgradeReportTool,
  extractHelperBoundaryTool,
  extractNodePureTool,
  extractPythonPureTool,
  freezeRuntimeSampleTool,
  getCollectedCodeFileTool,
  getHookDataTool,
  getNetworkRequestTool,
  getRequestInitiatorTool,
  getServerInfoTool,
  getTaskManifestTool,
  injectHookTool,
  listCollectedCodeTool,
  listCapturePresetsTool,
  listHelperBoundariesTool,
  listHooksTool,
  listIntermediateBaselinesTool,
  listNetworkRequestsTool,
  listPagesTool,
  listPatchHistoryTool,
  listRegressionBaselinesTool,
  listScenarioPresetsTool,
  listToolsSummaryTool,
  listXhrBreakpointsTool,
  markAcceptanceTool,
  locateCryptoHelpersTool,
  locateRequestSinkTool,
  navigatePageTool,
  newPageTool,
  openReverseTaskTool,
  pingTool,
  planPatchTool,
  probeReverseTargetTool,
  recordReverseEvidenceTool,
  registerIntermediateBaselineTool,
  registerRegressionBaselineTool,
  registerUpgradeBaselineTool,
  removeXhrBreakpointTool,
  riskPanelTool,
  replayTargetActionTool,
  runCaptureRecipeTool,
  runPatchIterationTool,
  runDeliveryWorkflowTool,
  runIntermediateRegressionTool,
  runPortWorkflowTool,
  runPureWorkflowTool,
  runRegressionBaselineTool,
  runRebuildProbeTool,
  runRebuildWorkflowTool,
  runScenarioRecipeTool,
  runUpgradeWorkflowTool,
  savePureFixtureTool,
  searchCollectedCodeTool,
  selectPageTool,
  smokeTestDeliveryBundleTool,
  stabilizeFixtureTool,
  summarizeCodeTool,
  traceTokenFamilyTool,
  understandCodeTool,
  verifyNodePureTool,
  verifyPythonPureTool,
  buildPureFixtureTool
};
