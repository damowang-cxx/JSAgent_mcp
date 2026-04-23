import type { DebuggerSessionManager } from './DebuggerSessionManager.js';
import type { ExceptionBreakpointMode } from './types.js';

export class ExceptionBreakpointManager {
  constructor(private readonly debuggerSessionManager: DebuggerSessionManager) {}

  async setMode(mode: ExceptionBreakpointMode): Promise<ExceptionBreakpointMode> {
    await this.debuggerSessionManager.setExceptionPauseMode(mode);
    return this.debuggerSessionManager.getExceptionPauseMode();
  }

  getMode(): ExceptionBreakpointMode {
    return this.debuggerSessionManager.getExceptionPauseMode();
  }

  async clear(): Promise<void> {
    await this.debuggerSessionManager.setExceptionPauseMode('none');
  }
}
