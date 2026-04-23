import type {
  DebuggerFinishingSnapshot,
  DebugTargetSummary,
  WatchExpressionRecord,
  WatchExpressionValue
} from '../debugger/types.js';

export class DebuggerFinishingReportBuilder {
  async build(
    snapshot: DebuggerFinishingSnapshot,
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

  private toMarkdown(snapshot: DebuggerFinishingSnapshot): string {
    const lines = [
      '# JSAgent_mcp Debugger Finishing Report',
      '',
      '## Exception Breakpoint Mode',
      '',
      `- ${snapshot.exceptionBreakpointMode ?? 'none'}`,
      '',
      '## Watch Expressions',
      '',
      ...this.watchLines(snapshot.watchExpressions ?? []),
      '',
      '## Last Watch Values',
      '',
      ...this.watchValueLines(snapshot.lastWatchValues ?? []),
      '',
      '## Debug Targets',
      '',
      ...this.targetLines(snapshot.lastDebugTargets ?? []),
      '',
      '## Current Debug Target',
      '',
      `- ${snapshot.currentDebugTargetId ?? '(selected page default)'}`,
      '',
      '## Notes',
      '',
      ...(snapshot.notes?.map((note) => `- ${note}`) ?? ['- Debugger finishing is a precise fallback after hooks, replay, scenario, boundary, and source precision evidence.'])
    ];

    return `${lines.join('\n')}\n`;
  }

  private watchLines(items: readonly WatchExpressionRecord[]): string[] {
    if (items.length === 0) {
      return ['- none'];
    }
    return items.slice(0, 80).map((item) => `- ${item.watchId}: enabled=${item.enabled} ${item.expression}`);
  }

  private watchValueLines(items: readonly WatchExpressionValue[]): string[] {
    if (items.length === 0) {
      return ['- none'];
    }
    return items.slice(0, 80).map((item) => {
      if (!item.ok) {
        return `- ${item.watchId}: ERROR ${item.error ?? 'evaluation failed'} (${item.expression})`;
      }
      return `- ${item.watchId}: ${item.valueType ?? 'unknown'} = ${item.preview ?? '(no preview)'} (${item.expression})`;
    });
  }

  private targetLines(items: readonly DebugTargetSummary[]): string[] {
    if (items.length === 0) {
      return ['- none'];
    }
    return items.slice(0, 80).map((item) => {
      const flags = [
        item.isSelectedPage ? 'selected-page' : null,
        item.isCurrentDebuggerTarget ? 'current-debugger-target' : null
      ].filter(Boolean).join(', ');
      return `- ${item.targetId}: ${item.kind} ${item.url ?? '(no url)'}${flags ? ` [${flags}]` : ''}`;
    });
  }
}
