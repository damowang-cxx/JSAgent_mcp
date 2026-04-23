import { AppError } from '../core/errors.js';
import type { AiRoutingPolicy } from '../ai/AiRoutingPolicy.js';
import type { AstSubstrateSnapshot } from '../ast-substrate/types.js';
import type { AstSubstrateRegistry } from '../ast-substrate/AstSubstrateRegistry.js';
import type { BrowserOpsRegistry } from '../browser-ops/BrowserOpsRegistry.js';
import type { SessionStateManager } from '../browser-ops/SessionStateManager.js';
import type { PreloadScriptRegistry } from '../browser-ops/PreloadScriptRegistry.js';
import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { DebugTargetCatalog } from '../debugger/DebugTargetCatalog.js';
import type { DebuggerFinishingRegistry } from '../debugger/DebuggerFinishingRegistry.js';
import type { DebuggerFinishingSnapshot } from '../debugger/types.js';
import type { ExceptionBreakpointManager } from '../debugger/ExceptionBreakpointManager.js';
import type { WatchExpressionRegistry } from '../debugger/WatchExpressionRegistry.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { EventMonitorRegistry } from '../function-scalpel/EventMonitorRegistry.js';
import type { FunctionHookManager } from '../function-scalpel/FunctionHookManager.js';
import type { FunctionScalpelRegistry } from '../function-scalpel/FunctionScalpelRegistry.js';
import type { FunctionTraceRegistry } from '../function-scalpel/FunctionTraceRegistry.js';
import type { FunctionScalpelSnapshot } from '../function-scalpel/types.js';
import type { ReplayRecipeRunner } from '../replay/ReplayRecipeRunner.js';
import type { CompareAnchorRegistry } from '../compare/CompareAnchorRegistry.js';
import type { FlowReasoningRegistry } from '../flow/FlowReasoningRegistry.js';
import type { HelperBoundaryRegistry } from '../helper/HelperBoundaryRegistry.js';
import type { PatchPreflightRegistry } from '../patch-preflight/PatchPreflightRegistry.js';
import type { PurePreflightRegistry } from '../pure-preflight/PurePreflightRegistry.js';
import type { RebuildContextRegistry } from '../rebuild-integration/RebuildContextRegistry.js';
import type { ScenarioWorkflowRunner } from '../scenario/ScenarioWorkflowRunner.js';
import type { ScriptCatalog } from '../source-intel/ScriptCatalog.js';
import type { SourcePrecisionRegistry } from '../source-intel/SourcePrecisionRegistry.js';
import type { SourcePrecisionSnapshot } from '../source-intel/types.js';
import type { StealthCoordinator, StealthRuntimeState } from '../stealth/StealthCoordinator.js';
import type { StealthFeatureRegistry } from '../stealth/StealthFeatureRegistry.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { DeliveryContextRegistry } from '../delivery-consumption/DeliveryContextRegistry.js';
import type { DependencyWindowRegistry } from '../window/DependencyWindowRegistry.js';
import type { BattlefieldContext } from './types.js';
import { uniqueStrings } from './lineage.js';

interface BattlefieldContextResolverDeps {
  browserSession: BrowserSessionManager;
  browserOpsRegistry: BrowserOpsRegistry;
  sessionStateManager: SessionStateManager;
  preloadScriptRegistry: PreloadScriptRegistry;
  stealthCoordinator: StealthCoordinator;
  scriptCatalog: ScriptCatalog;
  sourcePrecisionRegistry: SourcePrecisionRegistry;
  exceptionBreakpointManager: ExceptionBreakpointManager;
  watchExpressionRegistry: WatchExpressionRegistry;
  debugTargetCatalog: DebugTargetCatalog;
  debuggerFinishingRegistry: DebuggerFinishingRegistry;
  functionHookManager: FunctionHookManager;
  functionTraceRegistry: FunctionTraceRegistry;
  eventMonitorRegistry: EventMonitorRegistry;
  functionScalpelRegistry: FunctionScalpelRegistry;
  astSubstrateRegistry: AstSubstrateRegistry;
  aiRoutingPolicy: AiRoutingPolicy;
  stealthFeatureRegistry: StealthFeatureRegistry;
  scenarioWorkflowRunner: ScenarioWorkflowRunner;
  replayRecipeRunner: ReplayRecipeRunner;
  helperBoundaryRegistry: HelperBoundaryRegistry;
  dependencyWindowRegistry: DependencyWindowRegistry;
  compareAnchorRegistry: CompareAnchorRegistry;
  patchPreflightRegistry: PatchPreflightRegistry;
  rebuildContextRegistry: RebuildContextRegistry;
  flowReasoningRegistry: FlowReasoningRegistry;
  purePreflightRegistry: PurePreflightRegistry;
  deliveryContextRegistry: DeliveryContextRegistry;
  evidenceStore: EvidenceStore;
  taskManifestManager: TaskManifestManager;
}

