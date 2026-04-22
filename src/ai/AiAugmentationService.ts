import { AppError } from '../core/errors.js';
import type { CompareAnchorRegistry } from '../compare/CompareAnchorRegistry.js';
import type { CompareAnchorSelectionResult, StoredCompareAnchorSnapshot } from '../compare/types.js';
import type { Deobfuscator } from '../deobfuscation/Deobfuscator.js';
import type { StoredDebuggerInspectionSnapshot } from '../debugger/types.js';
import type { DebuggerReportBuilder } from '../debugger/DebuggerReportBuilder.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { FlowReasoningRegistry } from '../flow/FlowReasoningRegistry.js';
import type { FlowReasoningResult, StoredFlowReasoningSnapshot } from '../flow/types.js';
import type { PatchPreflightRegistry } from '../patch-preflight/PatchPreflightRegistry.js';
import type { PatchPreflightResult, StoredPatchPreflightSnapshot } from '../patch-preflight/types.js';
import type { PurePreflightRegistry } from '../pure-preflight/PurePreflightRegistry.js';
import type { PurePreflightContext, StoredPurePreflightSnapshot } from '../pure-preflight/types.js';
import type { RebuildContextRegistry } from '../rebuild-integration/RebuildContextRegistry.js';
import type { RebuildContext, StoredRebuildContextSnapshot } from '../rebuild-integration/types.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { AnalyzeTargetRunner } from '../workflow/AnalyzeTargetRunner.js';
import type { AnalyzeTargetResult } from '../analysis/types.js';
import type { AiPromptLibrary } from './AiPromptLibrary.js';
import type { LLMProviderManager } from './LLMProviderManager.js';
import type { AiAugmentationMode, AiAugmentationResult, AiSourceArtifact } from './types.js';

interface AiAugmentationServiceDeps {
  deobfuscator: Deobfuscator;
  analyzeTargetRunner: AnalyzeTargetRunner;
  flowReasoningRegistry: FlowReasoningRegistry;
  compareAnchorRegistry: CompareAnchorRegistry;
  patchPreflightRegistry: PatchPreflightRegistry;
  rebuildContextRegistry: RebuildContextRegistry;
  purePreflightRegistry: PurePreflightRegistry;
  debuggerReportBuilder: DebuggerReportBuilder;
  evidenceStore: EvidenceStore;
  taskManifestManager: TaskManifestManager;
  llmProviderManager: LLMProviderManager;
  promptLibrary: AiPromptLibrary;
}

type AiEvidence = {
  source: 'runtime-last' | 'task-artifact';
  artifacts: AiSourceArtifact[];
  notes: string[];
};

const MAX_SUMMARY_CHARS = 2_000;

export class AiAugmentationService {
  constructor(private readonly deps: AiAugmentationServiceDeps) {}

  async explain(options: {
    mode: AiAugmentationMode;
    taskId?: string;
    source?: 'runtime-last' | 'task-artifact';
    targetUrl?: string;
  }): Promise<AiAugmentationResult> {
    if (options.source === 'task-artifact' && !options.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'explain_reverse_context_with_ai with source=task-artifact requires taskId.');
    }

    const evidence = options.source === 'task-artifact'
      ? await this.readTaskEvidence(options.taskId as string, options.mode)
      : await this.readRuntimeEvidence(options.mode);
    const completion = await this.deps.llmProviderManager.complete({
      messages: this.deps.promptLibrary.buildForMode(options.mode, evidence.artifacts),
      maxTokens: 900,
      temperature: 0.2
    });
    const providerInfo = this.deps.llmProviderManager.getProviderInfo();
    const explanation = completion.providerAvailable
      ? completion.text
      : this.buildFallbackExplanation(options.mode, evidence.artifacts);

