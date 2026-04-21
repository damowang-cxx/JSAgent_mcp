import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { RequestInitiatorTracker } from '../network/RequestInitiatorTracker.js';
import type { ScenarioReportBuilder } from '../report/ScenarioReportBuilder.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import type { CryptoHelperLocator } from './CryptoHelperLocator.js';
import type { RequestSinkLocator } from './RequestSinkLocator.js';
import type { ScenarioActionPlanner } from './ScenarioActionPlanner.js';
import type { ScenarioPresetRegistry } from './ScenarioPresetRegistry.js';
import type { SignatureScenarioAnalyzer } from './SignatureScenarioAnalyzer.js';
import type { TokenScenarioAnalyzer } from './TokenScenarioAnalyzer.js';
import type {
  CryptoHelperResult,
  RequestSinkResult,
  ScenarioAnalysisResult,
  ScenarioPreset,
  ScenarioWorkflowResult,
  TokenFamilyTraceResult
} from './types.js';

interface ScenarioWorkflowRunnerDeps {
  browserSession: BrowserSessionManager;
  codeCollector: CodeCollector;
  cryptoHelperLocator: CryptoHelperLocator;
  evidenceStore: EvidenceStore;
  hookManager: HookManager;
  networkCollector: NetworkCollector;
  requestInitiatorTracker: RequestInitiatorTracker;
  requestSinkLocator: RequestSinkLocator;
  scenarioActionPlanner: ScenarioActionPlanner;
  scenarioPresetRegistry: ScenarioPresetRegistry;
  scenarioReportBuilder: ScenarioReportBuilder;
  signatureScenarioAnalyzer: SignatureScenarioAnalyzer;
  taskManifestManager: TaskManifestManager;
  tokenScenarioAnalyzer: TokenScenarioAnalyzer;
}

export class ScenarioWorkflowRunner {
  private lastScenarioWorkflowResult: ScenarioWorkflowResult | null = null;

  constructor(private readonly deps: ScenarioWorkflowRunnerDeps) {}

  getLastScenarioWorkflowResult(): ScenarioWorkflowResult | null {
    return this.lastScenarioWorkflowResult;
  }

  async run(options: {
    presetId: string;
    taskId?: string;
    targetUrl?: string;
    topN?: number;
    writeEvidence?: boolean;
  }): Promise<ScenarioWorkflowResult> {
    const preset = this.deps.scenarioPresetRegistry.get(options.presetId);
    if (!preset) {
      throw new AppError('SCENARIO_PRESET_NOT_FOUND', `Scenario preset not found: ${options.presetId}`, {
        presetId: options.presetId
      });
    }

    const workflowNotes: string[] = [];
    const hooksInjected = await this.ensureHooks(preset, workflowNotes);
    await this.ensureCollectors(preset, options.topN, workflowNotes);

    const topN = options.topN ?? preset.collectHints.topN;
    let tokenTrace: TokenFamilyTraceResult | null = null;
    let sinkResult: RequestSinkResult | null = null;
    let helperResult: CryptoHelperResult | null = null;

    const analysis = await this.deps.signatureScenarioAnalyzer.analyze({
      includeDynamic: preset.collectHints.includeDynamic,
      scenario: preset.scenario,
      targetUrl: options.targetUrl,
      topN
    });

    if (preset.scenario === 'token-family' || preset.scenario === 'api-signature' || preset.scenario === 'anti-bot') {
      tokenTrace = await this.deps.tokenScenarioAnalyzer.trace({
        targetUrl: options.targetUrl
      });
    }

    if (preset.scenario !== 'token-family') {
      helperResult = await this.deps.cryptoHelperLocator.locate({ topN });
    }

    sinkResult = await this.deps.requestSinkLocator.locate({
      targetUrl: options.targetUrl,
      topN
    });

    analysis.notes.push(...workflowNotes);
    if (hooksInjected.length > 0) {
      analysis.notes.push(`Scenario recipe ensured hooks: ${hooksInjected.join(', ')}.`);
    }

    const plan = this.deps.scenarioActionPlanner.plan({
      analysis,
      helperResult: helperResult ?? undefined,
      scenario: preset.scenario,
      sinkResult: sinkResult ?? undefined,
      tokenTrace: tokenTrace ?? undefined
    });

    const result: ScenarioWorkflowResult = {
      analysis,
      evidenceWritten: false,
      helperResult,
      nextActions: plan.nextActions,
      preset,
      sinkResult,
      stopIf: plan.stopIf,
      task: null,
      tokenTrace,
      whyTheseSteps: plan.whyTheseSteps
    };

    if (options.taskId && options.writeEvidence) {
      result.evidenceWritten = true;
      const task = await this.writeEvidence(options.taskId, options.targetUrl, result);
      result.task = task;
      await this.deps.evidenceStore.writeSnapshot(options.taskId, 'scenario/workflow', result);
    }

    this.lastScenarioWorkflowResult = result;
    return result;
  }

