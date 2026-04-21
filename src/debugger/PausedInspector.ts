import { AppError } from '../core/errors.js';
import type { DebuggerSessionManager } from './DebuggerSessionManager.js';
import type {
  CallFrameEvaluationResult,
  DebuggerCallFrameDetail,
  DebuggerScopeSummary
} from './types.js';

export class PausedInspector {
  constructor(private readonly debuggerSessionManager: DebuggerSessionManager) {}

  async getCallFrames(): Promise<DebuggerCallFrameDetail[]> {
    await this.debuggerSessionManager.ensureAttached();
    this.assertPaused();
    return this.debuggerSessionManager.getCallFrames();
  }

  async getScopeVariables(options: {
    frameIndex?: number;
    maxVariables?: number;
    maxDepth?: number;
  } = {}): Promise<DebuggerScopeSummary[]> {
    await this.debuggerSessionManager.ensureAttached();
    this.assertPaused();
    this.assertFrameIndex(options.frameIndex ?? 0);
    return await this.debuggerSessionManager.getScopeVariables(options);
  }

  async evaluateOnCallFrame(options: {
    expression: string;
    frameIndex?: number;
  }): Promise<CallFrameEvaluationResult> {
    await this.debuggerSessionManager.ensureAttached();
    this.assertPaused();
    this.assertFrameIndex(options.frameIndex ?? 0);
    return await this.debuggerSessionManager.evaluateOnCallFrame(options);
  }

  private assertPaused(): void {
    if (!this.debuggerSessionManager.isPaused()) {
      throw new AppError('DEBUGGER_NOT_PAUSED', 'Debugger inspection requires the selected page to be paused.');
    }
  }

  private assertFrameIndex(frameIndex: number): void {
    const normalizedIndex = Math.max(0, Math.floor(frameIndex));
    const frameCount = this.debuggerSessionManager.getPausedState().callFrames.length;
    if (normalizedIndex >= frameCount) {
      throw new AppError('DEBUGGER_CALL_FRAME_NOT_FOUND', `Paused call frame not found at index ${normalizedIndex}.`, {
        frameCount,
        frameIndex: normalizedIndex
      });
    }
  }
}
