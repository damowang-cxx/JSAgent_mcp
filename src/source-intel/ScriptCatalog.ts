import type { DebuggerSessionManager } from '../debugger/DebuggerSessionManager.js';
import type { ScriptSummary } from './types.js';

interface DebuggerScriptWithHints {
  scriptId: string;
  url?: string;
  sourceMapURL?: string;
  length?: number;
  startLine?: number;
  endLine?: number;
}

export class ScriptCatalog {
  constructor(private readonly deps: { debuggerSessionManager: DebuggerSessionManager }) {}

  async list(options: { filter?: string } = {}): Promise<ScriptSummary[]> {
    await this.deps.debuggerSessionManager.ensureAttached();
    const filter = options.filter?.trim().toLowerCase();
    return this.deps.debuggerSessionManager.listScripts()
      .map((script) => this.toSummary(script as DebuggerScriptWithHints))
      .filter((script) => {
        if (!filter) {
          return true;
        }
        return script.scriptId.toLowerCase().includes(filter) || (script.url ?? '').toLowerCase().includes(filter);
      });
  }

  private toSummary(script: DebuggerScriptWithHints): ScriptSummary {
    const url = script.url?.trim();
    const lineCountHint = typeof script.startLine === 'number' && typeof script.endLine === 'number'
      ? Math.max(1, script.endLine - script.startLine + 1)
      : null;

    return {
      scriptId: script.scriptId,
      ...(url ? { url } : {}),
      ...(script.sourceMapURL ? { sourceMapURL: script.sourceMapURL } : {}),
      lengthHint: typeof script.length === 'number' ? script.length : null,
      lineCountHint,
      isInline: !url,
      isEvalLike: isEvalLike(url, script.scriptId)
    };
  }
}

function isEvalLike(url: string | undefined, scriptId: string): boolean {
  if (!url) {
    return true;
  }
  const normalized = url.toLowerCase();
  return normalized.startsWith('debugger://')
    || normalized.startsWith('vm')
    || normalized.includes('[eval]')
    || normalized.includes('eval at ')
    || scriptId.startsWith('eval');
}
