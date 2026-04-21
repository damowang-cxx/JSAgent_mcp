import { setTimeout as delay } from 'node:timers/promises';

import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { NetworkRequestRecord } from '../network/types.js';
import type { ObservedReplayRequest, ReplayStepResult } from './types.js';

interface HookSnapshot {
  counts: Map<string, number>;
  total: number;
}

interface NetworkSnapshot {
  ids: Set<string>;
  requests: NetworkRequestRecord[];
}

export class ReplayEvidenceWindow {
  constructor(
    private readonly deps: {
      browserSession: BrowserSessionManager;
      hookManager: HookManager;
      networkCollector: NetworkCollector;
    }
  ) {}

  async captureAround(
    runFn: () => Promise<ReplayStepResult[]>,
    options: { captureWindowMs?: number } = {}
  ): Promise<{
    executedSteps: ReplayStepResult[];
    observedRequests: ObservedReplayRequest[];
    hookSummary: { recordCount: number; hookIds: string[] };
    notes: string[];
  }> {
    const notes: string[] = [];
    const beforeNetwork = await this.readNetworkSnapshot(notes);
    const beforeHooks = await this.readHookSnapshot(notes);
    const executedSteps = await runFn();

    if ((options.captureWindowMs ?? 0) > 0) {
      await delay(options.captureWindowMs);
    }

    const afterNetwork = await this.readNetworkSnapshot(notes);
    const afterHooks = await this.readHookSnapshot(notes);
    const observedRequests = afterNetwork.requests
      .filter((request) => !beforeNetwork.ids.has(request.id))
      .map((request) => ({
        method: request.method,
        requestId: request.id,
        url: request.url
      }));
    const hookDiff = this.diffHooks(beforeHooks, afterHooks);

    return {
      executedSteps,
      hookSummary: hookDiff,
      notes,
      observedRequests
    };
  }

  private async readNetworkSnapshot(notes: string[]): Promise<NetworkSnapshot> {
    try {
      const snapshot = await this.deps.networkCollector.listRequests({ limit: 500 });
      return {
        ids: new Set(snapshot.requests.map((request) => request.id)),
        requests: snapshot.requests
      };
    } catch (error) {
      notes.push(`Unable to read network snapshot: ${this.toMessage(error)}`);
      return {
        ids: new Set(),
        requests: []
      };
    }
  }

  private async readHookSnapshot(notes: string[]): Promise<HookSnapshot> {
    try {
      const page = await this.deps.browserSession.getSelectedPage();
      const hookData = await this.deps.hookManager.getHookData(page);
      const counts = new Map<string, number>();
      let total = 0;
      for (const [hookId, records] of Object.entries(hookData.records)) {
        counts.set(hookId, records.length);
        total += records.length;
      }
      return {
        counts,
        total
      };
    } catch (error) {
      notes.push(`Unable to read hook snapshot: ${this.toMessage(error)}`);
      return {
        counts: new Map(),
        total: 0
      };
    }
  }

  private diffHooks(before: HookSnapshot, after: HookSnapshot): { recordCount: number; hookIds: string[] } {
    const hookIds: string[] = [];
    let recordCount = 0;

    for (const [hookId, count] of after.counts.entries()) {
      const diff = count - (before.counts.get(hookId) ?? 0);
      if (diff > 0) {
        hookIds.push(hookId);
        recordCount += diff;
      }
    }

    return {
      hookIds: hookIds.sort(),
      recordCount
    };
  }

  private toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