    return {
      augmentationId: makeAugmentationId(options.mode),
      basedOn: evidence.artifacts,
      cautions: this.buildCautions(),
      explanation,
      mode: options.mode,
      nextActions: this.buildNextActions(options.mode, evidence.artifacts, completion.providerAvailable),
      notes: uniqueStrings([
        ...evidence.notes,
        ...completion.notes,
        completion.providerAvailable
          ? 'AI explanation was generated from bounded deterministic artifact summaries.'
          : 'AI provider unavailable; deterministic fallback summary was returned.',
        'AI augmentation is semantic explanation only and does not replace deterministic truth.'
      ], 40),
      providerAvailable: completion.providerAvailable,
      providerName: completion.providerName ?? providerInfo.providerName,
      modelName: completion.modelName ?? providerInfo.modelName
    };
  }

  private async readRuntimeEvidence(mode: AiAugmentationMode): Promise<AiEvidence> {
    const artifacts = this.runtimeArtifactsForMode(mode);
    return {
      artifacts,
      notes: [
        'Runtime source enabled; latest in-memory deterministic artifacts were used where available.',
        'No whole repository source was sent to the AI provider.'
      ],
      source: 'runtime-last'
    };
  }

  private async readTaskEvidence(taskId: string, mode: AiAugmentationMode): Promise<AiEvidence> {
    await this.deps.taskManifestManager.ensureTask(taskId);
    const artifacts = await this.taskArtifactsForMode(taskId, mode);
    return {
      artifacts,
      notes: [
        `Task artifact source enabled for ${taskId}; runtime caches were not used.`,
        'No whole repository source was sent to the AI provider.'
      ],
      source: 'task-artifact'
    };
  }

  private runtimeArtifactsForMode(mode: AiAugmentationMode): AiSourceArtifact[] {
    const analyzeTarget = this.deps.analyzeTargetRunner.getLastAnalyzeTargetResult();
    const flow = this.deps.flowReasoningRegistry.getLast();
    const compare = this.deps.compareAnchorRegistry.getLast();
    const patch = this.deps.patchPreflightRegistry.getLast();
    const rebuild = this.deps.rebuildContextRegistry.getLast();
    const pure = this.deps.purePreflightRegistry.getLast();

    switch (mode) {
      case 'deobfuscation-explain':
        return [
          analyzeTarget?.deobfuscation ? this.artifact('deobfuscation-summary', undefined, analyzeTarget.deobfuscation) : null,
          analyzeTarget ? this.summarizeAnalyzeTarget(analyzeTarget) : null
        ].filter(isArtifact);
      case 'analyze-target-explain':
        return [analyzeTarget ? this.summarizeAnalyzeTarget(analyzeTarget) : null].filter(isArtifact);
      case 'flow-reasoning-explain':
        return [flow ? this.summarizeFlowReasoning(flow) : null].filter(isArtifact);
      case 'compare-anchor-explain':
        return [compare ? this.summarizeCompareAnchor(compare) : null].filter(isArtifact);
      case 'patch-preflight-explain':
        return [patch ? this.summarizePatchPreflight(patch) : null].filter(isArtifact);
      case 'rebuild-context-explain':
        return [rebuild ? this.summarizeRebuildContext(rebuild) : null].filter(isArtifact);
      case 'pure-preflight-explain':
        return [pure ? this.summarizePurePreflight(pure) : null].filter(isArtifact);
      case 'generic-reverse-explain':
      default:
        return [
          analyzeTarget ? this.summarizeAnalyzeTarget(analyzeTarget) : null,
          flow ? this.summarizeFlowReasoning(flow) : null,
          compare ? this.summarizeCompareAnchor(compare) : null,
          patch ? this.summarizePatchPreflight(patch) : null,
          rebuild ? this.summarizeRebuildContext(rebuild) : null,
          pure ? this.summarizePurePreflight(pure) : null
        ].filter(isArtifact);
    }
  }

  private async taskArtifactsForMode(taskId: string, mode: AiAugmentationMode): Promise<AiSourceArtifact[]> {
    const [
      analyzeSummary,
      deobfuscation,
      flow,
      compare,
      patch,
      rebuild,
      pure,
      debuggerInspection
    ] = await Promise.all([
      this.readSnapshot<unknown>(taskId, 'analyze-target-summary'),
      this.readSnapshot<unknown>(taskId, 'deobfuscation-summary'),
      this.readStoredResult<StoredFlowReasoningSnapshot>(taskId, 'flow-reasoning/latest'),
      this.readStoredResult<StoredCompareAnchorSnapshot>(taskId, 'compare-anchor/latest'),
      this.readStoredResult<StoredPatchPreflightSnapshot>(taskId, 'patch-preflight/latest'),
      this.readStoredResult<StoredRebuildContextSnapshot>(taskId, 'rebuild-context/latest'),
      this.readStoredResult<StoredPurePreflightSnapshot>(taskId, 'pure-preflight/latest'),
      this.readSnapshot<StoredDebuggerInspectionSnapshot>(taskId, 'debugger/inspection-last')
    ]);
    const debuggerArtifact = debuggerInspection
      ? this.artifact('debugger-inspection', undefined, {
          callFrames: debuggerInspection.callFrames?.slice(0, 5),
          correlations: debuggerInspection.correlations?.slice(0, 5),
          notes: debuggerInspection.notes
        })
      : null;

    switch (mode) {
      case 'deobfuscation-explain':
        return [deobfuscation ? this.artifact('deobfuscation-summary', undefined, deobfuscation) : null, debuggerArtifact].filter(isArtifact);
      case 'analyze-target-explain':
        return [analyzeSummary ? this.artifact('analyze-target-summary', undefined, analyzeSummary) : null, debuggerArtifact].filter(isArtifact);
      case 'flow-reasoning-explain':
        return [flow ? this.summarizeFlowReasoning(flow) : null, debuggerArtifact].filter(isArtifact);
      case 'compare-anchor-explain':
        return [compare ? this.summarizeCompareAnchor(compare) : null, debuggerArtifact].filter(isArtifact);
      case 'patch-preflight-explain':
        return [patch ? this.summarizePatchPreflight(patch) : null, debuggerArtifact].filter(isArtifact);
      case 'rebuild-context-explain':
        return [rebuild ? this.summarizeRebuildContext(rebuild) : null, debuggerArtifact].filter(isArtifact);
      case 'pure-preflight-explain':
        return [pure ? this.summarizePurePreflight(pure) : null, debuggerArtifact].filter(isArtifact);
      case 'generic-reverse-explain':
      default:
        return [
          analyzeSummary ? this.artifact('analyze-target-summary', undefined, analyzeSummary) : null,
          flow ? this.summarizeFlowReasoning(flow) : null,
          compare ? this.summarizeCompareAnchor(compare) : null,
          patch ? this.summarizePatchPreflight(patch) : null,
          rebuild ? this.summarizeRebuildContext(rebuild) : null,
          pure ? this.summarizePurePreflight(pure) : null,
          debuggerArtifact
        ].filter(isArtifact);
    }
  }

  private summarizeAnalyzeTarget(result: AnalyzeTargetResult): AiSourceArtifact {
    return this.artifact('analyze-target', result.target.targetUrl ?? result.target.url, {
      crypto: result.crypto.algorithms.slice(0, 8),
      deobfuscation: result.deobfuscation,
      hooks: result.hooks,
      priorityTargets: result.priorityTargets.slice(0, 10),
      requestFingerprints: result.requestFingerprints.slice(0, 8),
      risk: result.risk,
      stopIf: result.stopIf.slice(0, 8),
      target: result.target,
      whyTheseSteps: result.whyTheseSteps.slice(0, 8)
    });
  }

  private summarizeFlowReasoning(result: FlowReasoningResult): AiSourceArtifact {
    return this.artifact('flow-reasoning', result.resultId, {
      targetName: result.targetName,
      nodes: result.nodes.slice(0, 12),
      edges: result.edges.slice(0, 12),
      helperConsumers: result.helperConsumers.slice(0, 12),
      requestFieldBindings: result.requestFieldBindings.slice(0, 12),
      sinkAdjacentBindings: result.sinkAdjacentBindings.slice(0, 12),
      rebuildHints: result.rebuildHints.slice(0, 8),
      patchHints: result.patchHints.slice(0, 8),
      notes: result.notes.slice(0, 10)
    });
  }

  private summarizeCompareAnchor(result: CompareAnchorSelectionResult): AiSourceArtifact {
    return this.artifact('compare-anchor', result.selected?.anchorId, {
      selected: result.selected,
      candidates: result.candidates.slice(0, 8),
      nextActions: result.nextActions.slice(0, 8),
      stopIf: result.stopIf.slice(0, 8),
      notes: result.notes.slice(0, 8)
    });
  }

  private summarizePatchPreflight(result: PatchPreflightResult): AiSourceArtifact {
    return this.artifact('patch-preflight', result.selected?.target, {
      selected: result.selected,
      candidates: result.candidates.slice(0, 8),
      compareAnchorUsed: result.compareAnchorUsed,
      nextActions: result.nextActions.slice(0, 8),
      stopIf: result.stopIf.slice(0, 8),
      notes: result.notes.slice(0, 8)
    });
  }

  private summarizeRebuildContext(result: RebuildContext): AiSourceArtifact {
    return this.artifact('rebuild-context', result.contextId, {
      fixtureSource: result.fixtureSource,
      usedBoundaryFixture: result.usedBoundaryFixture,
      usedCompareAnchor: result.usedCompareAnchor,
      usedPatchPreflight: result.usedPatchPreflight,
      expectedOutputs: result.expectedOutputs.slice(0, 12),
      preservedInputs: result.preservedInputs.slice(0, 12),
      excludedNoise: result.excludedNoise.slice(0, 12),
      nextActions: result.nextActions.slice(0, 8),
      stopIf: result.stopIf.slice(0, 8)
    });
  }

  private summarizePurePreflight(result: PurePreflightContext): AiSourceArtifact {
    return this.artifact('pure-preflight', result.contextId, {
      source: result.source,
      usedBoundaryFixture: result.usedBoundaryFixture,
      usedCompareAnchor: result.usedCompareAnchor,
      usedPatchPreflight: result.usedPatchPreflight,
      usedRebuildContext: result.usedRebuildContext,
      usedFlowReasoning: result.usedFlowReasoning,
      expectedOutputs: result.expectedOutputs.slice(0, 12),
      preservedInputs: result.preservedInputs.slice(0, 12),
      excludedNoise: result.excludedNoise.slice(0, 12),
      nextActions: result.nextActions.slice(0, 8),
      stopIf: result.stopIf.slice(0, 8)
    });
  }

  private artifact(kind: string, id: string | undefined, value: unknown): AiSourceArtifact {
    return {
      ...(id ? { id } : {}),
      kind,
      summary: boundedJson(value)
    };
  }

  private buildFallbackExplanation(mode: AiAugmentationMode, artifacts: readonly AiSourceArtifact[]): string {
    if (artifacts.length === 0) {
      return [
        `AI augmentation mode ${mode} could not find a matching deterministic artifact.`,
        'No AI provider was used, and no facts were invented.',
        'Run the deterministic tool for this mode first, then rerun AI augmentation if a semantic explanation is still useful.'
      ].join(' ');
    }

    return [
      `AI provider is unavailable, so this is a deterministic fallback summary for ${mode}.`,
      `It is based on ${artifacts.map((artifact) => artifact.kind).join(', ')}.`,
      artifacts.map((artifact) => `${artifact.kind}${artifact.id ? ` (${artifact.id})` : ''}: ${artifact.summary}`).join('\n\n')
    ].join('\n\n');
  }

  private buildCautions(): string[] {
    return [
      'AI explanation is not a truth source.',
      'Compare anchor, patch preflight, rebuild divergence, and pure readyForPort decisions still rely on deterministic evidence.',
      'Do not apply patches or accept pure implementations solely from this explanation.',
      'If AI text conflicts with artifacts, trust the deterministic artifact and rerun the underlying tool.'
    ];
  }

  private buildNextActions(
    mode: AiAugmentationMode,
    artifacts: readonly AiSourceArtifact[],
    providerAvailable: boolean
  ): string[] {
    const actions = [
      artifacts.length > 0
        ? `Review the deterministic ${artifacts[0].kind} artifact before acting on the explanation.`
        : `Run the deterministic tool that produces ${mode.replace('-explain', '')} evidence first.`,
      providerAvailable
        ? 'Use this explanation as a report block or handoff note, not as a decision engine.'
        : 'Configure AI_PROVIDER, AI_API_KEY, AI_MODEL, and AI_BASE_URL if semantic AI wording is needed.',
      'Keep first explainable divergence and rebuild/pure verification as the final gates.'
    ];

    return uniqueStrings(actions, 10);
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

function makeAugmentationId(mode: string): string {
  const safe = mode.replace(/[^A-Za-z0-9_$.-]+/g, '-').slice(0, 80) || 'ai-augmentation';
  return `${safe}-${Date.now().toString(36)}`;
}

function boundedJson(value: unknown): string {
  const raw = JSON.stringify(value, null, 2) ?? '';
  return raw.length > MAX_SUMMARY_CHARS ? `${raw.slice(0, MAX_SUMMARY_CHARS)}\n[truncated]` : raw;
}

function uniqueStrings(values: readonly string[], limit: number): string[] {
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

function isArtifact(value: AiSourceArtifact | null): value is AiSourceArtifact {
  return value !== null;
}
