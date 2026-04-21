import type { CDPSession, Page } from 'puppeteer';

import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { AppError } from '../core/errors.js';
import type {
  BreakpointLocation,
  DebuggerCallFrameSummary,
  DebuggerScriptSummary,
  ManagedBreakpoint,
  PausedStateSummary
} from './types.js';

interface DebuggerScriptInternal extends DebuggerScriptSummary {
  sourceLoaded?: boolean;
}

interface CdpLocation {
  scriptId?: string;
  lineNumber?: number;
  columnNumber?: number;
}

interface CdpCallFrame {
  functionName?: string;
  location?: CdpLocation;
}

interface CdpPausedEvent {
  reason?: string;
  hitBreakpoints?: string[];
  callFrames?: CdpCallFrame[];
}

interface TextSearchMatch {
  script: DebuggerScriptInternal;
  index: number;
  lineNumber: number;
  columnNumber: number;
  linePreview: string;
}

const DEFAULT_PAUSE_WAIT_MS = 1_000;

export class DebuggerSessionManager {
  private session: CDPSession | null = null;
  private pageId: string | null = null;
  private scripts = new Map<string, DebuggerScriptInternal>();
  private breakpoints = new Map<string, ManagedBreakpoint>();
  private pausedState: PausedStateSummary = emptyPausedState();

  constructor(private readonly deps: { browserSession: BrowserSessionManager }) {}

  async ensureAttached(): Promise<void> {
    const page = await this.deps.browserSession.getSelectedPage();
    const nextPageId = this.deps.browserSession.getPageId(page);
    if (this.session && this.pageId === nextPageId) {
      return;
    }

    await this.detachCurrent();
    await this.attachToPage(page, nextPageId);
  }

  isAttached(): boolean {
    return Boolean(this.session);
  }

  listScripts(): DebuggerScriptSummary[] {
    return Array.from(this.scripts.values())
      .map((script) => ({
        scriptId: script.scriptId,
        ...(script.url ? { url: script.url } : {}),
        ...(script.sourceMapURL ? { sourceMapURL: script.sourceMapURL } : {})
      }))
      .sort((left, right) => (left.url ?? '').localeCompare(right.url ?? '') || left.scriptId.localeCompare(right.scriptId));
  }

  async getScriptSource(scriptId: string): Promise<string | null> {
    await this.ensureAttached();
    const session = this.requireSession();
    try {
      const result = await session.send('Debugger.getScriptSource', { scriptId }) as { scriptSource?: string };
      return typeof result.scriptSource === 'string' ? result.scriptSource : null;
    } catch {
      return null;
    }
  }

  async setBreakpointByUrl(options: {
    url: string;
    lineNumber: number;
    columnNumber?: number;
  }): Promise<ManagedBreakpoint> {
    await this.ensureAttached();
    const session = this.requireSession();
    const matchedUrl = this.resolveScriptUrl(options.url) ?? options.url;
    const lineNumber = Math.max(1, Math.floor(options.lineNumber));
    const columnNumber = Math.max(0, Math.floor(options.columnNumber ?? 0));
    const result = await session.send('Debugger.setBreakpointByUrl', {
      columnNumber,
      lineNumber: lineNumber - 1,
      url: matchedUrl
    }) as { breakpointId: string; locations?: CdpLocation[] };

    const breakpoint = this.toManagedBreakpoint({
      breakpointId: result.breakpointId,
      columnNumber,
      lineNumber,
      locations: result.locations ?? [],
      source: 'url-line',
      url: matchedUrl
    });
    this.breakpoints.set(breakpoint.breakpointId, breakpoint);
    return breakpoint;
  }

