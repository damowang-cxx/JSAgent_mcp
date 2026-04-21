import { AppError } from '../core/errors.js';
import type { StoredDebuggerInspectionSnapshot } from '../debugger/types.js';
import type { FixtureCandidateRegistry } from '../fixture/FixtureCandidateRegistry.js';
import type { StoredFixtureCandidate } from '../fixture/types.js';
import type { HelperBoundaryRegistry } from '../helper/HelperBoundaryRegistry.js';
import type { StoredHelperBoundary } from '../helper/types.js';
import type { ScenarioPatchHintRegistry } from '../patch/ScenarioPatchHintRegistry.js';
import type { StoredScenarioPatchHintSet } from '../patch/types.scenario.js';
import type { ProbePlanRegistry } from '../probe/ProbePlanRegistry.js';
import type { StoredProbePlan } from '../probe/types.js';
import type { ReplayRecipeRunner } from '../replay/ReplayRecipeRunner.js';
import type { ReplayRecipeResult } from '../replay/types.js';
import type { ScenarioWorkflowRunner } from '../scenario/ScenarioWorkflowRunner.js';
import type { SignatureScenarioAnalyzer } from '../scenario/SignatureScenarioAnalyzer.js';
import type { ScenarioAnalysisResult, ScenarioWorkflowResult } from '../scenario/types.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { DebuggerEvidenceCorrelator } from '../debugger/DebuggerEvidenceCorrelator.js';
import type { DebuggerSessionManager } from '../debugger/DebuggerSessionManager.js';
import type { RebuildWorkflowRunner } from '../workflow/RebuildWorkflowRunner.js';
import type { RebuildWorkflowResult } from '../rebuild/types.js';
import type { DependencyWindowRegistry } from '../window/DependencyWindowRegistry.js';
import type { StoredDependencyWindow } from '../window/types.js';
import type {
  CompareAnchor,
  CompareAnchorEvidenceSource,
  CompareAnchorKind,
  CompareAnchorSelectionResult,
  CompareStrategy
} from './types.js';

interface CompareAnchorSelectorDeps {
  signatureScenarioAnalyzer: SignatureScenarioAnalyzer;
  replayRecipeRunner: ReplayRecipeRunner;
  scenarioWorkflowRunner: ScenarioWorkflowRunner;
  helperBoundaryRegistry: HelperBoundaryRegistry;
  dependencyWindowRegistry: DependencyWindowRegistry;
  probePlanRegistry: ProbePlanRegistry;
  fixtureCandidateRegistry: FixtureCandidateRegistry;
  scenarioPatchHintRegistry: ScenarioPatchHintRegistry;
  debuggerEvidenceCorrelator: DebuggerEvidenceCorrelator;
  debuggerSessionManager: DebuggerSessionManager;
  rebuildWorkflowRunner: RebuildWorkflowRunner;
  evidenceStore: EvidenceStore;
  taskManifestManager: TaskManifestManager;
}

interface CompareAnchorContext {
  scenario?: ScenarioWorkflowResult | null;
  scenarioAnalysis?: ScenarioAnalysisResult | null;
  capture?: ReplayRecipeResult | null;
  helperBoundary?: StoredHelperBoundary['result'] | null;
  dependencyWindow?: StoredDependencyWindow['result'] | null;
  probePlan?: StoredProbePlan['result'] | null;
  fixture?: StoredFixtureCandidate['result'] | null;
  patchHints?: StoredScenarioPatchHintSet['result'] | null;
  debuggerInspection?: StoredDebuggerInspectionSnapshot | null;
  rebuild?: RebuildWorkflowResult | null;
  notes: string[];
}

const DEFAULT_MAX_CANDIDATES = 10;
const SIGNAL_PATTERN = /\b(sign|signature|x-?sign|token|auth|authorization|nonce|challenge|verify|captcha|fingerprint|timestamp|ts|hash|hmac|cipher|enc)\b/i;

export class CompareAnchorSelector {
  constructor(private readonly deps: CompareAnchorSelectorDeps) {}

