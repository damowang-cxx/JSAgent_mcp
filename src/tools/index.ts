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
import { analyzeFlowReasoningTool } from './reverse/analyzeFlowReasoning.js';
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
import { exportBoundaryFixtureReportTool } from './reverse/exportBoundaryFixtureReport.js';
import { exportAiAugmentationReportTool } from './reverse/exportAiAugmentationReport.js';
import { exportDeliveryBundleTool } from './reverse/exportDeliveryBundle.js';
import { exportDeliveryReportTool } from './reverse/exportDeliveryReport.js';
import { exportFlowReasoningReportTool } from './reverse/exportFlowReasoningReport.js';
import { exportPatchReportTool } from './reverse/exportPatchReport.js';
import { exportPatchPreflightReportTool } from './reverse/exportPatchPreflightReport.js';
import { exportPurePreflightReportTool } from './reverse/exportPurePreflightReport.js';
import { exportProbePlanReportTool } from './reverse/exportProbePlanReport.js';
import { exportPortReportTool } from './reverse/exportPortReport.js';
import { exportPureReportTool } from './reverse/exportPureReport.js';
import { exportRebuildContextReportTool } from './reverse/exportRebuildContextReport.js';
import { exportRebuildBundleTool } from './reverse/exportRebuildBundle.js';
import { exportRebuildReportTool } from './reverse/exportRebuildReport.js';
import { exportRegressionReportTool } from './reverse/exportRegressionReport.js';
import { exportReverseReportTool } from './reverse/exportReverseReport.js';
import { exportRuntimeTraceTool } from './reverse/exportRuntimeTrace.js';
import { exportCaptureReportTool } from './reverse/exportCaptureReport.js';
import { exportCompareAnchorReportTool } from './reverse/exportCompareAnchorReport.js';
import { exportDebuggerReportTool } from './reverse/exportDebuggerReport.js';
import { exportScenarioPatchHintReportTool } from './reverse/exportScenarioPatchHintReport.js';
import { exportScenarioReportTool } from './reverse/exportScenarioReport.js';
import { exportSdkPackageTool } from './reverse/exportSdkPackage.js';
import { exportSessionReportTool } from './reverse/exportSessionReport.js';
import { exportTaskStateReportTool } from './reverse/exportTaskStateReport.js';
import { exportUpgradeReportTool } from './reverse/exportUpgradeReport.js';
import { exportWindowReportTool } from './reverse/exportWindowReport.js';
import { explainReverseContextWithAiTool } from './reverse/explainReverseContextWithAi.js';
import { extractDependencyWindowTool } from './reverse/extractDependencyWindow.js';
import { extractHelperBoundaryTool } from './reverse/extractHelperBoundary.js';
import { extractNodePureTool } from './reverse/extractNodePure.js';
import { extractPythonPureTool } from './reverse/extractPythonPure.js';
import { freezeRuntimeSampleTool } from './reverse/freezeRuntimeSample.js';
import { generateBoundaryFixtureTool } from './reverse/generateBoundaryFixture.js';
import { generateScenarioPatchHintsTool } from './reverse/generateScenarioPatchHints.js';
import { getCallFramesTool } from './reverse/getCallFrames.js';
import { getCollectedCodeFileTool } from './reverse/getCollectedCodeFile.js';
import { getHookDataTool } from './reverse/getHookData.js';
import { getRequestInitiatorTool } from './reverse/getRequestInitiator.js';
import { getPausedInfoTool } from './reverse/getPausedInfo.js';
import { getScopeVariablesTool } from './reverse/getScopeVariables.js';
import { getTaskManifestTool } from './reverse/getTaskManifest.js';
import { injectHookTool } from './reverse/injectHook.js';
import { listCollectedCodeTool } from './reverse/listCollectedCode.js';
import { listBoundaryFixturesTool } from './reverse/listBoundaryFixtures.js';
import { listAiAugmentationsTool } from './reverse/listAiAugmentations.js';
import { listBreakpointsTool } from './reverse/listBreakpoints.js';
import { listCapturePresetsTool } from './reverse/listCapturePresets.js';
import { listCompareAnchorsTool } from './reverse/listCompareAnchors.js';
import { listDependencyWindowsTool } from './reverse/listDependencyWindows.js';
import { listFlowReasoningResultsTool } from './reverse/listFlowReasoningResults.js';
import { listHelperBoundariesTool } from './reverse/listHelperBoundaries.js';
import { listHooksTool } from './reverse/listHooks.js';
import { listPatchHistoryTool } from './reverse/listPatchHistory.js';
import { listPatchPreflightsTool } from './reverse/listPatchPreflights.js';
import { listPurePreflightsTool } from './reverse/listPurePreflights.js';
import { listIntermediateBaselinesTool } from './reverse/listIntermediateBaselines.js';
import { listRegressionBaselinesTool } from './reverse/listRegressionBaselines.js';
import { listRebuildContextsTool } from './reverse/listRebuildContexts.js';
import { listScenarioPresetsTool } from './reverse/listScenarioPresets.js';
import { listScenarioPatchHintsTool } from './reverse/listScenarioPatchHints.js';
import { listXhrBreakpointsTool } from './reverse/listXhrBreakpoints.js';
import { locateCryptoHelpersTool } from './reverse/locateCryptoHelpers.js';
import { locateRequestSinkTool } from './reverse/locateRequestSink.js';
import { markAcceptanceTool } from './reverse/markAcceptance.js';
import { openReverseTaskTool } from './reverse/openReverseTask.js';
import { planPatchTool } from './reverse/planPatch.js';
import { planPatchPreflightTool } from './reverse/planPatchPreflight.js';
import { planPurePreflightTool } from './reverse/planPurePreflight.js';
import { planScenarioProbeTool } from './reverse/planScenarioProbe.js';
import { prepareRebuildContextTool } from './reverse/prepareRebuildContext.js';
import { probeReverseTargetTool } from './reverse/probeReverseTarget.js';
import { recordReverseEvidenceTool } from './reverse/recordReverseEvidence.js';
import { registerRegressionBaselineTool } from './reverse/registerRegressionBaseline.js';
import { registerIntermediateBaselineTool } from './reverse/registerIntermediateBaseline.js';
import { registerUpgradeBaselineTool } from './reverse/registerUpgradeBaseline.js';
import { removeBreakpointTool } from './reverse/removeBreakpoint.js';
import { removeXhrBreakpointTool } from './reverse/removeXhrBreakpoint.js';
import { resumeExecutionTool } from './reverse/resumeExecution.js';
import { riskPanelTool } from './reverse/riskPanel.js';
import { replayTargetActionTool } from './reverse/replayTargetAction.js';
import { runCaptureRecipeTool } from './reverse/runCaptureRecipe.js';
import { runScenarioRecipeTool } from './reverse/runScenarioRecipe.js';
import { runDeliveryWorkflowTool } from './reverse/runDeliveryWorkflow.js';
import { runIntermediateRegressionTool } from './reverse/runIntermediateRegression.js';
import { runPatchIterationTool } from './reverse/runPatchIteration.js';
import { runPortWorkflowTool } from './reverse/runPortWorkflow.js';
import { runPureWorkflowTool } from './reverse/runPureWorkflow.js';
import { runPureFromPreflightTool } from './reverse/runPureFromPreflight.js';
import { runRegressionBaselineTool } from './reverse/runRegressionBaseline.js';
import { runRebuildProbeTool } from './reverse/runRebuildProbe.js';
import { runRebuildFromContextTool } from './reverse/runRebuildFromContext.js';
import { runRebuildWorkflowTool } from './reverse/runRebuildWorkflow.js';
import { runUpgradeWorkflowTool } from './reverse/runUpgradeWorkflow.js';
import { listScenarioProbePlansTool } from './reverse/listScenarioProbePlans.js';
import { savePureFixtureTool } from './reverse/savePureFixture.js';
import { searchCollectedCodeTool } from './reverse/searchCollectedCode.js';
import { selectCompareAnchorTool } from './reverse/selectCompareAnchor.js';
import { setBreakpointTool } from './reverse/setBreakpoint.js';
import { setBreakpointOnTextTool } from './reverse/setBreakpointOnText.js';
import { smokeTestDeliveryBundleTool } from './reverse/smokeTestDeliveryBundle.js';
import { stabilizeFixtureTool } from './reverse/stabilizeFixture.js';
import { stepIntoTool } from './reverse/stepInto.js';
import { stepOutTool } from './reverse/stepOut.js';
import { stepOverTool } from './reverse/stepOver.js';
import { summarizeCodeTool } from './reverse/summarizeCode.js';
import { traceHelperConsumersTool } from './reverse/traceHelperConsumers.js';
import { traceRequestFieldBindingTool } from './reverse/traceRequestFieldBinding.js';
import { traceTokenFamilyTool } from './reverse/traceTokenFamily.js';
import { understandCodeTool } from './reverse/understandCode.js';
import { verifyNodePureTool } from './reverse/verifyNodePure.js';
import { verifyPythonPureTool } from './reverse/verifyPythonPure.js';
import { buildPureFixtureTool } from './reverse/buildPureFixture.js';
import { evaluateStageGateTool } from './reverse/evaluateStageGate.js';
import { evaluateOnCallFrameTool } from './reverse/evaluateOnCallFrame.js';
import { pauseExecutionTool } from './reverse/pauseExecution.js';
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
  extractDependencyWindowTool,
  listDependencyWindowsTool,
  planScenarioProbeTool,
  listScenarioProbePlansTool,
  exportWindowReportTool,
  exportProbePlanReportTool,
  generateBoundaryFixtureTool,
  listBoundaryFixturesTool,
  generateScenarioPatchHintsTool,
  listScenarioPatchHintsTool,
  exportBoundaryFixtureReportTool,
  exportScenarioPatchHintReportTool,
  setBreakpointTool,
  setBreakpointOnTextTool,
  listBreakpointsTool,
  removeBreakpointTool,
  pauseExecutionTool,
  resumeExecutionTool,
  getPausedInfoTool,
  stepOverTool,
  stepIntoTool,
  stepOutTool,
  getCallFramesTool,
  getScopeVariablesTool,
  evaluateOnCallFrameTool,
  exportDebuggerReportTool,
  selectCompareAnchorTool,
  listCompareAnchorsTool,
  exportCompareAnchorReportTool,
  planPatchPreflightTool,
  listPatchPreflightsTool,
  exportPatchPreflightReportTool,
  prepareRebuildContextTool,
  listRebuildContextsTool,
  runRebuildFromContextTool,
  exportRebuildContextReportTool,
  analyzeFlowReasoningTool,
  traceHelperConsumersTool,
  traceRequestFieldBindingTool,
  listFlowReasoningResultsTool,
  exportFlowReasoningReportTool,
  planPurePreflightTool,
  listPurePreflightsTool,
  runPureFromPreflightTool,
  exportPurePreflightReportTool,
  explainReverseContextWithAiTool,
  listAiAugmentationsTool,
  exportAiAugmentationReportTool,
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
  analyzeFlowReasoningTool,
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
  evaluateOnCallFrameTool,
  exportBoundaryFixtureReportTool,
  exportAiAugmentationReportTool,
  exportCompareAnchorReportTool,
  exportDebuggerReportTool,
  exportFlowReasoningReportTool,
  exportPatchReportTool,
  exportPatchPreflightReportTool,
  exportPurePreflightReportTool,
  exportProbePlanReportTool,
  exportDeliveryBundleTool,
  exportDeliveryReportTool,
  evaluateStageGateTool,
  exportPortReportTool,
  exportPureReportTool,
  exportRebuildContextReportTool,
  exportRebuildBundleTool,
  exportRebuildReportTool,
  exportRegressionReportTool,
  exportReverseReportTool,
  exportRuntimeTraceTool,
  exportCaptureReportTool,
  exportScenarioPatchHintReportTool,
  exportScenarioReportTool,
  exportSdkPackageTool,
  exportSessionReportTool,
  exportTaskStateReportTool,
  exportUpgradeReportTool,
  exportWindowReportTool,
  extractDependencyWindowTool,
  explainReverseContextWithAiTool,
  extractHelperBoundaryTool,
  extractNodePureTool,
  extractPythonPureTool,
  freezeRuntimeSampleTool,
  generateBoundaryFixtureTool,
  generateScenarioPatchHintsTool,
  getCallFramesTool,
  getCollectedCodeFileTool,
  getHookDataTool,
  getNetworkRequestTool,
  getRequestInitiatorTool,
  getPausedInfoTool,
  getScopeVariablesTool,
  getServerInfoTool,
  getTaskManifestTool,
  injectHookTool,
  listCollectedCodeTool,
  listAiAugmentationsTool,
  listBoundaryFixturesTool,
  listBreakpointsTool,
  listCapturePresetsTool,
  listCompareAnchorsTool,
  listDependencyWindowsTool,
  listFlowReasoningResultsTool,
  listHelperBoundariesTool,
  listHooksTool,
  listIntermediateBaselinesTool,
  listNetworkRequestsTool,
  listPagesTool,
  listPatchHistoryTool,
  listPatchPreflightsTool,
  listPurePreflightsTool,
  listRegressionBaselinesTool,
  listRebuildContextsTool,
  listScenarioPatchHintsTool,
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
  planPatchPreflightTool,
  planPurePreflightTool,
  pauseExecutionTool,
  planScenarioProbeTool,
  prepareRebuildContextTool,
  probeReverseTargetTool,
  recordReverseEvidenceTool,
  registerIntermediateBaselineTool,
  registerRegressionBaselineTool,
  registerUpgradeBaselineTool,
  removeBreakpointTool,
  removeXhrBreakpointTool,
  resumeExecutionTool,
  riskPanelTool,
  replayTargetActionTool,
  runCaptureRecipeTool,
  runPatchIterationTool,
  runDeliveryWorkflowTool,
  runIntermediateRegressionTool,
  runPortWorkflowTool,
  runPureWorkflowTool,
  runPureFromPreflightTool,
  runRegressionBaselineTool,
  runRebuildProbeTool,
  runRebuildFromContextTool,
  runRebuildWorkflowTool,
  runScenarioRecipeTool,
  runUpgradeWorkflowTool,
  listScenarioProbePlansTool,
  savePureFixtureTool,
  searchCollectedCodeTool,
  selectCompareAnchorTool,
  selectPageTool,
  setBreakpointTool,
  setBreakpointOnTextTool,
  smokeTestDeliveryBundleTool,
  stabilizeFixtureTool,
  stepIntoTool,
  stepOutTool,
  stepOverTool,
  summarizeCodeTool,
  traceHelperConsumersTool,
  traceRequestFieldBindingTool,
  traceTokenFamilyTool,
  understandCodeTool,
  verifyNodePureTool,
  verifyPythonPureTool,
  buildPureFixtureTool
};