  async setBreakpointOnText(options: {
    text: string;
    urlFilter?: string;
    occurrence?: number;
  }): Promise<{
    breakpoint: ManagedBreakpoint;
    matchedLinePreview: string;
    matchedScript?: { scriptId: string; url?: string };
  }> {
    await this.ensureAttached();
    const text = options.text.trim();
    if (!text) {
      throw new AppError('TEXT_QUERY_REQUIRED', 'set_breakpoint_on_text requires a non-empty text query.');
    }

    const occurrence = Math.max(1, Math.floor(options.occurrence ?? 1));
    const match = await this.findTextOccurrence(text, options.urlFilter, occurrence);
    if (!match) {
      throw new AppError('DEBUGGER_TEXT_NOT_FOUND', `Text not found in current debugger scripts: ${text}`, {
        occurrence,
        text,
        urlFilter: options.urlFilter
      });
    }

    const session = this.requireSession();
    let result: { breakpointId: string; actualLocation?: CdpLocation; locations?: CdpLocation[] };
    if (match.script.url) {
      result = await session.send('Debugger.setBreakpointByUrl', {
        columnNumber: match.columnNumber,
        lineNumber: match.lineNumber - 1,
        url: match.script.url
      }) as { breakpointId: string; locations?: CdpLocation[] };
    } else {
      result = await session.send('Debugger.setBreakpoint', {
        location: {
          columnNumber: match.columnNumber,
          lineNumber: match.lineNumber - 1,
          scriptId: match.script.scriptId
        }
      }) as { breakpointId: string; actualLocation?: CdpLocation };
    }

    const breakpoint = this.toManagedBreakpoint({
      breakpointId: result.breakpointId,
      columnNumber: match.columnNumber,
      lineNumber: match.lineNumber,
      locations: result.locations ?? (result.actualLocation ? [result.actualLocation] : [{
        columnNumber: match.columnNumber,
        lineNumber: match.lineNumber - 1,
        scriptId: match.script.scriptId
      }]),
      source: 'text-search',
      textQuery: text,
      url: match.script.url ?? `script:${match.script.scriptId}`
    });
    this.breakpoints.set(breakpoint.breakpointId, breakpoint);

    return {
      breakpoint,
      matchedLinePreview: match.linePreview,
      matchedScript: {
        scriptId: match.script.scriptId,
        ...(match.script.url ? { url: match.script.url } : {})
      }
    };
  }