  async select(options: {
    targetUrl?: string;
    maxCandidates?: number;
    taskId?: string;
    source?: 'runtime-last' | 'task-artifact';
  } = {}): Promise<CompareAnchorSelectionResult> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'select_compare_anchor with source=task-artifact requires taskId.');
    }

    const maxCandidates = Math.max(1, Math.min(30, Math.floor(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES)));
    const context = options.source === 'task-artifact'
      ? await this.readTaskContext(options.taskId as string)
      : await this.readRuntimeContext(options.targetUrl, maxCandidates);

    const candidates = this.buildCandidates(context)
      .sort((left, right) => right.confidence - left.confidence || kindPriority(left.kind) - kindPriority(right.kind))
      .slice(0, maxCandidates);
    const selected = candidates[0] ?? null;
    const notes = [
      ...context.notes,
      selected
        ? `Selected ${selected.kind} anchor because it is the smallest evidence-backed compare target currently available.`
        : 'No compare anchor was selected because no helper/window/fixture/probe/scenario/debugger/rebuild evidence exposed a concrete compare target.'
    ];

    return {
      candidates,
      nextActions: this.buildNextActions(selected),
      notes,
      selected,
      stopIf: this.buildStopIf(selected)
    };
  }

  private async readRuntimeContext(targetUrl: string | undefined, maxCandidates: number): Promise<CompareAnchorContext> {
    const notes: string[] = [];
    const scenario = this.deps.scenarioWorkflowRunner.getLastScenarioWorkflowResult();
    const capture = this.deps.replayRecipeRunner.getLastReplayRecipeResult();
    let scenarioAnalysis = capture?.scenarioResult ?? scenario?.analysis ?? null;

    if (!scenarioAnalysis) {
      try {
        scenarioAnalysis = await this.deps.signatureScenarioAnalyzer.analyze({
          targetUrl,
          topN: maxCandidates
        });
        notes.push('No latest scenario/capture analysis was cached; ran signature scenario analyzer against current evidence.');
      } catch {
        notes.push('No latest scenario/capture analysis is available for compare anchor selection.');
      }
    }

    let debuggerInspection: StoredDebuggerInspectionSnapshot | null = null;
    if (this.deps.debuggerSessionManager.isPaused()) {
      const hints = await this.deps.debuggerEvidenceCorrelator.correlatePausedState({ targetUrl });
      debuggerInspection = {
        callFrames: this.deps.debuggerSessionManager.getCallFrames(),
        correlations: hints,
        createdAt: new Date().toISOString(),
        notes: ['Runtime debugger inspection synthesized from current paused state for compare anchor selection.']
      };
    }

    return {
      capture,
      debuggerInspection,
      dependencyWindow: this.deps.dependencyWindowRegistry.getLast(),
      fixture: this.deps.fixtureCandidateRegistry.getLast(),
      helperBoundary: this.deps.helperBoundaryRegistry.getLast(),
      notes,
      patchHints: this.deps.scenarioPatchHintRegistry.getLast(),
      probePlan: this.deps.probePlanRegistry.getLast(),
      rebuild: this.deps.rebuildWorkflowRunner.getLastRebuildWorkflowResult(),
      scenario,
      scenarioAnalysis
    };
  }

  private async readTaskContext(taskId: string): Promise<CompareAnchorContext> {
    await this.deps.taskManifestManager.ensureTask(taskId);
    const notes: string[] = [`Task artifact source enabled for ${taskId}; runtime caches were not used.`];
    const [scenario, scenarioAnalysis, capture, helperBoundary, dependencyWindow, probePlan, fixture, patchHints, debuggerInspection, rebuild] = await Promise.all([
      this.readSnapshot<ScenarioWorkflowResult>(taskId, 'scenario/workflow'),
      this.readSnapshot<ScenarioAnalysisResult>(taskId, 'scenario/analysis'),
      this.readSnapshot<ReplayRecipeResult>(taskId, 'scenario/capture/result'),
      this.readStoredResult<StoredHelperBoundary>(taskId, 'helper-boundary/latest'),
      this.readStoredResult<StoredDependencyWindow>(taskId, 'dependency-window/latest'),
      this.readStoredResult<StoredProbePlan>(taskId, 'scenario-probe/latest'),
      this.readStoredResult<StoredFixtureCandidate>(taskId, 'boundary-fixture/latest'),
      this.readStoredResult<StoredScenarioPatchHintSet>(taskId, 'scenario-patch-hints/latest'),
      this.readSnapshot<StoredDebuggerInspectionSnapshot>(taskId, 'debugger/inspection-last'),
      this.readSnapshot<RebuildWorkflowResult>(taskId, 'rebuild-workflow')
    ]);

    let rebuildResult = rebuild;
    if (!rebuildResult) {
      const divergence = await this.readSnapshot<RebuildWorkflowResult['comparison']>(taskId, 'divergence');
      if (divergence) {
        rebuildResult = {
          comparison: divergence
        } as RebuildWorkflowResult;
      }
    }

    return {
      capture,
      debuggerInspection,
      dependencyWindow,
      fixture,
      helperBoundary,
      notes,
      patchHints,
      probePlan,
      rebuild: rebuildResult,
      scenario,
      scenarioAnalysis: scenarioAnalysis ?? capture?.scenarioResult ?? scenario?.analysis ?? null
    };
  }

  private buildCandidates(context: CompareAnchorContext): CompareAnchor[] {
    const candidates: CompareAnchor[] = [];

    for (const output of context.helperBoundary?.outputs ?? []) {
      candidates.push(makeAnchor({
        confidence: clamp(0.68 + output.confidence * 0.18 + targetBoost(output.name)),
        expectedOrigin: `helper-boundary:${context.helperBoundary?.helperName ?? 'helper'}`,
        kind: kindFromTarget(output.target),
        label: output.target === 'return' ? `${context.helperBoundary?.helperName ?? 'helper'} return` : output.name,
        path: pathFor(output.target, output.name),
        reason: `Helper boundary output ${output.name} -> ${output.target} is a direct boundary result: ${output.reason}`,
        sourceEvidence: ['helper-boundary'],
        strategy: strategyFor(output.name, output.target),
        notes: ['Prefer this over whole-request diff because it checks the helper output boundary first.']
      }));
    }

    for (const output of context.fixture?.expectedOutputs ?? []) {
      candidates.push(makeAnchor({
        confidence: clamp(0.72 + output.confidence * 0.18 + targetBoost(output.name)),
        expectedOrigin: `boundary-fixture:${context.fixture?.fixtureId ?? context.fixture?.targetName ?? 'fixture'}`,
        kind: kindFromFixtureTarget(output.target),
        label: output.name,
        path: pathFor(output.target, output.name),
        reason: `Boundary fixture expected output ${output.name} -> ${output.target} was generated as a smallest useful fixture compare target: ${output.reason}`,
        sourceEvidence: ['boundary-fixture'],
        strategy: strategyFor(output.name, output.target),
        notes: ['Fixture expected outputs are already narrowed for rebuild probes.']
      }));
    }

    for (const output of context.dependencyWindow?.outputs ?? []) {
      candidates.push(makeAnchor({
        confidence: clamp(0.62 + output.confidence * 0.16 + targetBoost(output.name)),
        expectedOrigin: `dependency-window:${context.dependencyWindow?.windowId ?? context.dependencyWindow?.targetName ?? 'window'}`,
        kind: kindFromTarget(output.target),
        label: output.name,
        path: pathFor(output.target, output.name),
        reason: `Dependency window output ${output.name} -> ${output.target} marks the smallest probe-ready output: ${output.reason}`,
        sourceEvidence: ['dependency-window'],
        strategy: strategyFor(output.name, output.target),
        notes: ['Use this before expanding to a full helper or request diff.']
      }));
    }

    for (const check of context.probePlan?.validationChecks ?? []) {
      const label = extractSignalLabel(check) ?? check.slice(0, 80);
      candidates.push(makeAnchor({
        confidence: clamp(0.58 + targetBoost(label)),
        expectedOrigin: `probe-plan:${context.probePlan?.planId ?? context.probePlan?.targetName ?? 'probe'}`,
        kind: kindFromText(check),
        label,
        path: pathFromText(check, label),
        reason: `Probe plan validation check explicitly calls out this compare target: ${check}`,
        sourceEvidence: ['probe-plan'],
        strategy: strategyFor(label, kindFromText(check)),
        notes: ['Probe validation checks are designed to confirm first helper/request divergence.']
      }));
    }

    for (const hint of context.patchHints?.hints ?? []) {
      if (hint.patchableSurface !== 'compare-anchor' && !/anchor|compare|header|body|field|return|sign|token|challenge/i.test(hint.focus)) {
        continue;
      }
      const label = extractSignalLabel(hint.focus) ?? hint.focus.slice(0, 80);
      candidates.push(makeAnchor({
        confidence: clamp(0.52 + hint.confidence * 0.22 + targetBoost(label)),
        expectedOrigin: `patch-hints:${context.patchHints?.setId ?? context.patchHints?.targetName ?? 'patch-hints'}`,
        kind: kindFromText(hint.focus),
        label,
        path: pathFromText(hint.focus, label),
        reason: `Scenario patch hints identify ${hint.focus} as an explainable first patch/compare focus: ${hint.why}`,
        sourceEvidence: ['patch-hints'],
        strategy: strategyFor(label, kindFromText(hint.focus)),
        notes: ['This anchor can keep patch iteration focused on the first explainable mismatch.']
      }));
    }

    for (const hint of context.debuggerInspection?.correlations ?? []) {
      const label = extractSignalLabel(hint.value) ?? hint.value.slice(0, 90);
      candidates.push(makeAnchor({
        confidence: clamp(0.44 + hint.confidence * 0.2 + targetBoost(label)),
        expectedOrigin: 'debugger/inspection-last',
        kind: hint.kind === 'request' ? 'request-level' : kindFromText(hint.value),
        label,
        path: pathFromText(hint.value, label),
        reason: `Debugger correlation hint (${hint.kind}) links paused evidence to this compare focus: ${hint.reason}`,
        sourceEvidence: ['debugger'],
        strategy: hint.kind === 'request' ? 'structured-subset' : strategyFor(label, kindFromText(hint.value)),
        notes: ['Debugger evidence is used as an enhancer, not as the only source of truth.']
      }));
    }

    for (const evaluation of context.debuggerInspection?.evaluations ?? []) {
      if (!evaluation.ok) {
        continue;
      }
      candidates.push(makeAnchor({
        confidence: 0.64,
        expectedOrigin: 'debugger/evaluate_on_call_frame',
        kind: 'helper-return',
        label: evaluation.preview ?? evaluation.resultType ?? 'debugger evaluation result',
        path: '$.helperReturn',
        reason: 'Debugger call-frame evaluation produced a concrete paused value that can be used as a focused helper-level compare anchor.',
        sourceEvidence: ['debugger'],
        strategy: evaluation.resultType?.includes('string') ? 'normalized-string' : 'exact',
        notes: ['Use this only after hook/boundary evidence needs paused local confirmation.']
      }));
    }

    const analysis = context.scenarioAnalysis;
    for (const indicator of analysis?.indicators ?? []) {
      if (!['param', 'header', 'body-field'].includes(indicator.type)) {
        continue;
      }
      candidates.push(makeAnchor({
        confidence: clamp(0.42 + indicator.confidence * 0.22 + targetBoost(indicator.value)),
        expectedOrigin: `scenario:${analysis?.scenario ?? 'unknown'}`,
        kind: indicator.type === 'header' ? 'header' : indicator.type === 'body-field' ? 'body-field' : 'request-field',
        label: indicator.value,
        path: pathFor(indicator.type, indicator.value),
        reason: `Scenario indicator ${indicator.value} came from ${indicator.type} evidence: ${indicator.reason}`,
        sourceEvidence: ['scenario'],
        strategy: strategyFor(indicator.value, indicator.type),
        notes: ['Scenario indicators are useful fallback anchors when no boundary/window output is available.']
      }));
    }

    for (const request of [
      ...(context.capture?.suspiciousRequests ?? []),
      ...(analysis?.suspiciousRequests ?? [])
    ].slice(0, 8)) {
      const label = request.indicators.find((value) => SIGNAL_PATTERN.test(value)) ?? normalizeRequestLabel(request.url);
      candidates.push(makeAnchor({
        confidence: clamp(0.34 + request.score / 180 + targetBoost(label)),
        expectedOrigin: `request:${request.method}`,
        kind: request.indicators.length > 0 ? 'request-field' : 'request-level',
        label,
        path: request.indicators.length > 0 ? pathFor('request-field', label) : '$.request',
        reason: `Suspicious request ${request.method} ${request.url} exposes indicators ${request.indicators.join(', ') || '(none)'}.`,
        sourceEvidence: context.capture ? ['capture', 'scenario'] : ['scenario'],
        strategy: request.indicators.length > 0 ? strategyFor(label, 'request-field') : 'structured-subset',
        notes: request.indicators.length > 0
          ? ['Compare only the named request field before comparing the whole request.']
          : ['Request-level fallback is only present because a concrete suspicious request exists.']
      }));
    }

    const divergence = context.rebuild?.comparison?.divergence;
    if (divergence?.path) {
      candidates.push(makeAnchor({
        confidence: divergence.severity === 'high' ? 0.6 : 0.5,
        expectedOrigin: 'rebuild/divergence',
        kind: kindFromText(divergence.path),
        label: divergence.path,
        path: divergence.path,
        reason: `Latest rebuild divergence points at ${divergence.path}: ${divergence.message}`,
        sourceEvidence: ['rebuild'],
        strategy: 'exact',
        notes: ['Rebuild divergence is consumed as evidence, but boundary/fixture anchors should outrank broad runtime errors.']
      }));
    }

    return mergeCandidates(candidates);
  }

  private buildNextActions(selected: CompareAnchor | null): string[] {
    if (!selected) {
      return [
        'Run run_capture_recipe, extract_helper_boundary, extract_dependency_window, and generate_boundary_fixture before selecting a compare anchor.',
        'If hooks cannot expose the value, use set_breakpoint_on_text and evaluate_on_call_frame to add debugger evidence.'
      ];
    }

    return [
      `Use ${selected.label} (${selected.kind}) as the first compare target with ${selected.compareStrategy} strategy.`,
      selected.kind === 'helper-return'
        ? 'Run rebuild probe around the helper boundary and compare helper return before expanding to request-level output.'
        : `Compare ${selected.path ?? selected.label} before comparing the whole request or full object.`,
      'Feed this anchor into the next compare_rebuild_result or patch preflight integration step once that layer is enabled.'
    ];
  }

  private buildStopIf(selected: CompareAnchor | null): string[] {
    if (!selected) {
      return [
        'Stop if no concrete helper output, request field, fixture expected output, debugger evaluation, or suspicious request evidence exists.',
        'Do not fall back to generic whole-object diff without first collecting focused evidence.'
      ];
    }

    return [
      `Stop expanding compare scope if ${selected.label} matches under ${selected.compareStrategy}.`,
      'Stop and collect focused hook/debugger evidence if this anchor cannot be observed in either browser or rebuild output.',
      'Do not compare whole request/response until this first explainable anchor is stable.'
    ];
  }

  private async readSnapshot<T>(taskId: string, name: string): Promise<T | null> {
    try {
      const value = await this.deps.evidenceStore.readSnapshot(taskId, name);
      return value ? value as T : null;
    } catch {
      return null;
    }
  }

  private async readStoredResult<T extends { result: unknown }>(taskId: string, name: string): Promise<T['result'] | null> {
    const snapshot = await this.readSnapshot<T>(taskId, name);
    return snapshot?.result ?? null;
  }
}

