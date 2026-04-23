import type { AstSubstrateSnapshot } from '../ast-substrate/types.js';

export class AstSubstrateReportBuilder {
  async build(
    snapshot: AstSubstrateSnapshot,
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

  private toMarkdown(snapshot: AstSubstrateSnapshot): string {
    const lines = [
      '# JSAgent_mcp AST Substrate Report',
      '',
      '## Located Functions',
      '',
      ...functionLines(snapshot.locatedFunctions ?? []),
      '',
      '## Found References',
      '',
      ...referenceLines(snapshot.foundReferences ?? []),
      '',
      '## Rewrite Preview Summary',
      '',
      ...rewriteLines(snapshot.rewritePreviews ?? []),
      '',
      '## Notes',
      '',
      ...(snapshot.notes?.map((note) => `- ${note}`) ?? ['- AST substrate is bounded and AST-assisted; it is not SSA, taint, or a full callgraph platform.'])
    ];
    return `${lines.join('\n')}\n`;
  }
}

function functionLines(items: NonNullable<AstSubstrateSnapshot['locatedFunctions']>): string[] {
  if (items.length === 0) {
    return ['- none'];
  }
  return items.slice(0, 100).map((item) => `- ${item.scriptId}:${item.startLine}:${item.startColumn} ${item.kind} ${item.functionName ?? '(anonymous)'}`);
}

function referenceLines(items: NonNullable<AstSubstrateSnapshot['foundReferences']>): string[] {
  if (items.length === 0) {
    return ['- none'];
  }
  return items.slice(0, 140).map((item) => `- ${item.scriptId}:${item.lineNumber}:${item.columnNumber} ${item.kind} ${item.contextPreview}`);
}

function rewriteLines(items: NonNullable<AstSubstrateSnapshot['rewritePreviews']>): string[] {
  if (items.length === 0) {
    return ['- none'];
  }
  return items.slice(-20).map((item) => `- ${item.scriptId} ${item.rewriteKind} chars=${item.preview.length} truncated=${Boolean(item.truncated)}`);
}
