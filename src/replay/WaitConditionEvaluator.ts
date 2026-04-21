import { setTimeout as delay } from 'node:timers/promises';

import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { NetworkRequestRecord } from '../network/types.js';
import type { PageController } from '../page/PageController.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const POLL_MS = 150;

export class WaitConditionEvaluator {
  constructor(
    private readonly deps: {
      networkCollector: NetworkCollector;
      pageController: PageController;
    }
  ) {}

  async waitForSelector(selector: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{ selector: string }> {
    await this.deps.pageController.waitForSelector(selector, timeoutMs);
    return { selector };
  }

  async waitForTimeout(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{ waitedMs: number }> {
    await delay(Math.max(0, timeoutMs));
    return { waitedMs: timeoutMs };
  }

  async waitForRequest(input: {
    url?: string;
    method?: string;
    timeoutMs?: number;
    startedAfter?: string;
  }): Promise<{ matched: NetworkRequestRecord | null; checked: number }> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    const startedAfterMs = input.startedAfter ? Date.parse(input.startedAfter) : Date.now();
    let checked = 0;

    while (Date.now() <= deadline) {
      const snapshot = await this.deps.networkCollector.listRequests({ limit: 300 });
      checked += snapshot.requests.length;
      const matched = snapshot.requests.find((request) => {
        const requestStartedAt = Date.parse(request.startedAt);
        if (!Number.isNaN(requestStartedAt) && requestStartedAt < startedAfterMs) {
          return false;
        }
        if (input.method && request.method.toUpperCase() !== input.method.toUpperCase()) {
          return false;
        }
        if (input.url && !request.url.includes(input.url)) {
          return false;
        }
        return true;
      });

      if (matched) {
        return {
          checked,
          matched
        };
      }

      await delay(POLL_MS);
    }

    return {
      checked,
      matched: null
    };
  }
}