function makeAnchor(input: {
  kind: CompareAnchorKind;
  label: string;
  path?: string;
  sourceEvidence: CompareAnchorEvidenceSource[];
  confidence: number;
  reason: string;
  strategy: CompareStrategy;
  expectedOrigin?: string;
  notes?: string[];
}): CompareAnchor {
  const safeLabel = input.label.trim() || input.kind;
  return {
    anchorId: `${input.kind}:${stableId(safeLabel)}:${stableId(input.path ?? '')}`,
    compareStrategy: input.strategy,
    confidence: Number(clamp(input.confidence).toFixed(3)),
    expectedOrigin: input.expectedOrigin,
    kind: input.kind,
    label: safeLabel,
    notes: input.notes,
    path: input.path,
    reason: input.reason,
    sourceEvidence: uniqueSources(input.sourceEvidence)
  };
}

function mergeCandidates(candidates: readonly CompareAnchor[]): CompareAnchor[] {
  const byKey = new Map<string, CompareAnchor>();
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.path ?? candidate.label}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    byKey.set(key, {
      ...existing,
      confidence: Math.max(existing.confidence, candidate.confidence),
      notes: uniqueStrings([...(existing.notes ?? []), ...(candidate.notes ?? [])], 8),
      reason: `${existing.reason} Additional evidence: ${candidate.reason}`,
      sourceEvidence: uniqueSources([...existing.sourceEvidence, ...candidate.sourceEvidence])
    });
  }
  return Array.from(byKey.values());
}

