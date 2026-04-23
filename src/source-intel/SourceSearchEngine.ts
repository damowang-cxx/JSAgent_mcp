import { AppError } from '../core/errors.js';
import type { DebuggerSessionManager } from '../debugger/DebuggerSessionManager.js';
import type { ScriptCatalog } from './ScriptCatalog.js';
import { isProbablyMinified } from './SourceReader.js';
import type { ScriptFindMatch, SourceSearchMatch } from './types.js';

const DEFAULT_CONTEXT_CHARS = 80;
const MAX_CONTEXT_CHARS = 500;
const MAX_FIND_MATCHES = 100;
const DEFAULT_SEARCH_RESULTS = 50;
const MAX_SEARCH_RESULTS = 500;
const DEFAULT_LINE_PREVIEW = 240;
const MAX_LINE_PREVIEW = 1_000;

export class SourceSearchEngine {
  constructor(private readonly deps: {
    debuggerSessionManager: DebuggerSessionManager;
    scriptCatalog: ScriptCatalog;
  }) {}

  async findInScript(options: {
    scriptId: string;
    query: string;
    contextChars?: number;
    occurrence?: number;
    caseSensitive?: boolean;
  }): Promise<ScriptFindMatch[]> {
    const scriptId = options.scriptId.trim();
    const query = options.query;
    if (!scriptId) {
      throw new AppError('SCRIPT_ID_REQUIRED', 'find_in_script requires a non-empty scriptId.');
    }
    if (!query) {
      throw new AppError('SOURCE_QUERY_REQUIRED', 'find_in_script requires a non-empty query.');
    }

    const script = (await this.deps.scriptCatalog.list()).find((item) => item.scriptId === scriptId);
    const source = await this.deps.debuggerSessionManager.getScriptSource(scriptId);
    if (source === null) {
      throw new AppError('SCRIPT_SOURCE_NOT_FOUND', `Live script source not found for scriptId: ${scriptId}`, {
        scriptId
      });
    }

    const contextChars = clampInteger(options.contextChars ?? DEFAULT_CONTEXT_CHARS, 0, MAX_CONTEXT_CHARS);
    const targetOccurrence = options.occurrence === undefined ? null : clampInteger(options.occurrence, 1, Number.MAX_SAFE_INTEGER);
    const haystack = options.caseSensitive ? source : source.toLowerCase();
    const needle = options.caseSensitive ? query : query.toLowerCase();
    const matches: ScriptFindMatch[] = [];
    let occurrence = 0;
    let searchFrom = 0;

    while (searchFrom <= haystack.length) {
      const offset = haystack.indexOf(needle, searchFrom);
      if (offset < 0) {
        break;
      }

      occurrence += 1;
      if (targetOccurrence === null || occurrence === targetOccurrence) {
        matches.push({
          scriptId,
          ...(script?.url ? { url: script.url } : {}),
          columnNumber: columnNumberAt(source, offset),
          contextPreview: contextPreview(source, offset, query.length, contextChars),
          lineNumber: lineNumberAt(source, offset),
          matchText: source.slice(offset, offset + query.length),
          occurrence,
          offset
        });
      }

      if (targetOccurrence !== null && occurrence >= targetOccurrence) {
        break;
      }
      if (matches.length >= MAX_FIND_MATCHES) {
        break;
      }
      searchFrom = offset + Math.max(1, needle.length);
    }

    return matches;
  }

