import type { CDPSession, Page } from 'puppeteer';

import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { AppError } from '../core/errors.js';
import type {
  BreakpointLocation,
  CallFrameEvaluationResult,
  DebuggerCallFrameDetail,
  DebuggerCallFrameSummary,
  DebuggerScriptSummary,
  DebuggerScopeSummary,
  DebuggerScopeVariable,
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
  callFrameId?: string;
  functionName?: string;
  location?: CdpLocation;
  scopeChain?: CdpScope[];
}

interface CdpScope {
  type?: string;
  name?: string;
  object?: CdpRemoteObject;
}

interface CdpRemoteObject {
  type?: string;
  subtype?: string;
  className?: string;
  value?: unknown;
  unserializableValue?: string;
  description?: string;
  objectId?: string;
  preview?: {
    description?: string;
    properties?: Array<{
      name?: string;
      type?: string;
      value?: string;
      subtype?: string;
    }>;
  };
}

interface CdpPropertyDescriptor {
  name?: string;
  enumerable?: boolean;
  value?: CdpRemoteObject;
}

interface CdpEvaluationResponse {
  result?: CdpRemoteObject;
  exceptionDetails?: {
    text?: string;
    exception?: CdpRemoteObject;
  };
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
const DEFAULT_STEP_WAIT_MS = 1_200;
const DEFAULT_MAX_SCOPE_VARIABLES = 80;
const DEFAULT_MAX_VALUE_DEPTH = 1;
const MAX_PREVIEW_LENGTH = 500;
const MAX_OBJECT_PROPERTIES = 12;

export class DebuggerSessionManager {
  private session: CDPSession | null = null;
  private pageId: string | null = null;
  private scripts = new Map<string, DebuggerScriptInternal>();
  private breakpoints = new Map<string, ManagedBreakpoint>();
  private pausedState: PausedStateSummary = emptyPausedState();
  private pausedCallFrames: CdpCallFrame[] = [];

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
        ...(script.sourceMapURL ? { sourceMapURL: script.sourceMapURL } : {}),
        ...(typeof script.length === 'number' ? { length: script.length } : {}),
        ...(typeof script.startLine === 'number' ? { startLine: script.startLine } : {}),
        ...(typeof script.startColumn === 'number' ? { startColumn: script.startColumn } : {}),
        ...(typeof script.endLine === 'number' ? { endLine: script.endLine } : {}),
        ...(typeof script.endColumn === 'number' ? { endColumn: script.endColumn } : {}),
        ...(typeof script.hasSourceURL === 'boolean' ? { hasSourceURL: script.hasSourceURL } : {}),
        ...(typeof script.isModule === 'boolean' ? { isModule: script.isModule } : {})
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

  async stepOver(): Promise<void> {
    await this.step('Debugger.stepOver');
  }

  async stepInto(): Promise<void> {
    await this.step('Debugger.stepInto');
  }

  async stepOut(): Promise<void> {
    await this.step('Debugger.stepOut');
  }

  getCallFrames(): DebuggerCallFrameDetail[] {
    this.requirePaused();
    return this.pausedCallFrames.map((frame) => this.toCallFrameDetail(frame));
  }

  async getScopeVariables(options: {
    frameIndex?: number;
    maxVariables?: number;
    maxDepth?: number;
  } = {}): Promise<DebuggerScopeSummary[]> {
    await this.ensureAttached();
    const frame = this.getPausedFrame(options.frameIndex ?? 0);
    const session = this.requireSession();
    const maxVariables = Math.max(1, Math.min(500, Math.floor(options.maxVariables ?? DEFAULT_MAX_SCOPE_VARIABLES)));
    const maxDepth = Math.max(0, Math.min(3, Math.floor(options.maxDepth ?? DEFAULT_MAX_VALUE_DEPTH)));
    const summaries: DebuggerScopeSummary[] = [];
    let remaining = maxVariables;

    for (const scope of frame.scopeChain ?? []) {
      if (remaining <= 0) {
        break;
      }
      if (!scope.type || scope.type === 'global' || !scope.object?.objectId) {
        continue;
      }

      const response = await session.send('Runtime.getProperties', {
        accessorPropertiesOnly: false,
        generatePreview: true,
        objectId: scope.object.objectId,
        ownProperties: true
      }) as { result?: CdpPropertyDescriptor[] };

      const variables: DebuggerScopeVariable[] = [];
      for (const property of response.result ?? []) {
        if (remaining <= 0) {
          break;
        }
        if (!property.name || !property.value) {
          continue;
        }

        const serialized = await this.serializeRemoteObject(property.value, {
          depth: 0,
          maxDepth,
          seen: new Set<string>()
        });
        variables.push({
          name: property.name,
          ...serialized
        });
        remaining -= 1;
      }

      summaries.push({
        ...(scope.name ? { name: scope.name } : {}),
        type: scope.type,
        variables
      });
    }

    return summaries;
  }

