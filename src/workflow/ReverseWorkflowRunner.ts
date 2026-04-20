import { setTimeout as delay } from 'node:timers/promises';

import { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { CollectedCodeSummaryResult, CollectCodeOptions, TopPriorityCollectedCodeResult } from '../collector/types.js';
import { EvidenceStore } from '../evidence/EvidenceStore.js';
import { HookManager } from '../hook/HookManager.js';
import { NetworkCollector } from '../network/NetworkCollector.js';
import { RequestInitiatorTracker } from '../network/RequestInitiatorTracker.js';
import { PageController } from '../page/PageController.js';
import type { ProbeReverseTargetOptions, ProbeReverseTargetResult } from './types.js';

interface ReverseWorkflowRunnerDeps {
  browserSession: BrowserSessionManager;
  pageController: PageController;
  codeCollector: {
    collect(options?: CollectCodeOptions): Promise<unknown>;
    getCollectedFilesSummary(): CollectedCodeSummaryResult['files'];
    getTopPriorityFiles(topN?: number): TopPriorityCollectedCodeResult;
  };
  hookManager: HookManager;
  networkCollector: NetworkCollector;
  requestInitiatorTracker: RequestInitiatorTracker;
  evidenceStore: EvidenceStore;
}

export class ReverseWorkflowRunner {
  constructor(private readonly deps: ReverseWorkflowRunnerDeps) {}

  async probe(options: ProbeReverseTargetOptions): Promise<ProbeReverseTargetResult> {
    await this.ensurePageReady(options.url);
    await this.deps.networkCollector.ensureAttachedToSelectedPage();
    await this.deps.requestInitiatorTracker.ensureAttachedToSelectedPage();

    if (options.url) {
      await this.deps.browserSession.navigateSelectedPage({
        type: 'url',
        url: options.url
      });
    }

    const hooksInjected = options.autoInjectHooks ? await this.injectWorkflowHooks(options.hookTypes) : [];
    if (options.waitAfterSetupMs && options.waitAfterSetupMs > 0) {
      await delay(options.waitAfterSetupMs);
    }

    const collectOptions = {
      includeDynamic: options.collect?.includeDynamic,
      includeExternal: options.collect?.includeExternal,
      includeInline: options.collect?.includeInline,
      dynamicWaitMs: options.collect?.dynamicWaitMs
    } satisfies CollectCodeOptions;

    await this.deps.codeCollector.collect(collectOptions);

    const collectedCode = this.buildCollectedCodeResult(options.collect?.returnMode, options.collect?.topN);
    const page = await this.deps.browserSession.getSelectedPage();
    const pageResult = {
      title: await this.readPageTitle(page),
      url: page.url()
    };

    const task = options.taskId
      ? await this.deps.evidenceStore.openTask({
          goal: options.goal,
          slug: options.taskSlug,
          targetUrl: options.targetUrl ?? options.url,
          taskId: options.taskId
        })
      : null;

    if (options.writeEvidence && task) {
      const networkSnapshot = await this.deps.networkCollector.listRequests({ limit: 20 });
      await this.deps.evidenceStore.appendLog(task.taskId, 'runtime-evidence', {
        collectedCodeMode: options.collect?.returnMode ?? 'summary',
        hooksInjected,
        kind: 'probe_reverse_target',
        page: pageResult
      });
      await this.deps.evidenceStore.writeSnapshot(task.taskId, 'network-summary', networkSnapshot);
      await this.deps.evidenceStore.writeSnapshot(task.taskId, 'code-summary', collectedCode);
    }

    return {
      collectedCode,
      ...(hooksInjected.length > 0 ? { hooksInjected } : {}),
      initiatorTrackerAttached: true,
      networkObserverAttached: true,
      nextActions: this.buildNextActions({
        autoInjectHooks: options.autoInjectHooks ?? false,
        collectedCode,
        taskId: task?.taskId
      }),
      page: pageResult,
      task: task
        ? {
            taskDir: task.taskDir,
            taskId: task.taskId
          }
        : null
    };
  }

  private async ensurePageReady(url: string | undefined): Promise<void> {
    const selectedPage = await this.deps.browserSession.getSelectedPageOrNull();
    if (selectedPage) {
      return;
    }

    if (url) {
      await this.deps.browserSession.newPage();
      return;
    }

    await this.deps.browserSession.getSelectedPage();
  }

  private async injectWorkflowHooks(hookTypes: Array<'fetch' | 'xhr'> | undefined): Promise<string[]> {
    const page = await this.deps.browserSession.getSelectedPage();
    const requestedTypes: Array<'fetch' | 'xhr'> = hookTypes && hookTypes.length > 0 ? hookTypes : ['fetch', 'xhr'];
    const injectedHookIds: string[] = [];

    for (const hookType of requestedTypes) {
      const hookId = `workflow-auto-${hookType}`;
      let hook = this.deps.hookManager.getHook(hookId);
      if (!hook) {
        hook = this.deps.hookManager.createHook({
          description: `Workflow auto ${hookType} hook`,
          hookId,
          type: hookType
        });
      }

      await this.deps.hookManager.injectHook(hook.hookId, page, {
        currentDocument: true,
        futureDocuments: true
      });
      injectedHookIds.push(hook.hookId);
    }

    return injectedHookIds;
  }

  private buildCollectedCodeResult(
    returnMode: 'summary' | 'top-priority' | undefined,
    topN: number | undefined
  ): CollectedCodeSummaryResult | TopPriorityCollectedCodeResult {
    if (returnMode === 'top-priority') {
      return this.deps.codeCollector.getTopPriorityFiles(topN);
    }

    const files = this.deps.codeCollector.getCollectedFilesSummary();
    return {
      files,
      total: files.length
    };
  }

  private buildNextActions(input: {
    autoInjectHooks: boolean;
    collectedCode: CollectedCodeSummaryResult | TopPriorityCollectedCodeResult;
    taskId?: string;
  }): string[] {
    const actions = ['Call list_network_requests after reproducing the target action to inspect the request burst.'];

    if (!input.autoInjectHooks) {
      actions.push('Inject fetch/xhr hooks if you need runtime samples beyond initiator tracing.');
    }

    if ('files' in input.collectedCode && input.collectedCode.files.length > 0) {
      actions.push('Use get_collected_code_file on one of the returned URLs to inspect the most relevant script.');
    }

    if (input.taskId) {
      actions.push(`Use record_reverse_evidence to append focused observations into task ${input.taskId}.`);
    } else {
      actions.push('Open a reverse task if you want to persist snapshots and evidence.');
    }

    return actions;
  }

  private async readPageTitle(page: Awaited<ReturnType<BrowserSessionManager['getSelectedPage']>>): Promise<string> {
    try {
      return await page.title();
    } catch {
      return '';
    }
  }
}
