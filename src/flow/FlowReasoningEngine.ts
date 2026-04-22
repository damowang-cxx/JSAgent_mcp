import { AppError } from '../core/errors.js';
import type { DebuggerEvidenceCorrelator } from '../debugger/DebuggerEvidenceCorrelator.js';
import type { DebuggerSessionManager } from '../debugger/DebuggerSessionManager.js';
import type { DebuggerCorrelationHint, StoredDebuggerInspectionSnapshot } from '../debugger/types.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { FixtureCandidateRegistry } from '../fixture/FixtureCandidateRegistry.js';
import type { FixtureCandidateResult, StoredFixtureCandidate } from '../fixture/types.js';
import type { HelperBoundaryRegistry } from '../helper/HelperBoundaryRegistry.js';
import type { HelperBoundaryResult, StoredHelperBoundary } from '../helper/types.js';
import type { ScenarioPatchHintRegistry } from '../patch/ScenarioPatchHintRegistry.js';
import type { ScenarioPatchHintSet, StoredScenarioPatchHintSet } from '../patch/types.scenario.js';
import type { PatchPreflightRegistry } from '../patch-preflight/PatchPreflightRegistry.js';
import type { PatchPreflightResult, StoredPatchPreflightSnapshot } from '../patch-preflight/types.js';
import type { ProbePlanRegistry } from '../probe/ProbePlanRegistry.js';
import type { ProbePlan, StoredProbePlan } from '../probe/types.js';
import type { RebuildContextRegistry } from '../rebuild-integration/RebuildContextRegistry.js';
import type { RebuildContext, StoredRebuildContextSnapshot } from '../rebuild-integration/types.js';
import type { ReplayRecipeRunner } from '../replay/ReplayRecipeRunner.js';
import type { ReplayRecipeResult } from '../replay/types.js';
import type { ScenarioWorkflowRunner } from '../scenario/ScenarioWorkflowRunner.js';
import type { ScenarioAnalysisResult, ScenarioWorkflowResult } from '../scenario/types.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { CompareAnchorRegistry } from '../compare/CompareAnchorRegistry.js';
import type { CompareAnchorSelectionResult, StoredCompareAnchorSnapshot } from '../compare/types.js';
import type { DependencyWindowRegistry } from '../window/DependencyWindowRegistry.js';
import type { DependencyWindowResult, StoredDependencyWindow } from '../window/types.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import type { AstIndexBuilder } from './AstIndexBuilder.js';
import type {
  AstAssignmentEntry,
  AstCallEntry,
  AstPropertyWriteEntry,
  FlowReasoningEdge,
  FlowReasoningNode,
  FlowReasoningResult,
  FlowReasoningNodeKind,
  LightweightAstIndex
} from './types.js';

interface FlowReasoningEngineDeps {
  astIndexBuilder: AstIndexBuilder;
  codeCollector: CodeCollector;
  helperBoundaryRegistry: HelperBoundaryRegistry;
  dependencyWindowRegistry: DependencyWindowRegistry;
  compareAnchorRegistry: CompareAnchorRegistry;
  patchPreflightRegistry: PatchPreflightRegistry;
  rebuildContextRegistry: RebuildContextRegistry;
  fixtureCandidateRegistry: FixtureCandidateRegistry;
  probePlanRegistry: ProbePlanRegistry;
  scenarioPatchHintRegistry: ScenarioPatchHintRegistry;
  scenarioWorkflowRunner: ScenarioWorkflowRunner;
  replayRecipeRunner: ReplayRecipeRunner;
  debuggerSessionManager: DebuggerSessionManager;
  debuggerEvidenceCorrelator: DebuggerEvidenceCorrelator;
  evidenceStore: EvidenceStore;
  taskManifestManager: TaskManifestManager;
}

export interface AnalyzeFlowReasoningOptions {
  taskId?: string;
  source?: 'runtime-last' | 'task-artifact';
  targetName?: string;
  targetUrl?: string;
  maxNodes?: number;
}

export interface TraceHelperConsumersOptions {
  helperName?: string;
  taskId?: string;
  source?: 'runtime-last' | 'task-artifact';
}

export interface TraceRequestFieldBindingOptions {
  fieldName?: string;
  taskId?: string;
  source?: 'runtime-last' | 'task-artifact';
}

type FlowEvidence = {
  source: 'runtime-last' | 'task-artifact';
  taskId?: string;
  helperBoundary: HelperBoundaryResult | null;
  dependencyWindow: DependencyWindowResult | null;
  compareAnchor: CompareAnchorSelectionResult | null;
  patchPreflight: PatchPreflightResult | null;
  rebuildContext: RebuildContext | null;
  fixture: FixtureCandidateResult | null;
  probePlan: ProbePlan | null;
  patchHints: ScenarioPatchHintSet | null;
  scenarioWorkflow: ScenarioWorkflowResult | null;
  scenarioAnalysis: ScenarioAnalysisResult | null;
  replayCapture: ReplayRecipeResult | null;
  debuggerHints: DebuggerCorrelationHint[];
  notes: string[];
};

type Focus =
  | { mode: 'all'; helperName?: string; fieldName?: string }
  | { mode: 'helper'; helperName?: string }
  | { mode: 'request-field'; fieldName?: string };