  async evaluateOnCallFrame(options: {
    expression: string;
    frameIndex?: number;
  }): Promise<CallFrameEvaluationResult> {
    await this.ensureAttached();
    const expression = options.expression.trim();
    if (!expression) {
      throw new AppError('DEBUGGER_EXPRESSION_REQUIRED', 'evaluate_on_call_frame requires a non-empty expression.');
    }

    const frame = this.getPausedFrame(options.frameIndex ?? 0);
    if (!frame.callFrameId) {
      throw new AppError('DEBUGGER_CALL_FRAME_ID_MISSING', 'The selected paused call frame does not expose a callFrameId.');
    }

    try {
      const response = await this.requireSession().send('Debugger.evaluateOnCallFrame', {
        callFrameId: frame.callFrameId,
        expression,
        generatePreview: true,
        includeCommandLineAPI: false,
        objectGroup: 'jsagent-debugger-eval',
        returnByValue: false,
        silent: true
      }) as CdpEvaluationResponse;

      if (response.exceptionDetails) {
        return {
          error: this.evaluationErrorMessage(response.exceptionDetails),
          evaluatedAt: new Date().toISOString(),
          ok: false
        };
      }

      const serialized = await this.serializeRemoteObject(response.result ?? { type: 'undefined' }, {
        depth: 0,
        maxDepth: 1,
        seen: new Set<string>()
      });
      return {
        evaluatedAt: new Date().toISOString(),
        ok: true,
        preview: serialized.preview,
        resultType: serialized.valueType,
        ...(serialized.value !== undefined ? { value: serialized.value } : {})
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        evaluatedAt: new Date().toISOString(),
        ok: false
      };
    }
  }

  clearStateForPageChange(): void {
    this.scripts.clear();
    this.breakpoints.clear();
    this.pausedCallFrames = [];
    this.pausedState = emptyPausedState();
  }