function kindFromTarget(target: string): CompareAnchorKind {
  if (target === 'return') {
    return 'helper-return';
  }
  if (target === 'header') {
    return 'header';
  }
  if (target === 'body-field') {
    return 'body-field';
  }
  if (target === 'request-param') {
    return 'request-field';
  }
  return 'unknown';
}

function kindFromFixtureTarget(target: string): CompareAnchorKind {
  return target === 'helper-return' ? 'helper-return' : kindFromTarget(target);
}

function kindFromText(value: string): CompareAnchorKind {
  if (/helper\s*return|return/i.test(value)) {
    return 'helper-return';
  }
  if (/authorization|header|x-?sign|x-?token/i.test(value)) {
    return 'header';
  }
  if (/body|payload|postData|json/i.test(value)) {
    return 'body-field';
  }
  if (/request|url|query|param|sign|token|challenge|fingerprint|nonce/i.test(value)) {
    return 'request-field';
  }
  return 'unknown';
}

function strategyFor(name: string, target: string): CompareStrategy {
  if (/presence|exists/i.test(name)) {
    return 'presence-only';
  }
  if (/sign|token|auth|nonce|challenge|verify|captcha|fingerprint|timestamp|hash|hmac|cipher|enc/i.test(name)) {
    return 'normalized-string';
  }
  if (/header|body|request|payload|param/i.test(target)) {
    return 'structured-subset';
  }
  return 'exact';
}