  async searchInSources(options: {
    query: string;
    caseSensitive?: boolean;
    isRegex?: boolean;
    maxResults?: number;
    maxLineLength?: number;
    excludeMinified?: boolean;
    urlFilter?: string;
  }): Promise<SourceSearchMatch[]> {
    if (!options.query) {
      throw new AppError('SOURCE_QUERY_REQUIRED', 'search_in_sources requires a non-empty query.');
    }

    const maxResults = clampInteger(options.maxResults ?? DEFAULT_SEARCH_RESULTS, 1, MAX_SEARCH_RESULTS);
    const maxLineLength = clampInteger(options.maxLineLength ?? DEFAULT_LINE_PREVIEW, 40, MAX_LINE_PREVIEW);
    const urlFilter = options.urlFilter?.trim().toLowerCase();
    const matcher = options.isRegex ? createRegexMatcher(options.query, options.caseSensitive) : null;
    const query = options.caseSensitive ? options.query : options.query.toLowerCase();
    const scripts = (await this.deps.scriptCatalog.list())
      .filter((script) => !urlFilter
        || script.scriptId.toLowerCase().includes(urlFilter)
        || (script.url ?? '').toLowerCase().includes(urlFilter));
    const matches: SourceSearchMatch[] = [];
    let occurrence = 0;

    for (const script of scripts) {
      if (matches.length >= maxResults) {
        break;
      }

      const source = await this.deps.debuggerSessionManager.getScriptSource(script.scriptId);
      if (source === null) {
        continue;
      }
      if (options.excludeMinified && isProbablyMinified(source)) {
        continue;
      }

      for (const line of lineRecords(source)) {
        if (matches.length >= maxResults) {
          break;
        }

        if (matcher) {
          matcher.lastIndex = 0;
          let regexMatch: RegExpExecArray | null;
          while ((regexMatch = matcher.exec(line.text)) !== null) {
            occurrence += 1;
            matches.push(toSearchMatch(script, line, regexMatch.index, regexMatch[0], occurrence, maxLineLength));
            if (matches.length >= maxResults || regexMatch[0].length === 0) {
              break;
            }
          }
          continue;
        }

        const haystack = options.caseSensitive ? line.text : line.text.toLowerCase();
        let searchFrom = 0;
        while (searchFrom <= haystack.length) {
          const column = haystack.indexOf(query, searchFrom);
          if (column < 0) {
            break;
          }
          occurrence += 1;
          matches.push(toSearchMatch(script, line, column, line.text.slice(column, column + options.query.length), occurrence, maxLineLength));
          if (matches.length >= maxResults) {
            break;
          }
          searchFrom = column + Math.max(1, query.length);
        }
      }
    }

    return matches;
  }
}

interface SourceLineRecord {
  lineNumber: number;
  offsetStart: number;
  text: string;
}

function createRegexMatcher(query: string, caseSensitive: boolean | undefined): RegExp {
  try {
    return new RegExp(query, caseSensitive ? 'g' : 'gi');
  } catch (error) {
    throw new AppError('SOURCE_REGEX_INVALID', `Invalid source search regex: ${query}`, {
      message: error instanceof Error ? error.message : String(error),
      query
    });
  }
}

function toSearchMatch(
  script: { scriptId: string; url?: string },
  line: SourceLineRecord,
  column: number,
  matchText: string,
  occurrence: number,
  maxLineLength: number
): SourceSearchMatch {
  return {
    scriptId: script.scriptId,
    ...(script.url ? { url: script.url } : {}),
    columnNumber: column,
    lineNumber: line.lineNumber,
    linePreview: linePreview(line.text, column, maxLineLength),
    matchText: truncate(matchText, 160),
    occurrence,
    offset: line.offsetStart + column
  };
}

function* lineRecords(source: string): Iterable<SourceLineRecord> {
  const rawLines = source.split('\n');
  let offsetStart = 0;
  for (let index = 0; index < rawLines.length; index += 1) {
    const rawLine = rawLines[index] ?? '';
    const text = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    yield {
      lineNumber: index + 1,
      offsetStart,
      text
    };
    offsetStart += rawLine.length + 1;
  }
}

function lineNumberAt(source: string, offset: number): number {
  return source.slice(0, Math.max(0, offset)).split(/\r?\n/).length;
}

function columnNumberAt(source: string, offset: number): number {
  const before = source.slice(0, Math.max(0, offset));
  const lineStart = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')) + 1;
  return Math.max(0, offset - lineStart);
}

function contextPreview(source: string, offset: number, length: number, contextChars: number): string {
  const start = Math.max(0, offset - contextChars);
  const end = Math.min(source.length, offset + length + contextChars);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < source.length ? '...' : '';
  return `${prefix}${source.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

function linePreview(line: string, column: number, maxLineLength: number): string {
  const normalized = line.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLineLength) {
    return normalized;
  }

  const left = Math.max(0, column - Math.floor(maxLineLength / 2));
  const right = Math.min(line.length, left + maxLineLength);
  const preview = line.slice(left, right).replace(/\s+/g, ' ').trim();
  return `${left > 0 ? '...' : ''}${preview}${right < line.length ? '...' : ''}`;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...[truncated]` : value;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}