export class BattlefieldContextResolver {
  constructor(private readonly deps: BattlefieldContextResolverDeps) {}

  async resolve(options: {
    taskId?: string;
    source?: 'runtime-last' | 'task-artifact';
  } = {}): Promise<BattlefieldContext> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'prepare_battlefield_context with source=task-artifact requires taskId.');
    }

    return options.source === 'task-artifact'
      ? await this.resolveFromTaskArtifacts(options.taskId as string)
      : await this.resolveFromRuntime();
  }

  private async resolveFromRuntime(): Promise<BattlefieldContext> {
    const selectedPage = await this.readSelectedPageUrl();
    const browserOpsSnapshot = this.deps.browserOpsRegistry.getLastSnapshot();
    const sourceSnapshot = this.deps.sourcePrecisionRegistry.getLast();
    const debuggerSnapshot = this.deps.debuggerFinishingRegistry.getLast();
    const functionSnapshot = this.deps.functionScalpelRegistry.getLast();
    const astSnapshot = this.deps.astSubstrateRegistry.getLast();
    const stealthState = this.deps.stealthCoordinator.getRuntimeState();
    const scripts = await this.readRuntimeScripts(sourceSnapshot);
    const targets = await this.readRuntimeDebugTargets(debuggerSnapshot);
    const hooks = this.deps.functionHookManager.list();
    const traces = this.deps.functionTraceRegistry.list({ limit: 500 });
    const monitors = this.deps.eventMonitorRegistry.listMonitors();

    return this.buildContext({
      astSnapshot,
      browserOpsSnapshot,
      debuggerSnapshot: {
        currentDebugTargetId: debuggerSnapshot?.currentDebugTargetId,
        exceptionBreakpointMode: this.deps.exceptionBreakpointManager.getMode(),
        lastDebugTargets: debuggerSnapshot?.lastDebugTargets ?? targets,
        lastWatchValues: debuggerSnapshot?.lastWatchValues,
        notes: debuggerSnapshot?.notes,
        watchExpressions: this.deps.watchExpressionRegistry.list()
      },
      deliveryContextAvailable: Boolean(this.deps.deliveryContextRegistry.getLastDeliveryContext()),
      functionSnapshot: {
        events: functionSnapshot?.events,
        hooks,
        inspections: functionSnapshot?.inspections,
        monitors,
        notes: functionSnapshot?.notes,
        traces
      },
      regressionContextAvailable: Boolean(this.deps.deliveryContextRegistry.getLastRegressionContext()),
      scenarioAvailable: Boolean(this.deps.scenarioWorkflowRunner.getLastScenarioWorkflowResult()),
      captureAvailable: Boolean(this.deps.replayRecipeRunner.getLastReplayRecipeResult()),
      compareAnchorAvailable: Boolean(this.deps.compareAnchorRegistry.getLast()?.selected),
      dependencyWindowAvailable: Boolean(this.deps.dependencyWindowRegistry.getLast()),
      flowReasoningAvailable: Boolean(this.deps.flowReasoningRegistry.getLast()),
      helperBoundaryAvailable: Boolean(this.deps.helperBoundaryRegistry.getLast()),
      patchPreflightAvailable: Boolean(this.deps.patchPreflightRegistry.getLast()?.selected),
      preloadCount: this.deps.preloadScriptRegistry.list().length,
      purePreflightAvailable: Boolean(this.deps.purePreflightRegistry.getLast()),
      rebuildContextAvailable: Boolean(this.deps.rebuildContextRegistry.getLast()),
      selectedPage,
      sourceSnapshot: {
        lastFindResult: sourceSnapshot?.lastFindResult,
        lastScriptList: scripts,
        lastSearchResult: sourceSnapshot?.lastSearchResult,
        lastSourceRead: sourceSnapshot?.lastSourceRead,
        notes: sourceSnapshot?.notes
      },
      stealthState,
      sessionStateCount: this.deps.sessionStateManager.list().length
    });
  }

  private async resolveFromTaskArtifacts(taskId: string): Promise<BattlefieldContext> {
    await this.deps.taskManifestManager.ensureTask(taskId);
    const [
      manifest,
      browserOpsSnapshot,
      sourceSnapshot,
      debuggerSnapshot,
      functionSnapshot,
      astSnapshot,
      stealthState,
      scenarioWorkflow,
      captureResult,
      helperBoundary,
      dependencyWindow,
      compareAnchor,
      patchPreflight,
      rebuildContext,
      flowReasoning,
      purePreflight,
      regressionContext,
      deliveryContext
    ] = await Promise.all([
      this.deps.taskManifestManager.getTask(taskId),
      this.deps.browserOpsRegistry.readFromTask(taskId),
      this.deps.sourcePrecisionRegistry.readFromTask(taskId),
      this.deps.debuggerFinishingRegistry.readFromTask(taskId),
      this.deps.functionScalpelRegistry.readFromTask(taskId),
      this.deps.astSubstrateRegistry.readFromTask(taskId),
      this.deps.stealthCoordinator.readFromTask(taskId),
      this.readSnapshot<Record<string, unknown>>(taskId, 'scenario/workflow'),
      this.readSnapshot<Record<string, unknown>>(taskId, 'scenario/capture/result'),
      this.readStoredResult<{ result: Record<string, unknown> }>(taskId, 'helper-boundary/latest'),
      this.readStoredResult<{ result: Record<string, unknown> }>(taskId, 'dependency-window/latest'),
      this.deps.compareAnchorRegistry.readFromTask(taskId),
      this.deps.patchPreflightRegistry.readFromTask(taskId),
      this.deps.rebuildContextRegistry.readFromTask(taskId),
      this.deps.flowReasoningRegistry.readFromTask(taskId),
      this.deps.purePreflightRegistry.readFromTask(taskId),
      this.deps.deliveryContextRegistry.readRegressionFromTask(taskId),
      this.deps.deliveryContextRegistry.readDeliveryFromTask(taskId)
    ]);

    return this.buildContext({
      astSnapshot,
      browserOpsSnapshot,
      debuggerSnapshot,
      deliveryContextAvailable: Boolean(deliveryContext?.result),
      functionSnapshot,
      regressionContextAvailable: Boolean(regressionContext?.result),
      scenarioAvailable: Boolean(scenarioWorkflow),
      captureAvailable: Boolean(captureResult),
      compareAnchorAvailable: Boolean(compareAnchor?.result?.selected),
      dependencyWindowAvailable: Boolean(dependencyWindow),
      flowReasoningAvailable: Boolean(flowReasoning?.result),
      helperBoundaryAvailable: Boolean(helperBoundary),
      patchPreflightAvailable: Boolean(patchPreflight?.result?.selected),
      preloadCount: browserOpsSnapshot?.activePreloadScripts?.length ?? 0,
      purePreflightAvailable: Boolean(purePreflight?.result),
      rebuildContextAvailable: Boolean(rebuildContext?.result),
      selectedPage: manifest?.targetUrl,
      sourceSnapshot,
      stealthState,
      sessionStateCount: browserOpsSnapshot?.activeSessionStates?.length ?? 0
    });
  }

  private buildContext(input: {
    selectedPage?: string;
    browserOpsSnapshot: {
      lastStorageSnapshot?: unknown;
      activePreloadScripts?: Array<{ scriptId: string; createdAt: string }>;
      activeSessionStates?: Array<{ sessionId: string; createdAt: string; url?: string }>;
      lastStealthPreset?: string | null;
      notes?: string[];
    } | null;
    sourceSnapshot: SourcePrecisionSnapshot | null;
    debuggerSnapshot: DebuggerFinishingSnapshot | null;
    functionSnapshot: FunctionScalpelSnapshot | null;
    astSnapshot: AstSubstrateSnapshot | null;
    stealthState: StealthRuntimeState | null;
    preloadCount: number;
    sessionStateCount: number;
    scenarioAvailable: boolean;
    captureAvailable: boolean;
    helperBoundaryAvailable: boolean;
    dependencyWindowAvailable: boolean;
    compareAnchorAvailable: boolean;
    patchPreflightAvailable: boolean;
    rebuildContextAvailable: boolean;
    flowReasoningAvailable: boolean;
    purePreflightAvailable: boolean;
    regressionContextAvailable: boolean;
    deliveryContextAvailable: boolean;
  }): BattlefieldContext {
    const scriptCount = input.sourceSnapshot?.lastScriptList?.length ?? 0;
    const hookCount = input.functionSnapshot?.hooks?.length ?? 0;
    const traceCount = input.functionSnapshot?.traces?.length ?? 0;
    const monitorCount = input.functionSnapshot?.monitors?.length ?? 0;
    const targetCount = input.debuggerSnapshot?.lastDebugTargets?.length ?? 0;
    const watchCount = input.debuggerSnapshot?.watchExpressions?.length ?? 0;
    const enabledFeatures = input.stealthState?.enabledFeatures ?? [];

    const context: BattlefieldContext = {
      browserOps: {
        preloadActive: input.preloadCount > 0 || enabledFeatures.length > 0,
        sessionStateAvailable: input.sessionStateCount > 0,
        stealthState: input.stealthState?.presetId ?? input.browserOpsSnapshot?.lastStealthPreset ?? (enabledFeatures.length > 0 ? 'feature-coordinated' : null),
        storageSnapshotAvailable: Boolean(input.browserOpsSnapshot?.lastStorageSnapshot)
      },
      contextId: makeContextId(input.selectedPage),
      debuggerFinishing: {
        exceptionMode: input.debuggerSnapshot?.exceptionBreakpointMode ?? 'none',
        targetCount,
        watchCount
      },
      functionScalpel: {
        hookCount,
        monitorCount,
        traceCount
      },
      notes: [],
      nextActions: [],
      selectedPage: input.selectedPage,
      sourcePrecision: {
        lastFindAvailable: Boolean(input.sourceSnapshot?.lastFindResult?.length),
        lastSearchAvailable: Boolean(input.sourceSnapshot?.lastSearchResult?.length),
        scriptCount
      },
      stopIf: [],
      structuredWorkflow: {
        captureAvailable: input.captureAvailable,
        compareAnchorAvailable: input.compareAnchorAvailable,
        deliveryContextAvailable: input.deliveryContextAvailable,
        dependencyWindowAvailable: input.dependencyWindowAvailable,
        flowReasoningAvailable: input.flowReasoningAvailable,
        helperBoundaryAvailable: input.helperBoundaryAvailable,
        patchPreflightAvailable: input.patchPreflightAvailable,
        purePreflightAvailable: input.purePreflightAvailable,
        rebuildContextAvailable: input.rebuildContextAvailable,
        regressionContextAvailable: input.regressionContextAvailable,
        scenarioAvailable: input.scenarioAvailable
      },
      substrate: {
        aiRoutingAvailable: Boolean(this.deps.aiRoutingPolicy.get().defaultMode),
        astAvailable: Boolean(scriptCount > 0 || input.astSnapshot?.foundReferences?.length || input.astSnapshot?.locatedFunctions?.length || input.astSnapshot?.rewritePreviews?.length),
        stealthFeatureStateAvailable: enabledFeatures.length > 0 || Boolean(input.stealthState?.presetId)
      }
    };

    const notes: string[] = [];
    const nextActions: string[] = [];
    const stopIf: string[] = [];

    if (!context.selectedPage) {
      notes.push('No selected page is currently captured in battlefield context.');
      nextActions.push('Select the live page and stabilize browser field state before deeper reverse escalation.');
      stopIf.push('selected page remains unresolved');
    }
    if (!context.browserOps?.storageSnapshotAvailable) {
      notes.push('No browser storage snapshot is available yet.');
      nextActions.push('Capture storage and session state so runtime/browser provenance is available downstream.');
    }
    if (!context.browserOps?.preloadActive) {
      notes.push('No preload or stealth coordination is currently active.');
      nextActions.push('Apply preload or stealth coordination before field automation becomes noisy.');
    }
    if ((context.sourcePrecision?.scriptCount ?? 0) === 0) {
      notes.push('Live script precision is not ready yet.');
      nextActions.push('Enumerate live scripts and run bounded source search before collected-code fallback.');
      stopIf.push('script/source still unclear');
    } else if (!context.sourcePrecision?.lastFindAvailable && !context.sourcePrecision?.lastSearchAvailable) {
      notes.push('Live scripts are known, but no exact find/search result is cached yet.');
      nextActions.push('Use search_in_sources or find_in_script to isolate the target chain before debugger escalation.');
      stopIf.push('target script is still unresolved');
    }
    if ((context.functionScalpel?.hookCount ?? 0) === 0 && (context.functionScalpel?.traceCount ?? 0) === 0) {
      notes.push('No function hook or trace evidence is available yet.');
      nextActions.push('Use hook_function or trace_function once source precision has isolated the target function.');
      stopIf.push('target function unresolved');
    }
    if ((context.debuggerFinishing?.watchCount ?? 0) === 0 && (context.debuggerFinishing?.exceptionMode ?? 'none') === 'none') {
      notes.push('Debugger finishing helpers are not configured yet.');
      nextActions.push('Use exception breakpoints or watch expressions only for precise live-state validation after hooks/source are narrowed.');
    }
    if (!context.structuredWorkflow?.helperBoundaryAvailable) {
      notes.push('Helper boundary evidence is not available yet.');
      nextActions.push('Return to helper boundary extraction before compare, rebuild, or pure escalation.');
      stopIf.push('helper boundary still too broad');
    }
    if (!context.structuredWorkflow?.compareAnchorAvailable) {
      notes.push('No compare anchor is available yet.');
      nextActions.push('Select a compare anchor before trusting broad divergence or patch decisions.');
      stopIf.push('compare anchor unavailable');
    }
    if (!context.structuredWorkflow?.rebuildContextAvailable) {
      notes.push('No rebuild context is available yet.');
      nextActions.push('Prepare rebuild context before running rebuild-from-context or patch iteration.');
      stopIf.push('rebuild context missing');
    }
    if (!context.structuredWorkflow?.purePreflightAvailable) {
      notes.push('No pure preflight context is available yet.');
      nextActions.push('Plan pure preflight before pure extraction or delivery claims.');
      stopIf.push('pure preflight not ready');
    }
    if (context.structuredWorkflow?.regressionContextAvailable || context.structuredWorkflow?.deliveryContextAvailable) {
      notes.push('Regression/delivery provenance already carries some battlefield lineage downstream.');
    }

    context.notes = uniqueStrings([
      ...notes,
      ...(input.browserOpsSnapshot?.notes ?? []),
      ...(input.sourceSnapshot?.notes ?? []),
      ...(input.debuggerSnapshot?.notes ?? []),
      ...(input.functionSnapshot?.notes ?? []),
      ...(input.astSnapshot?.notes ?? []),
      ...(input.stealthState?.notes ?? [])
    ], 40);
    context.nextActions = uniqueStrings(nextActions, 14);
    context.stopIf = uniqueStrings(stopIf, 12);
    return context;
  }

  private async readSelectedPageUrl(): Promise<string | undefined> {
    try {
      const page = await this.deps.browserSession.getSelectedPageOrNull();
      return page?.url();
    } catch {
      return undefined;
    }
  }

  private async readRuntimeScripts(sourceSnapshot: SourcePrecisionSnapshot | null): Promise<SourcePrecisionSnapshot['lastScriptList']> {
    try {
      return await this.deps.scriptCatalog.list();
    } catch {
      return sourceSnapshot?.lastScriptList ?? [];
    }
  }

  private async readRuntimeDebugTargets(
    debuggerSnapshot: DebuggerFinishingSnapshot | null
  ): Promise<DebuggerFinishingSnapshot['lastDebugTargets']> {
    try {
      return await this.deps.debugTargetCatalog.list();
    } catch {
      return debuggerSnapshot?.lastDebugTargets ?? [];
    }
  }

  private async readSnapshot<T>(taskId: string, name: string): Promise<T | null> {
    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, name);
      return snapshot ? snapshot as T : null;
    } catch {
      return null;
    }
  }

  private async readStoredResult<T extends { result: unknown }>(taskId: string, name: string): Promise<T['result'] | null> {
    const snapshot = await this.readSnapshot<T>(taskId, name);
    return snapshot?.result ?? null;
  }
}

function makeContextId(selectedPage: string | undefined): string {
  const seed = (selectedPage ?? 'battlefield')
    .replace(/[^A-Za-z0-9_$.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'battlefield';
  return `${seed}-${Date.now().toString(36)}`;
}