function pathFor(target: string, name: string): string {
  const safeName = name.replace(/^[$.]+/, '');
  if (target === 'return' || target === 'helper-return') {
    return '$.helperReturn';
  }
  if (target === 'header') {
    return `$.request.headers.${safeName}`;
  }
  if (target === 'body-field') {
    return `$.request.body.${safeName}`;
  }
  if (target === 'request-param' || target === 'request-field' || target === 'param') {
    return `$.request.fields.${safeName}`;
  }
  if (target === 'url') {
    return '$.request.url';
  }
  return `$.${safeName}`;
}

function pathFromText(text: string, label: string): string {
  const kind = kindFromText(text);
  if (kind === 'header') {
    return pathFor('header', label);
  }
  if (kind === 'body-field') {
    return pathFor('body-field', label);
  }
  if (kind === 'helper-return') {
    return pathFor('return', label);
  }
  if (kind === 'request-field') {
    return pathFor('request-field', label);
  }
  return `$.${label.replace(/^[$.]+/, '')}`;
}

function extractSignalLabel(value: string): string | null {
  const direct = /\b(x-?sign|signature|sign|access[_-]?token|token|authorization|auth|nonce|challenge|verify|captcha|fingerprint|timestamp|ts|hash|hmac|cipher|enc)\b/i.exec(value);
  if (direct?.[1]) {
    return direct[1];
  }
  const path = /\$[.\w[\]-]+/.exec(value);
  if (path?.[0]) {
    return path[0].split(/[.\[\]]/).filter(Boolean).pop() ?? path[0];
  }
  return null;
}

function normalizeRequestLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname || parsed.host;
  } catch {
    return url.slice(0, 120);
  }
}

function targetBoost(value: string): number {
  return SIGNAL_PATTERN.test(value) ? 0.12 : 0;
}

function kindPriority(kind: CompareAnchorKind): number {
  return {
    'helper-return': 0,
    'request-field': 1,
    header: 2,
    'body-field': 3,
    'request-level': 4,
    unknown: 5
  }[kind];
}

function uniqueSources(values: readonly CompareAnchorEvidenceSource[]): CompareAnchorEvidenceSource[] {
  return Array.from(new Set(values));
}

function uniqueStrings(values: readonly string[], limit: number): string[] {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}

function stableId(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_$.-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.slice(0, 80) || 'anchor';
}

function clamp(value: number): number {
  return Math.max(0.05, Math.min(0.98, value));
}