const DEFAULT_MAX_NODES = 20;
const MAX_EDGES = 30;
const DEFAULT_AST_TOP_FILES = 8;
const FIELD_KEYWORDS = [
  'sign',
  'signature',
  'token',
  'auth',
  'authorization',
  'nonce',
  'ts',
  'timestamp',
  'challenge',
  'verify',
  'captcha',
  'fingerprint',
  'x-sign',
  'x-token',
  'access_token'
];
const FIELD_PATTERN = /\b(sign|signature|token|auth|authorization|nonce|ts|timestamp|challenge|verify|captcha|fingerprint|x-sign|x-token|access_token)\b/i;
const SINK_PATTERN = /\b(fetch|XMLHttpRequest|xhr|ajax|sendBeacon|axios|request|send)\b/i;
const REQUEST_BINDER_PATTERN = /\b(header|headers|body|data|payload|query|params|param|searchParams|URLSearchParams|authorization|setRequestHeader)\b/i;

export class FlowReasoningEngine {
  constructor(private readonly deps: FlowReasoningEngineDeps) {}

  async analyze(options: AnalyzeFlowReasoningOptions = {}): Promise<FlowReasoningResult> {
    return await this.analyzeInternal(options, { mode: 'all' });
  }

  async traceHelperConsumers(options: TraceHelperConsumersOptions = {}): Promise<FlowReasoningResult> {
    return await this.analyzeInternal(
      {
        source: options.source,
        taskId: options.taskId,
        targetName: options.helperName,
        maxNodes: DEFAULT_MAX_NODES
      },
      {
        helperName: options.helperName,
        mode: 'helper'
      }
    );
  }

  async traceRequestFieldBinding(options: TraceRequestFieldBindingOptions = {}): Promise<FlowReasoningResult> {
    return await this.analyzeInternal(
      {
        source: options.source,
        taskId: options.taskId,
        targetName: options.fieldName,
        maxNodes: DEFAULT_MAX_NODES
      },
      {
        fieldName: options.fieldName,
        mode: 'request-field'
      }
    );
  }