  private async attachToPage(page: Page, pageId: string): Promise<void> {
    const session = await page.createCDPSession();
    this.session = session;
    this.pageId = pageId;
    this.clearStateForPageChange();

    session.on('Debugger.scriptParsed', (event: unknown) => {
      const record = event as {
        scriptId?: string;
        url?: string;
        sourceMapURL?: string;
        length?: number;
        startLine?: number;
        startColumn?: number;
        endLine?: number;
        endColumn?: number;
        hasSourceURL?: boolean;
        isModule?: boolean;
      };
      if (!record.scriptId) {
        return;
      }
      this.scripts.set(record.scriptId, {
        scriptId: record.scriptId,
        ...(record.url ? { url: record.url } : {}),
        ...(record.sourceMapURL ? { sourceMapURL: record.sourceMapURL } : {}),
        ...(typeof record.length === 'number' ? { length: record.length } : {}),
        ...(typeof record.startLine === 'number' ? { startLine: record.startLine } : {}),
        ...(typeof record.startColumn === 'number' ? { startColumn: record.startColumn } : {}),
        ...(typeof record.endLine === 'number' ? { endLine: record.endLine } : {}),
        ...(typeof record.endColumn === 'number' ? { endColumn: record.endColumn } : {}),
        ...(typeof record.hasSourceURL === 'boolean' ? { hasSourceURL: record.hasSourceURL } : {}),
        ...(typeof record.isModule === 'boolean' ? { isModule: record.isModule } : {})
      });
    });
    session.on('Debugger.paused', (event: unknown) => {
      const paused = event as CdpPausedEvent;
      this.pausedCallFrames = paused.callFrames ?? [];
      this.pausedState = this.toPausedState(paused);
    });
    session.on('Debugger.resumed', () => {
      this.pausedCallFrames = [];
      this.pausedState = emptyPausedState();
    });

    await session.send('Debugger.enable');
    await session.send('Runtime.enable');
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

  private requirePaused(): void {
    if (!this.pausedState.isPaused) {
      throw new AppError('DEBUGGER_NOT_PAUSED', 'Debugger inspection requires the selected page to be paused.');
    }
  }

  private getPausedFrame(frameIndex: number): CdpCallFrame {
    this.requirePaused();
    const normalizedIndex = Math.max(0, Math.floor(frameIndex));
    const frame = this.pausedCallFrames[normalizedIndex];
    if (!frame) {
      throw new AppError('DEBUGGER_CALL_FRAME_NOT_FOUND', `Paused call frame not found at index ${normalizedIndex}.`, {
        frameIndex: normalizedIndex,
        frameCount: this.pausedCallFrames.length
      });
    }
    return frame;
  }

  private async step(method: 'Debugger.stepOver' | 'Debugger.stepInto' | 'Debugger.stepOut'): Promise<void> {
    await this.ensureAttached();
    this.requirePaused();
    const previousPausedAt = this.pausedState.pausedAt;
    await this.requireSession().send(method);
    await this.waitForStepResult(previousPausedAt, DEFAULT_STEP_WAIT_MS);
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

  private toCallFrameDetail(frame: CdpCallFrame): DebuggerCallFrameDetail {
    const location = frame.location ?? {};
    const script = location.scriptId ? this.scripts.get(location.scriptId) : undefined;
    return {
      callFrameId: frame.callFrameId ?? '',
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

  private async waitForStepResult(previousPausedAt: string | undefined, timeoutMs: number): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!this.pausedState.isPaused || this.pausedState.pausedAt !== previousPausedAt) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  private async serializeRemoteObject(
    remote: CdpRemoteObject,
    options: { depth: number; maxDepth: number; seen: Set<string> }
  ): Promise<Omit<DebuggerScopeVariable, 'name'>> {
    const valueType = this.remoteObjectType(remote);
    const preview = truncatePreview(this.remoteObjectPreview(remote));

    if (remote.type === 'undefined') {
      return { preview: 'undefined', valueType };
    }
    if (remote.type === 'string') {
      const value = typeof remote.value === 'string' ? remote.value : '';
      return {
        preview: truncatePreview(value),
        value: value.length > MAX_PREVIEW_LENGTH ? `${value.slice(0, MAX_PREVIEW_LENGTH)}...[truncated]` : value,
        valueType,
        truncated: value.length > MAX_PREVIEW_LENGTH
      };
    }
    if (remote.type === 'number' || remote.type === 'boolean') {
      return {
        preview,
        value: remote.value,
        valueType
      };
    }
    if (remote.type === 'bigint') {
      return {
        preview,
        value: remote.unserializableValue ?? String(remote.value),
        valueType
      };
    }
    if (remote.type === 'object' && remote.subtype === 'null') {
      return {
        preview: 'null',
        value: null,
        valueType
      };
    }

    if (!remote.objectId || options.depth >= options.maxDepth || options.seen.has(remote.objectId)) {
      return {
        preview,
        valueType,
        truncated: Boolean(remote.objectId)
      };
    }

    options.seen.add(remote.objectId);
    try {
      const response = await this.requireSession().send('Runtime.getProperties', {
        accessorPropertiesOnly: false,
        generatePreview: true,
        objectId: remote.objectId,
        ownProperties: true
      }) as { result?: CdpPropertyDescriptor[] };
      const output: Record<string, unknown> = {};
      const properties = (response.result ?? []).filter((property) => property.name && property.value).slice(0, MAX_OBJECT_PROPERTIES);

      for (const property of properties) {
        const child = await this.serializeRemoteObject(property.value as CdpRemoteObject, {
          depth: options.depth + 1,
          maxDepth: options.maxDepth,
          seen: options.seen
        });
        output[property.name as string] = child.value !== undefined ? child.value : child.preview;
      }

      return {
        preview,
        value: output,
        valueType,
        truncated: (response.result ?? []).length > properties.length
      };
    } catch {
      return {
        preview,
        valueType,
        truncated: true
      };
    } finally {
      options.seen.delete(remote.objectId);
    }
  }

  private remoteObjectType(remote: CdpRemoteObject): string {
    if (remote.subtype) {
      return `${remote.type ?? 'unknown'}:${remote.subtype}`;
    }
    return remote.type ?? 'unknown';
  }

  private remoteObjectPreview(remote: CdpRemoteObject): string {
    if (remote.unserializableValue) {
      return remote.unserializableValue;
    }
    if (remote.description) {
      return remote.description;
    }
    if (remote.preview?.description) {
      return remote.preview.description;
    }
    if (remote.value !== undefined) {
      try {
        return JSON.stringify(remote.value);
      } catch {
        return String(remote.value);
      }
    }
    return remote.type ?? 'unknown';
  }

  private evaluationErrorMessage(details: NonNullable<CdpEvaluationResponse['exceptionDetails']>): string {
    return details.exception?.description ?? details.exception?.unserializableValue ?? details.text ?? 'Evaluation failed.';
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

function truncatePreview(value: string): string {
  return value.length > MAX_PREVIEW_LENGTH ? `${value.slice(0, MAX_PREVIEW_LENGTH)}...[truncated]` : value;
}
