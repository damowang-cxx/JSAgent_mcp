import type { ScriptFindMatch, ScriptSummary, SourcePrecisionSnapshot, SourceSearchMatch } from '../source-intel/types.js';

export class SourcePrecisionReportBuilder {
  async build(
    snapshot: SourcePrecisionSnapshot,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return {
        json: snapshot as unknown as Record<string, unknown>
      };
    }

    return {
      markdown: this.toMarkdown(snapshot)
    };
  }

  private toMarkdown(snapshot: SourcePrecisionSnapshot): string {
    const lines = [
      '# JSAgent_mcp Source Precision Report',
      '',
      '## Script List Summary',
      '',
      ...this.scriptLines(snapshot.lastScriptList ?? []),
      '',
      '## Last Source Read',
      '',
      snapshot.lastSourceRead
        ? `- ${snapshot.lastSourceRead.scriptId} ${snapshot.lastSourceRead.url ?? '(inline)'} mode=${snapshot.lastSourceRead.mode} length=${snapshot.lastSourceRead.length ?? 0} truncated=${Boolean(snapshot.lastSourceRead.truncated)}`
        : '- none',
      '',
      '## Last In-Script Find',
      '',
      ...this.findLines(snapshot.lastFindResult ?? []),
      '',
      '## Last Cross-Script Search',
      '',
      ...this.searchLines(snapshot.lastSearchResult ?? []),
      '',
      '## Notes',
      '',
      ...(snapshot.notes?.map((note) => `- ${note}`) ?? ['- Source precision uses live selected-page Debugger.getScriptSource data before collected-code fallback paths.'])
    ];

    return `${lines.join('\n')}\n`;
  }

  private scriptLines(items: readonly ScriptSummary[]): string[] {
    if (items.length === 0) {
      return ['- none'];
    }

    return items.slice(0, 80).map((item) => {
      const url = item.url ?? '(inline/eval)';
      const length = item.lengthHint === null || item.lengthHint === undefined ? 'unknown' : String(item.lengthHint);
      return `- ${item.scriptId}: ${url} length=${length} inline=${Boolean(item.isInline)} evalLike=${Boolean(item.isEvalLike)}`;
    });
  }

  private findLines(items: readonly ScriptFindMatch[]): string[] {
    if (items.length === 0) {
      return ['- none'];
    }

    return items.slice(0, 80).map((item) => {
      const location = item.lineNumber !== undefined
        ? `${item.lineNumber}:${item.columnNumber ?? 0}`
        : `offset ${item.offset ?? 0}`;
      return `- #${item.occurrence} ${item.url ?? item.scriptId} @ ${location}: ${item.contextPreview}`;
    });
  }

  private searchLines(items: readonly SourceSearchMatch[]): string[] {
    if (items.length === 0) {
      return ['- none'];
    }

    return items.slice(0, 120).map((item) => {
      const location = item.lineNumber !== undefined
        ? `${item.lineNumber}:${item.columnNumber ?? 0}`
        : `offset ${item.offset ?? 0}`;
      return `- ${item.url ?? item.scriptId} @ ${location}: ${item.linePreview}`;
    });
  }
}