  private async analyzeInternal(options: AnalyzeFlowReasoningOptions, focus: Focus): Promise<FlowReasoningResult> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'flow reasoning with source=task-artifact requires taskId.');
    }

    const source = options.source ?? 'runtime-last';
    const maxNodes = clampInt(options.maxNodes ?? DEFAULT_MAX_NODES, 1, 50);
    const evidence = source === 'task-artifact'
      ? await this.readTaskEvidence(options.taskId as string)
      : await this.readRuntimeEvidence(options.targetUrl);
    const targetName = this.resolveTargetName(options.targetName, focus, evidence);
    const scenario = this.resolveScenario(evidence);
    const files = this.resolveFiles(evidence, source);
    const astIndex = source === 'task-artifact'
      ? emptyAstIndex(files, ['Task artifact source was selected; runtime collected-code cache was not used for AST indexing.'])
      : await this.deps.astIndexBuilder.buildForFiles(files);
    const builder = new ReasoningGraphBuilder();
    const helpers = this.resolveHelperNames(focus, evidence, targetName);
    const fields = this.resolveFieldNames(focus, evidence);

    this.addEvidenceSeeds(builder, evidence, targetName);
    this.traceHelperConsumersFromAst(builder, astIndex, helpers, fields);
    this.traceRequestFieldBindingsFromAst(builder, astIndex, fields);
    this.traceSinkAdjacentBindingsFromAst(builder, astIndex, fields);
    this.addDebuggerEnhancerNodes(builder, evidence.debuggerHints);

    const finalized = builder.finalize(maxNodes, MAX_EDGES);
    const helperConsumers = uniqueStrings(builder.helperConsumers, 40);
    const requestFieldBindings = uniqueStrings(builder.requestFieldBindings, 40);
    const sinkAdjacentBindings = uniqueStrings(builder.sinkAdjacentBindings, 40);
    const notes = uniqueStrings([
      ...evidence.notes,
      ...astIndex.notes,
      `Flow reasoning source: ${source}.`,
      'Reasoning stayed target-chain-first and smallest-useful: no full AST platform, SSA, taint, or global callgraph was built.',
      'Hook/replay/boundary evidence remains primary; debugger evidence is included only as enhancer context.',
      helpers.length > 0 ? `Helper seed(s): ${helpers.join(', ')}.` : 'No explicit helper seed was available.',
      fields.length > 0 ? `Request field seed(s): ${fields.slice(0, 12).join(', ')}.` : 'No request field seed was available.'
    ], 60);

    return {
      edges: finalized.edges,
      files: uniqueStrings([...files, ...astIndex.files], 20),
      helperConsumers,
      notes,
      nodes: finalized.nodes,
      patchHints: this.buildPatchHints(helperConsumers, requestFieldBindings, sinkAdjacentBindings),
      rebuildHints: this.buildRebuildHints(helperConsumers, requestFieldBindings, sinkAdjacentBindings),
      requestFieldBindings,
      resultId: makeResultId(targetName),
      scenario,
      sinkAdjacentBindings,
      targetName
    };
  }

  private async readRuntimeEvidence(targetUrl: string | undefined): Promise<FlowEvidence> {
    const notes = ['Runtime source enabled; latest in-memory reverse artifacts and collected code were used.'];
    const debuggerHints = await this.readDebuggerHints(targetUrl, notes);
    const scenarioWorkflow = this.deps.scenarioWorkflowRunner.getLastScenarioWorkflowResult();
    const replayCapture = this.deps.replayRecipeRunner.getLastReplayRecipeResult();

    return {
      compareAnchor: this.deps.compareAnchorRegistry.getLast(),
      debuggerHints,
      dependencyWindow: this.deps.dependencyWindowRegistry.getLast(),
      fixture: this.deps.fixtureCandidateRegistry.getLast(),
      helperBoundary: this.deps.helperBoundaryRegistry.getLast(),
      notes,
      patchHints: this.deps.scenarioPatchHintRegistry.getLast(),
      patchPreflight: this.deps.patchPreflightRegistry.getLast(),
      probePlan: this.deps.probePlanRegistry.getLast(),
      rebuildContext: this.deps.rebuildContextRegistry.getLast(),
      replayCapture,
      scenarioAnalysis: scenarioWorkflow?.analysis ?? replayCapture?.scenarioResult ?? null,
      scenarioWorkflow,
      source: 'runtime-last'
    };
  }

  private async readTaskEvidence(taskId: string): Promise<FlowEvidence> {
    const manifest = await this.deps.taskManifestManager.getTask(taskId);
    if (!manifest) {
      throw new AppError('TASK_NOT_FOUND', `Task artifact source requested, but task was not found: ${taskId}`, { taskId });
    }

    const [
      helperBoundary,
      dependencyWindow,
      compareAnchor,
      patchPreflight,
      rebuildContext,
      fixture,
      probePlan,
      patchHints,
      scenarioWorkflow,
      scenarioAnalysis,
      replayCapture,
      debuggerInspection
    ] = await Promise.all([
      this.readStoredResult<StoredHelperBoundary>(taskId, 'helper-boundary/latest'),
      this.readStoredResult<StoredDependencyWindow>(taskId, 'dependency-window/latest'),
      this.readStoredResult<StoredCompareAnchorSnapshot>(taskId, 'compare-anchor/latest'),
      this.readStoredResult<StoredPatchPreflightSnapshot>(taskId, 'patch-preflight/latest'),
      this.readStoredResult<StoredRebuildContextSnapshot>(taskId, 'rebuild-context/latest'),
      this.readStoredResult<StoredFixtureCandidate>(taskId, 'boundary-fixture/latest'),
      this.readStoredResult<StoredProbePlan>(taskId, 'scenario-probe/latest'),
      this.readStoredResult<StoredScenarioPatchHintSet>(taskId, 'scenario-patch-hints/latest'),
      this.readSnapshot<ScenarioWorkflowResult>(taskId, 'scenario/workflow'),
      this.readSnapshot<ScenarioAnalysisResult>(taskId, 'scenario/analysis'),
      this.readSnapshot<ReplayRecipeResult>(taskId, 'scenario/capture/result'),
      this.readSnapshot<StoredDebuggerInspectionSnapshot>(taskId, 'debugger/inspection-last')
    ]);

    return {
      compareAnchor,
      debuggerHints: debuggerInspection?.correlations ?? [],
      dependencyWindow,
      fixture,
      helperBoundary,
      notes: [`Task artifact source enabled for ${taskId}; runtime caches were not used.`],
      patchHints,
      patchPreflight,
      probePlan,
      rebuildContext,
      replayCapture,
      scenarioAnalysis: scenarioAnalysis ?? scenarioWorkflow?.analysis ?? replayCapture?.scenarioResult ?? null,
      scenarioWorkflow,
      source: 'task-artifact',
      taskId
    };
  }

  private async readDebuggerHints(targetUrl: string | undefined, notes: string[]): Promise<DebuggerCorrelationHint[]> {
    try {
      const paused = this.deps.debuggerSessionManager.getPausedState();
      if (!paused.isPaused) {
        notes.push('Debugger paused state was not active; no debugger enhancer hints were used.');
        return [];
      }
      const hints = await this.deps.debuggerEvidenceCorrelator.correlatePausedState({ maxHints: 6, targetUrl });
      if (hints.length > 0) {
        notes.push(`Debugger enhancer contributed ${hints.length} hint(s); these hints did not override hook/replay/boundary evidence.`);
      }
      return hints;
    } catch {
      notes.push('Debugger enhancer evidence was unavailable and was skipped.');
      return [];
    }
  }

  private resolveTargetName(inputTarget: string | undefined, focus: Focus, evidence: FlowEvidence): string {
    const focusedName = focus.mode === 'helper'
      ? focus.helperName
      : focus.mode === 'request-field'
        ? focus.fieldName
        : undefined;
    return firstNonEmpty([
      inputTarget,
      focusedName,
      evidence.helperBoundary?.helperName,
      evidence.dependencyWindow?.targetName,
      evidence.compareAnchor?.selected?.path,
      evidence.compareAnchor?.selected?.label,
      evidence.patchPreflight?.selected?.target,
      evidence.rebuildContext?.usedCompareAnchor?.label,
      evidence.rebuildContext?.usedBoundaryFixture?.targetName,
      evidence.fixture?.targetName,
      evidence.probePlan?.targetName,
      evidence.patchHints?.targetName,
      evidence.scenarioAnalysis?.priorityTargets[0]?.target,
      'flow-target'
    ]);
  }

  private resolveScenario(evidence: FlowEvidence): string | undefined {
    return firstNonEmptyOptional([
      evidence.dependencyWindow?.scenario,
      evidence.fixture?.scenario,
      evidence.probePlan?.scenario,
      evidence.patchHints?.scenario,
      evidence.scenarioWorkflow?.preset.scenario,
      evidence.scenarioAnalysis?.scenario,
      evidence.replayCapture?.preset.scenario
    ]);
  }

  private resolveFiles(evidence: FlowEvidence, source: 'runtime-last' | 'task-artifact'): string[] {
    const files = uniqueStrings([
      evidence.helperBoundary?.file,
      ...(evidence.dependencyWindow?.files ?? []),
      ...(source === 'runtime-last'
        ? this.deps.codeCollector.getTopPriorityFiles(DEFAULT_AST_TOP_FILES).files.map((file) => file.url)
        : [])
    ].filter((value): value is string => Boolean(value)));

    return files.slice(0, 12);
  }

  private resolveHelperNames(focus: Focus, evidence: FlowEvidence, targetName: string): string[] {
    const names = [
      focus.mode === 'helper' ? focus.helperName : undefined,
      focus.mode === 'all' ? focus.helperName : undefined,
      evidence.helperBoundary?.helperName,
      evidence.dependencyWindow?.targetKind === 'helper' ? evidence.dependencyWindow.targetName : undefined,
      evidence.fixture?.targetName,
      evidence.scenarioWorkflow?.helperResult?.helpers[0]?.name,
      ...((evidence.scenarioWorkflow?.helperResult?.helpers ?? []).map((helper) => helper.name)),
      ...((evidence.scenarioAnalysis?.priorityTargets ?? [])
        .filter((target) => target.kind === 'helper' || target.kind === 'function')
        .map((target) => target.target)),
      focus.mode === 'request-field' ? undefined : targetName
    ];

    return uniqueStrings(names.filter((value): value is string => Boolean(value)))
      .filter((name) => isSymbolLike(name))
      .slice(0, 12);
  }

  private resolveFieldNames(focus: Focus, evidence: FlowEvidence): string[] {
    const values = [
      focus.mode === 'request-field' ? focus.fieldName : undefined,
      focus.mode === 'all' ? focus.fieldName : undefined,
      evidence.compareAnchor?.selected?.path,
      evidence.compareAnchor?.selected?.label,
      evidence.patchPreflight?.selected?.target,
      evidence.rebuildContext?.usedCompareAnchor?.label,
      evidence.rebuildContext?.usedPatchPreflight?.target,
      ...((evidence.helperBoundary?.inputs ?? []).map((input) => input.name)),
      ...((evidence.helperBoundary?.outputs ?? []).map((output) => output.name)),
      ...((evidence.dependencyWindow?.inputs ?? []).map((input) => input.name)),
      ...((evidence.dependencyWindow?.outputs ?? []).map((output) => output.name)),
      ...((evidence.fixture?.inputs ?? []).map((input) => input.name)),
      ...((evidence.fixture?.expectedOutputs ?? []).map((output) => output.name)),
      ...((evidence.rebuildContext?.expectedOutputs ?? []).map((output) => output.name)),
      ...((evidence.rebuildContext?.preservedInputs ?? []).map((input) => input.name)),
      ...((evidence.patchHints?.hints ?? []).flatMap((hint) => [hint.targetName, hint.focus])),
      ...((evidence.scenarioAnalysis?.indicators ?? [])
        .filter((indicator) => indicator.type === 'param' || indicator.type === 'header' || indicator.type === 'body-field')
        .map((indicator) => indicator.value)),
      ...((evidence.scenarioAnalysis?.suspiciousRequests ?? []).flatMap((request) => request.indicators)),
      ...((evidence.scenarioWorkflow?.tokenTrace?.members ?? []).map((member) => member.name)),
      ...FIELD_KEYWORDS
    ];

    return uniqueStrings(values.filter((value): value is string => Boolean(value)).flatMap(extractFieldNames))
      .slice(0, 30);
  }

  private addEvidenceSeeds(builder: ReasoningGraphBuilder, evidence: FlowEvidence, targetName: string): void {
    const targetNode = builder.addNode({
      confidence: 0.55,
      kind: 'unknown',
      name: targetName,
      reason: 'Resolved target-chain seed for flow reasoning.'
    });

    if (evidence.helperBoundary) {
      const helperNode = builder.addNode({
        confidence: evidence.helperBoundary.confidence,
        file: evidence.helperBoundary.file,
        kind: 'function',
        name: evidence.helperBoundary.helperName,
        reason: 'Latest helper boundary identifies this helper as target-chain evidence.'
      });
      builder.addEdge({
        confidence: 0.72,
        from: targetNode,
        reason: 'Flow target was resolved from helper boundary evidence.',
        relation: 'calls',
        to: helperNode
      });
      for (const output of evidence.helperBoundary.outputs.slice(0, 8)) {
        const outputNode = builder.addNode({
          confidence: output.confidence,
          file: evidence.helperBoundary.file,
          kind: output.target === 'return' ? 'return-consumer' : 'request-binder',
          name: output.name,
          reason: `Helper boundary output (${output.target}): ${output.reason}`
        });
        builder.helperConsumers.push(output.name);
        builder.addEdge({
          confidence: output.confidence,
          from: helperNode,
          reason: `Helper output ${output.name} is documented by boundary evidence.`,
          relation: output.target === 'return' ? 'returns-to' : 'binds-field',
          to: outputNode
        });
      }
    }

    if (evidence.dependencyWindow) {
      const windowNode = builder.addNode({
        confidence: 0.72,
        kind: evidence.dependencyWindow.targetKind === 'helper' ? 'function' : 'unknown',
        name: evidence.dependencyWindow.targetName,
        reason: 'Latest dependency window provides the smallest current code window for this target.'
      });
      builder.addEdge({
        confidence: 0.68,
        from: targetNode,
        reason: 'Dependency window target contributes flow boundary context.',
        relation: 'calls',
        to: windowNode
      });
      for (const output of evidence.dependencyWindow.outputs.slice(0, 10)) {
        const outputNode = builder.addNode({
          confidence: output.confidence,
          kind: output.target === 'return' ? 'return-consumer' : 'request-binder',
          name: output.name,
          reason: `Dependency window output (${output.target}): ${output.reason}`
        });
        if (output.target === 'return') {
          builder.helperConsumers.push(output.name);
        } else {
          builder.requestFieldBindings.push(output.name);
        }
        builder.addEdge({
          confidence: output.confidence,
          from: windowNode,
          reason: 'Dependency window output participates in the target chain.',
          relation: output.target === 'return' ? 'returns-to' : 'binds-field',
          to: outputNode
        });
      }
    }

    const anchor = evidence.compareAnchor?.selected;
    if (anchor) {
      const anchorNode = builder.addNode({
        confidence: anchor.confidence,
        kind: anchor.kind === 'helper-return' ? 'return-consumer' : 'request-binder',
        name: anchor.path ?? anchor.label,
        reason: `Compare anchor selected ${anchor.label}: ${anchor.reason}`
      });
      builder.requestFieldBindings.push(anchor.path ?? anchor.label);
      builder.addEdge({
        confidence: anchor.confidence,
        from: targetNode,
        reason: 'Compare anchor marks the first explainable divergence target for flow reasoning.',
        relation: 'binds-field',
        to: anchorNode
      });
    }

    const preflight = evidence.patchPreflight?.selected;
    if (preflight) {
      const preflightNode = builder.addNode({
        confidence: preflight.confidence,
        kind: preflight.surface === 'helper-window' ? 'return-consumer' : 'request-binder',
        name: preflight.target,
        reason: `Patch preflight selected ${preflight.surface}: ${preflight.reason}`
      });
      builder.addEdge({
        confidence: preflight.confidence,
        from: targetNode,
        reason: 'Patch preflight focus narrows the flow reasoning target.',
        relation: preflight.surface === 'helper-window' ? 'returns-to' : 'binds-field',
        to: preflightNode
      });
    }

    if (evidence.rebuildContext) {
      for (const output of evidence.rebuildContext.expectedOutputs.slice(0, 8)) {
        const outputNode = builder.addNode({
          confidence: 0.66,
          kind: output.target === 'helper-return' ? 'return-consumer' : 'request-binder',
          name: output.name,
          reason: `Rebuild context expected output (${output.target}): ${output.reason}`
        });
        builder.addEdge({
          confidence: 0.66,
          from: targetNode,
          reason: 'Rebuild context expected output should remain attached to flow reasoning.',
          relation: output.target === 'helper-return' ? 'returns-to' : 'binds-field',
          to: outputNode
        });
      }
    }

    for (const target of (evidence.scenarioAnalysis?.priorityTargets ?? []).slice(0, 8)) {
      builder.addNode({
        confidence: clamp01(target.score / 100),
        kind: target.kind === 'sink' ? 'sink-adjacent' : target.kind === 'param' ? 'request-binder' : 'function',
        name: target.target,
        reason: `Scenario priority target (${target.kind}): ${target.reasons.join('; ')}`
      });
    }
  }

  private traceHelperConsumersFromAst(
    builder: ReasoningGraphBuilder,
    astIndex: LightweightAstIndex,
    helpers: readonly string[],
    fields: readonly string[]
  ): void {
    for (const helper of helpers) {
      const helperNode = builder.addNode({
        confidence: 0.7,
        kind: 'function',
        name: helper,
        reason: 'Helper seed used for return consumer tracing.'
      });

      for (const assignment of astIndex.assignments.filter((item) => containsSymbol(item.valuePreview ?? '', helper)).slice(0, 12)) {
        const consumerName = locatedName(assignment.target, assignment);
        const consumerNode = builder.addNode({
          confidence: 0.84,
          file: assignment.file,
          kind: 'return-consumer',
          lineNumber: assignment.lineNumber,
          name: consumerName,
          reason: `Helper return appears assigned to ${assignment.target}.`
        });
        builder.helperConsumers.push(assignment.target);
        builder.addEdge({
          confidence: 0.84,
          from: helperNode,
          reason: `Assignment RHS references helper ${helper}.`,
          relation: 'returns-to',
          to: consumerNode
        });
        if (fieldLike(assignment.target, fields)) {
          builder.requestFieldBindings.push(consumerName);
        }
      }

      for (const write of astIndex.propertyWrites.filter((item) => containsSymbol(item.valuePreview ?? '', helper)).slice(0, 12)) {
        const target = propertyWriteName(write);
        const node = builder.addNode({
          confidence: 0.82,
          file: write.file,
          kind: fieldLike(target, fields) ? 'request-binder' : 'return-consumer',
          lineNumber: write.lineNumber,
          name: locatedName(target, write),
          reason: `Helper return is written into property ${target}.`
        });
        builder.helperConsumers.push(target);
        if (fieldLike(target, fields)) {
          builder.requestFieldBindings.push(node);
        }
        builder.addEdge({
          confidence: 0.82,
          from: helperNode,
          reason: `Property write value references helper ${helper}.`,
          relation: fieldLike(target, fields) ? 'binds-field' : 'returns-to',
          to: node
        });
      }

      for (const call of astIndex.calls.filter((item) => item.argsPreview.some((argument) => containsSymbol(argument, helper))).slice(0, 12)) {
        const callNode = builder.addNode({
          confidence: 0.76,
          file: call.file,
          kind: 'callsite',
          lineNumber: call.lineNumber,
          name: locatedName(call.callee, call),
          reason: `Helper ${helper} is passed into ${call.callee}.`
        });
        builder.helperConsumers.push(call.callee);
        builder.addEdge({
          confidence: 0.76,
          from: helperNode,
          reason: `Call arguments reference helper ${helper}.`,
          relation: 'passed-to',
          to: callNode
        });
      }
    }
  }

  private traceRequestFieldBindingsFromAst(
    builder: ReasoningGraphBuilder,
    astIndex: LightweightAstIndex,
    fields: readonly string[]
  ): void {
    const binders = [
      ...astIndex.propertyWrites
        .filter((write) => fieldLike(propertyWriteName(write), fields) || fieldLike(write.valuePreview ?? '', fields))
        .map((write) => ({
          confidence: 0.82,
          file: write.file,
          kind: 'request-binder' as const,
          lineNumber: write.lineNumber,
          name: locatedName(propertyWriteName(write), write),
          reason: `${classifyRequestBinding(propertyWriteName(write))} property write binds a request-field-like value.`
        })),
      ...astIndex.assignments
        .filter((assignment) => fieldLike(assignment.target, fields) || fieldLike(assignment.valuePreview ?? '', fields))
        .map((assignment) => ({
          confidence: 0.74,
          file: assignment.file,
          kind: 'request-binder' as const,
          lineNumber: assignment.lineNumber,
          name: locatedName(assignment.target, assignment),
          reason: `${classifyRequestBinding(assignment.target)} assignment is field-like by target/value.`
        })),
      ...astIndex.calls
        .filter((call) => REQUEST_BINDER_PATTERN.test(call.callee) && call.argsPreview.some((argument) => fieldLike(argument, fields)))
        .map((call) => ({
          confidence: 0.78,
          file: call.file,
          kind: 'request-binder' as const,
          lineNumber: call.lineNumber,
          name: locatedName(call.callee, call),
          reason: `Request binder-like call ${call.callee} receives a field-like argument.`
        }))
    ];

    for (const binder of dedupeBy(binders, (item) => item.name).slice(0, 20)) {
      const node = builder.addNode(binder);
      builder.requestFieldBindings.push(node);
    }
  }

  private traceSinkAdjacentBindingsFromAst(
    builder: ReasoningGraphBuilder,
    astIndex: LightweightAstIndex,
    fields: readonly string[]
  ): void {
    const sinkCalls = astIndex.calls.filter((call) => SINK_PATTERN.test(call.callee)).slice(0, 20);

    for (const sink of sinkCalls) {
      const sinkNode = builder.addNode({
        confidence: 0.76,
        file: sink.file,
        kind: 'sink-adjacent',
        lineNumber: sink.lineNumber,
        name: locatedName(sink.callee, sink),
        reason: 'Request sink-like callsite from lightweight AST index.'
      });
      builder.sinkAdjacentBindings.push(sinkNode);

      const nearbyAssignments = astIndex.assignments.filter((assignment) => isNearBefore(assignment, sink, 6)).slice(0, 8);
      for (const assignment of nearbyAssignments) {
        const node = builder.addNode({
          confidence: fieldLike(assignment.target, fields) ? 0.78 : 0.62,
          file: assignment.file,
          kind: fieldLike(assignment.target, fields) ? 'request-binder' : 'assignment',
          lineNumber: assignment.lineNumber,
          name: locatedName(assignment.target, assignment),
          reason: `Assignment is within ${sink.lineNumber - assignment.lineNumber} line(s) before request sink ${sink.callee}.`
        });
        builder.sinkAdjacentBindings.push(node);
        if (fieldLike(assignment.target, fields) || fieldLike(assignment.valuePreview ?? '', fields)) {
          builder.requestFieldBindings.push(node);
        }
        builder.addEdge({
          confidence: fieldLike(assignment.target, fields) ? 0.78 : 0.62,
          from: node,
          reason: 'Assignment is immediately before the request sink and is a likely final binding point.',
          relation: 'adjacent-to-sink',
          to: sinkNode
        });
      }

      const nearbyWrites = astIndex.propertyWrites.filter((write) => isNearBefore(write, sink, 6)).slice(0, 8);
      for (const write of nearbyWrites) {
        const name = propertyWriteName(write);
        const node = builder.addNode({
          confidence: fieldLike(name, fields) ? 0.82 : 0.66,
          file: write.file,
          kind: fieldLike(name, fields) ? 'request-binder' : 'property-write',
          lineNumber: write.lineNumber,
          name: locatedName(name, write),
          reason: `Property write is within ${sink.lineNumber - write.lineNumber} line(s) before request sink ${sink.callee}.`
        });
        builder.sinkAdjacentBindings.push(node);
        if (fieldLike(name, fields) || fieldLike(write.valuePreview ?? '', fields)) {
          builder.requestFieldBindings.push(node);
        }
        builder.addEdge({
          confidence: fieldLike(name, fields) ? 0.82 : 0.66,
          from: node,
          reason: 'Property write is adjacent to request sink and can explain the final binder.',
          relation: 'adjacent-to-sink',
          to: sinkNode
        });
      }
    }
  }

  private addDebuggerEnhancerNodes(builder: ReasoningGraphBuilder, hints: readonly DebuggerCorrelationHint[]): void {
    for (const hint of hints.slice(0, 6)) {
      builder.addNode({
        confidence: Math.min(0.72, hint.confidence),
        kind: hint.kind === 'sink' ? 'sink-adjacent' : hint.kind === 'scenario-target' ? 'function' : 'unknown',
        name: hint.value,
        reason: `Debugger enhancer hint (${hint.kind}): ${hint.reason}`
      });
    }
  }

  private buildRebuildHints(
    helperConsumers: readonly string[],
    requestFieldBindings: readonly string[],
    sinkAdjacentBindings: readonly string[]
  ): string[] {
    const hints = [
      helperConsumers[0]
        ? `Carry helper consumer ${helperConsumers[0]} as a rebuild expected output before broadening the fixture.`
        : 'Run trace_helper_consumers if rebuild still lacks a concrete helper output consumer.',
      requestFieldBindings[0]
        ? `Preserve request field binder ${requestFieldBindings[0]} as rebuild context provenance.`
        : 'Run trace_request_field_binding before expanding rebuild inputs beyond target-chain fields.',
      sinkAdjacentBindings[0]
        ? `Use sink-adjacent binding ${sinkAdjacentBindings[0]} as the smallest rebuild-side request assembly checkpoint.`
        : 'Keep rebuild comparison anchored to boundary/window evidence until a sink-adjacent binder is found.'
    ];

    return uniqueStrings(hints, 12);
  }

  private buildPatchHints(
    helperConsumers: readonly string[],
    requestFieldBindings: readonly string[],
    sinkAdjacentBindings: readonly string[]
  ): string[] {
    const hints = [
      requestFieldBindings[0]
        ? `Patch preflight should audit request binder ${requestFieldBindings[0]} before env-shim or whole-request changes.`
        : 'Patch preflight should not fall back to broad request mutation without a field binder.',
      helperConsumers[0]
        ? `If helper output mismatches, inspect consumer ${helperConsumers[0]} before changing the helper implementation.`
        : 'If helper return remains unexplained, collect another hook/replay sample before patching.',
      sinkAdjacentBindings[0]
        ? `For sink-adjacent failures, patch the final assignment/call near ${sinkAdjacentBindings[0]} first.`
        : 'Stop before patching sink code broadly unless a nearby assignment/property write is identified.'
    ];

    return uniqueStrings(hints, 12);
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

class ReasoningGraphBuilder {
  readonly helperConsumers: string[] = [];
  readonly requestFieldBindings: string[] = [];
  readonly sinkAdjacentBindings: string[] = [];
  private readonly nodes = new Map<string, FlowReasoningNode>();
  private readonly edges: FlowReasoningEdge[] = [];

  addNode(node: FlowReasoningNode): string {
    const key = nodeKey(node);
    const existing = this.nodes.get(key);
    if (existing) {
      this.nodes.set(key, {
        ...existing,
        confidence: Math.max(existing.confidence, node.confidence),
        reason: existing.reason === node.reason ? existing.reason : `${existing.reason} ${node.reason}`.trim()
      });
      return existing.name;
    }

    const normalized = {
      ...node,
      confidence: clamp01(node.confidence)
    };
    this.nodes.set(key, normalized);
    return normalized.name;
  }

  addEdge(edge: FlowReasoningEdge): void {
    const normalized = {
      ...edge,
      confidence: clamp01(edge.confidence)
    };
    const key = `${normalized.from}->${normalized.relation}->${normalized.to}`;
    if (this.edges.some((item) => `${item.from}->${item.relation}->${item.to}` === key)) {
      return;
    }
    this.edges.push(normalized);
  }

  finalize(maxNodes: number, maxEdges: number): { nodes: FlowReasoningNode[]; edges: FlowReasoningEdge[] } {
    const nodes = Array.from(this.nodes.values()).slice(0, maxNodes);
    const nodeNames = new Set(nodes.map((node) => node.name));
    const edges = this.edges
      .filter((edge) => nodeNames.has(edge.from) && nodeNames.has(edge.to))
      .slice(0, maxEdges);

    return {
      edges,
      nodes
    };
  }
}

function emptyAstIndex(files: readonly string[], notes: readonly string[]): LightweightAstIndex {
  return {
    assignments: [],
    calls: [],
    files: [...files],
    functions: [],
    notes: [...notes],
    propertyReads: [],
    propertyWrites: []
  };
}

function makeResultId(targetName: string): string {
  const safe = targetName.replace(/[^A-Za-z0-9_$.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'flow';
  return `${safe}-${Date.now().toString(36)}`;
}

function nodeKey(node: FlowReasoningNode): string {
  return `${node.kind}:${node.name}:${node.file ?? ''}:${node.lineNumber ?? ''}`;
}

function locatedName(base: string, entry: { file?: string; lineNumber?: number }): string {
  if (entry.file && entry.lineNumber) {
    return `${base} @ ${entry.file}:${entry.lineNumber}`;
  }
  return base;
}

function propertyWriteName(write: AstPropertyWriteEntry): string {
  return write.objectName ? `${write.objectName}.${write.property}` : write.property;
}

function isNearBefore(left: { file: string; lineNumber: number }, right: { file: string; lineNumber: number }, distance: number): boolean {
  return left.file === right.file && left.lineNumber <= right.lineNumber && right.lineNumber - left.lineNumber <= distance;
}

function containsSymbol(value: string, symbol: string): boolean {
  const normalizedValue = normalizeForMatch(value);
  const normalizedSymbol = normalizeForMatch(symbol);
  if (!normalizedValue || !normalizedSymbol) {
    return false;
  }
  const escaped = escapeRegExp(normalizedSymbol);
  const bounded = new RegExp(`(^|[^A-Za-z0-9_$])${escaped}($|[^A-Za-z0-9_$])`, 'i');
  return normalizedValue === normalizedSymbol ||
    normalizedValue.endsWith(`.${normalizedSymbol}`) ||
    bounded.test(normalizedValue) ||
    normalizedValue.includes(`.${normalizedSymbol}(`) ||
    normalizedValue.includes(`${normalizedSymbol}(`);
}

function fieldLike(value: string, fields: readonly string[]): boolean {
  if (FIELD_PATTERN.test(value)) {
    return true;
  }

  const normalized = normalizeForMatch(value);
  if (!normalized) {
    return false;
  }
  return fields.some((field) => {
    const normalizedField = normalizeForMatch(field);
    return Boolean(
      normalizedField &&
        (normalized === normalizedField ||
          normalized.includes(normalizedField) ||
          normalizedField.includes(normalized))
    );
  });
}

function classifyRequestBinding(value: string): string {
  const lower = value.toLowerCase();
  if (/header|authorization|bearer|x-/.test(lower)) {
    return 'header';
  }
  if (/body|data|payload|json|form/.test(lower)) {
    return 'body';
  }
  if (/query|param|search|url/.test(lower)) {
    return 'query';
  }
  return 'request-field';
}

function extractFieldNames(value: string): string[] {
  const raw = value.trim();
  const tokens = raw.match(/[A-Za-z_$][A-Za-z0-9_$-]{1,64}/g) ?? [];
  const candidates = [raw, ...tokens]
    .map((item) => item.replace(/^['"`]|['"`]$/g, '').trim())
    .filter((item) => item.length > 0 && item.length <= 80)
    .filter((item) => FIELD_PATTERN.test(item) || FIELD_KEYWORDS.some((keyword) => normalizeForMatch(item).includes(normalizeForMatch(keyword))));
  return uniqueStrings(candidates, 8);
}

function isSymbolLike(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 &&
    trimmed.length <= 120 &&
    !/^https?:\/\//i.test(trimmed) &&
    !/\s/.test(trimmed) &&
    /[A-Za-z_$]/.test(trimmed);
}

function normalizeForMatch(value: string): string {
  return value
    .replace(/['"`]/g, '')
    .replace(/[()[\]{};,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstNonEmpty(values: ReadonlyArray<string | undefined | null>): string {
  return firstNonEmptyOptional(values) ?? 'flow-target';
}

function firstNonEmptyOptional(values: ReadonlyArray<string | undefined | null>): string | undefined {
  return values.find((value): value is string => Boolean(value && value.trim().length > 0));
}

function clampInt(value: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.max(min, Math.min(max, normalized));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function uniqueStrings(values: readonly string[], limit = Number.POSITIVE_INFINITY): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function dedupeBy<T>(items: readonly T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFn(item).toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}