  listBreakpoints(): ManagedBreakpoint[] {
    return Array.from(this.breakpoints.values()).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async removeBreakpoint(breakpointId: string): Promise<boolean> {
    await this.ensureAttached();
    const session = this.requireSession();
    const existed = this.breakpoints.has(breakpointId);
    try {
      await session.send('Debugger.removeBreakpoint', { breakpointId });
    } catch {
      if (!existed) {
        return false;
      }
    }
    this.breakpoints.delete(breakpointId);
    return existed;
  }

  async pause(): Promise<void> {
    await this.ensureAttached();
    if (this.pausedState.isPaused) {
      return;
    }
    await this.requireSession().send('Debugger.pause');
    await this.waitForPaused(DEFAULT_PAUSE_WAIT_MS);
  }

  async resume(): Promise<void> {
    await this.ensureAttached();
    if (!this.pausedState.isPaused) {
      return;
    }
    await this.requireSession().send('Debugger.resume');
  }

  isPaused(): boolean {
    return this.pausedState.isPaused;
  }

  getPausedState(): PausedStateSummary {
    return clonePausedState(this.pausedState);
  }

  clearStateForPageChange(): void {
    this.scripts.clear();
    this.breakpoints.clear();
    this.pausedState = emptyPausedState();
  }

  private async attachToPage(page: Page, pageId: string): Promise<void> {
    const session = await page.createCDPSession();
    this.session = session;
    this.pageId = pageId;
    this.clearStateForPageChange();

    session.on('Debugger.scriptParsed', (event: unknown) => {
      const record = event as { scriptId?: string; url?: string; sourceMapURL?: string };
      if (!record.scriptId) {
        return;
      }
      this.scripts.set(record.scriptId, {
        scriptId: record.scriptId,
        ...(record.url ? { url: record.url } : {}),
        ...(record.sourceMapURL ? { sourceMapURL: record.sourceMapURL } : {})
      });
    });
    session.on('Debugger.paused', (event: unknown) => {
      this.pausedState = this.toPausedState(event as CdpPausedEvent);
    });
    session.on('Debugger.resumed', () => {
      this.pausedState = emptyPausedState();
    });

    await session.send('Debugger.enable');
  }

  private async detachCurrent(): Promise<void> {
    const session = this.session;
    this.session = null;
    this.pageId = null;
    this.clearStateForPageChange();

    if (!session) {
      return;
    }

    try {
      (session as unknown as { removeAllListeners?: () => void }).removeAllListeners?.();
      await session.detach();
    } catch {
      // The selected page may already be closed or detached.
    }
  }

  private requireSession(): CDPSession {
    if (!this.session) {
      throw new AppError('DEBUGGER_NOT_ATTACHED', 'Debugger is not attached to the selected page.');
    }
    return this.session;
  }

  private resolveScriptUrl(inputUrl: string): string | null {
    const exact = Array.from(this.scripts.values()).find((script) => script.url === inputUrl);
    if (exact?.url) {
      return exact.url;
    }

    const partial = Array.from(this.scripts.values()).find((script) => script.url?.includes(inputUrl));
    return partial?.url ?? null;
  }

  private async findTextOccurrence(text: string, urlFilter: string | undefined, occurrence: number): Promise<TextSearchMatch | null> {
    let seen = 0;
    const scripts = Array.from(this.scripts.values())
      .filter((script) => script.url || !urlFilter)
      .filter((script) => !urlFilter || script.url?.includes(urlFilter));

    for (const script of scripts) {
      const source = await this.getScriptSource(script.scriptId);
      if (!source) {
        continue;
      }

      let searchFrom = 0;
      while (searchFrom < source.length) {
        const index = source.indexOf(text, searchFrom);
        if (index < 0) {
          break;
        }
        seen += 1;
        if (seen === occurrence) {
          return {
            index,
            lineNumber: lineNumberAt(source, index),
            columnNumber: columnNumberAt(source, index),
            linePreview: linePreviewAt(source, index),
            script
          };
        }
        searchFrom = index + Math.max(1, text.length);
      }
    }

    return null;
  }

  private toManagedBreakpoint(input: {
    breakpointId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
    source: ManagedBreakpoint['source'];
    textQuery?: string;
    locations: CdpLocation[];
  }): ManagedBreakpoint {
    return {
      breakpointId: input.breakpointId,
      columnNumber: input.columnNumber,
      createdAt: new Date().toISOString(),
      lineNumber: input.lineNumber,
      locations: input.locations.map((location) => this.toBreakpointLocation(location, input.url)),
      source: input.source,
      ...(input.textQuery ? { textQuery: input.textQuery } : {}),
      url: input.url
    };
  }

  private toBreakpointLocation(location: CdpLocation, fallbackUrl?: string): BreakpointLocation {
    const script = location.scriptId ? this.scripts.get(location.scriptId) : undefined;
    return {
      columnNumber: Math.max(0, location.columnNumber ?? 0),
      lineNumber: Math.max(1, (location.lineNumber ?? 0) + 1),
      ...(location.scriptId ? { scriptId: location.scriptId } : {}),
      ...(script?.url ?? fallbackUrl ? { url: script?.url ?? fallbackUrl } : {})
    };
  }

  private toPausedState(event: CdpPausedEvent): PausedStateSummary {
    const callFrames = (event.callFrames ?? []).map((frame) => this.toCallFrameSummary(frame));
    return {
      callFrames,
      hitBreakpoints: event.hitBreakpoints ?? [],
      isPaused: true,
      pausedAt: new Date().toISOString(),
      reason: event.reason,
      topFrame: callFrames[0] ?? null
    };
  }

  private toCallFrameSummary(frame: CdpCallFrame): DebuggerCallFrameSummary {
    const location = frame.location ?? {};
    const script = location.scriptId ? this.scripts.get(location.scriptId) : undefined;
    return {
      columnNumber: Math.max(0, location.columnNumber ?? 0),
      functionName: frame.functionName || '(anonymous)',
      lineNumber: Math.max(1, (location.lineNumber ?? 0) + 1),
      ...(location.scriptId ? { scriptId: location.scriptId } : {}),
      ...(script?.url ? { url: script.url } : {})
    };
  }

  private async waitForPaused(timeoutMs: number): Promise<void> {
    const started = Date.now();
    while (!this.pausedState.isPaused && Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

function emptyPausedState(): PausedStateSummary {
  return {
    callFrames: [],
    hitBreakpoints: [],
    isPaused: false,
    topFrame: null
  };
}

function clonePausedState(state: PausedStateSummary): PausedStateSummary {
  return {
    ...state,
    callFrames: state.callFrames.map((frame) => ({ ...frame })),
    hitBreakpoints: [...state.hitBreakpoints],
    topFrame: state.topFrame ? { ...state.topFrame } : null
  };
}

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

function columnNumberAt(source: string, index: number): number {
  const before = source.slice(0, Math.max(0, index));
  const lineStart = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')) + 1;
  return Math.max(0, index - lineStart);
}

function linePreviewAt(source: string, index: number): string {
  const start = Math.max(source.lastIndexOf('\n', index), source.lastIndexOf('\r', index)) + 1;
  const nextNewline = source.indexOf('\n', index);
  const end = nextNewline < 0 ? source.length : nextNewline;
  const line = source.slice(start, end).trim();
  return line.length > 240 ? `${line.slice(0, 240)}...[truncated]` : line;
}
