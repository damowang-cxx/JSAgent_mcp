import { AppError } from '../core/errors.js';
import type { DebuggerSessionManager } from '../debugger/DebuggerSessionManager.js';
import type { ScriptCatalog } from './ScriptCatalog.js';
import type { ScriptSourceExcerpt } from './types.js';

const DEFAULT_LINE_WINDOW = 120;
const MAX_LINE_WINDOW = 300;
const DEFAULT_OFFSET_LENGTH = 20_000;
const MAX_OFFSET_LENGTH = 80_000;
const MAX_EXCERPT_CHARS = 80_000;
const MAX_FULL_CHARS = 80_000;

export class SourceReader {
  constructor(private readonly deps: {
    debuggerSessionManager: DebuggerSessionManager;
    scriptCatalog: ScriptCatalog;
  }) {}

  async get(options: {
    scriptId: string;
    startLine?: number;
    endLine?: number;
    offset?: number;
    length?: number;
  }): Promise<ScriptSourceExcerpt> {
    const scriptId = options.scriptId.trim();
    if (!scriptId) {
      throw new AppError('SCRIPT_ID_REQUIRED', 'get_script_source requires a non-empty scriptId.');
    }

    const hasLineRange = options.startLine !== undefined || options.endLine !== undefined;
    const hasOffsetRange = options.offset !== undefined || options.length !== undefined;
    if (hasLineRange && hasOffsetRange) {
      throw new AppError('SOURCE_RANGE_CONFLICT', 'Use either startLine/endLine or offset/length, not both.', {
        scriptId
      });
    }

    const script = await this.findScript(scriptId);
    const source = await this.deps.debuggerSessionManager.getScriptSource(scriptId);
    if (source === null) {
      throw new AppError('SCRIPT_SOURCE_NOT_FOUND', `Live script source not found for scriptId: ${scriptId}`, {
        scriptId
      });
    }

    if (hasOffsetRange) {
      return this.offsetExcerpt(scriptId, script?.url, source, options.offset, options.length);
    }

    if (hasLineRange) {
      return this.lineExcerpt(scriptId, script?.url, source, options.startLine, options.endLine);
    }

    if (source.length <= MAX_FULL_CHARS) {
      return {
        scriptId,
        ...(script?.url ? { url: script.url } : {}),
        length: source.length,
        mode: 'full',
        sourceLength: source.length,
        text: source,
        totalLines: countLines(source),
        truncated: false,
        notes: ['Full source returned because the live script is within the bounded full-read limit.']
      };
    }

    if (isProbablyMinified(source)) {
      return {
        ...this.offsetExcerpt(scriptId, script?.url, source, 0, DEFAULT_OFFSET_LENGTH),
        notes: ['Large single-line/minified source was returned as a bounded offset range.']
      };
    }

    return {
      ...this.lineExcerpt(scriptId, script?.url, source, 1, DEFAULT_LINE_WINDOW),
      notes: ['Large source was returned as a bounded first line range.']
    };
  }

  private async findScript(scriptId: string) {
    const scripts = await this.deps.scriptCatalog.list();
    return scripts.find((script) => script.scriptId === scriptId);
  }

  private lineExcerpt(
    scriptId: string,
    url: string | undefined,
    source: string,
    startLineInput: number | undefined,
    endLineInput: number | undefined
  ): ScriptSourceExcerpt {
    const lines = source.split(/\r?\n/);
    const startLine = clampInteger(startLineInput ?? 1, 1, Math.max(1, lines.length));
    const requestedEndLine = endLineInput ?? startLine + DEFAULT_LINE_WINDOW - 1;
    const endLine = clampInteger(requestedEndLine, startLine, Math.min(lines.length, startLine + MAX_LINE_WINDOW - 1));
    let text = lines.slice(startLine - 1, endLine).join('\n');
    const charTruncated = text.length > MAX_EXCERPT_CHARS;
    if (charTruncated) {
      text = text.slice(0, MAX_EXCERPT_CHARS);
    }

    return {
      scriptId,
      ...(url ? { url } : {}),
      endLine,
      length: text.length,
      mode: 'line-range',
      sourceLength: source.length,
      startLine,
      text,
      totalLines: lines.length,
      truncated: charTruncated || requestedEndLine > endLine
    };
  }

  private offsetExcerpt(
    scriptId: string,
    url: string | undefined,
    source: string,
    offsetInput: number | undefined,
    lengthInput: number | undefined
  ): ScriptSourceExcerpt {
    const offset = clampInteger(offsetInput ?? 0, 0, source.length);
    const requestedLength = lengthInput ?? DEFAULT_OFFSET_LENGTH;
    const length = clampInteger(requestedLength, 1, Math.min(MAX_OFFSET_LENGTH, Math.max(1, source.length - offset)));
    const end = Math.min(source.length, offset + length);
    const text = source.slice(offset, end);

    return {
      scriptId,
      ...(url ? { url } : {}),
      length: text.length,
      mode: 'offset-range',
      offset,
      sourceLength: source.length,
      text,
      totalLines: countLines(source),
      truncated: end < source.length || requestedLength > length
    };
  }
}

export function isProbablyMinified(source: string): boolean {
  if (source.length === 0) {
    return false;
  }
  const lineBreaks = (source.match(/\n/g) ?? []).length;
  if (lineBreaks <= 1 && source.length > 1_000) {
    return true;
  }
  const lines = source.split(/\r?\n/);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return longest > 2_000 || longest / Math.max(1, source.length) > 0.85;
}

function countLines(source: string): number {
  return source.length === 0 ? 1 : source.split(/\r?\n/).length;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}
