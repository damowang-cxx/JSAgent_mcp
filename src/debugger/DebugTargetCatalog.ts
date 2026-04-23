import type { DebuggerSessionManager } from './DebuggerSessionManager.js';
import type { DebugTargetSummary } from './types.js';

export class DebugTargetCatalog {
  constructor(private readonly debuggerSessionManager: DebuggerSessionManager) {}

  async list(): Promise<DebugTargetSummary[]> {
    return await this.debuggerSessionManager.listDebugTargets();
  }

  async select(targetId: string): Promise<DebugTargetSummary> {
    return await this.debuggerSessionManager.selectDebugTarget(targetId);
  }
}