  private async ensureHooks(preset: ScenarioPreset, notes: string[]): Promise<string[]> {
    const supportedHookTypes = preset.hookTypes.filter((type): type is 'fetch' | 'xhr' => type === 'fetch' || type === 'xhr');
    const unsupported = preset.hookTypes.filter((type) => !supportedHookTypes.includes(type as 'fetch' | 'xhr'));
    if (unsupported.length > 0) {
      notes.push(`Preset hook hints not installed in this phase: ${unsupported.join(', ')}.`);
    }

    if (supportedHookTypes.length === 0) {
      return [];
    }

    try {
      const page = await this.deps.browserSession.getSelectedPage();
      const injected: string[] = [];
      for (const type of supportedHookTypes) {
        const hookId = `scenario-${preset.presetId}-${type}`;
        let hook = this.deps.hookManager.getHook(hookId);
        if (!hook) {
          hook = this.deps.hookManager.createHook({
            description: `[scenario:${preset.presetId}] ${type} hook`,
            hookId,
            type
          });
        }
        await this.deps.hookManager.injectHook(hook.hookId, page, {
          currentDocument: true,
          futureDocuments: true
        });
        injected.push(hook.hookId);
      }

      await this.deps.networkCollector.ensureAttachedToSelectedPage();
      await this.deps.requestInitiatorTracker.ensureAttachedToSelectedPage();
      return injected;
    } catch (error) {
      notes.push(`Unable to ensure scenario hooks: ${this.toMessage(error)}`);
      return [];
    }
  }

  private async ensureCollectors(preset: ScenarioPreset, topN: number | undefined, notes: string[]): Promise<void> {
    const currentFiles = this.deps.codeCollector.getTopPriorityFiles(1).files;
    if (currentFiles.length > 0 && !preset.collectHints.includeDynamic) {
      return;
    }

    try {
      await this.deps.codeCollector.collect({
        includeDynamic: preset.collectHints.includeDynamic,
        includeExternal: true,
        includeInline: true,
        topN: topN ?? preset.collectHints.topN
      });
      notes.push('Scenario recipe collected scripts from the currently selected page.');
    } catch (error) {
      notes.push(`Scenario recipe could not collect code from the selected page: ${this.toMessage(error)}`);
    }
  }

  private async writeEvidence(
    taskId: string,
    targetUrl: string | undefined,
    result: ScenarioWorkflowResult
  ): Promise<{ taskId: string; taskDir: string }> {
    const task = await this.deps.evidenceStore.openTask({
      goal: `scenario:${result.preset.presetId}`,
      targetUrl,
      taskId
    });
    await this.deps.evidenceStore.appendLog(taskId, 'runtime-evidence', {
      kind: 'scenario_workflow',
      nextActions: result.nextActions,
      presetId: result.preset.presetId,
      priorityTargets: result.analysis.priorityTargets,
      scenario: result.preset.scenario
    });
    await this.deps.evidenceStore.writeSnapshot(taskId, 'scenario/preset', result.preset);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'scenario/analysis', result.analysis);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'scenario/actions', {
      nextActions: result.nextActions,
      stopIf: result.stopIf,
      whyTheseSteps: result.whyTheseSteps
    });
    await this.deps.evidenceStore.writeSnapshot(taskId, 'scenario/workflow', result);

    const report = await this.deps.scenarioReportBuilder.build(result, 'markdown');
    await this.deps.evidenceStore.writeSnapshot(taskId, 'scenario/report-markdown', {
      markdown: report.markdown
    });
    await this.deps.taskManifestManager.ensureTask(taskId, {
      goal: `scenario:${result.preset.presetId}`,
      targetUrl
    });
    await this.deps.taskManifestManager.updatePointers(taskId, {
      scenarioWorkflow: 'scenario/workflow'
    });

    return {
      taskDir: task.taskDir,
      taskId: task.taskId
    };
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
