import type {
  EventMonitorRecord,
  EventOccurrence,
  FunctionHookRecord,
  FunctionScalpelSnapshot,
  FunctionTraceRecord,
  ObjectInspectionResult
} from '../function-scalpel/types.js';

export class FunctionScalpelReportBuilder {
  async build(
    snapshot: FunctionScalpelSnapshot,
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

  private toMarkdown(snapshot: FunctionScalpelSnapshot): string {
    const lines = [
      '# JSAgent_mcp Function Scalpel Report',
      '',
      '## Hooks',
      '',
      ...this.hookLines(snapshot.hooks ?? []),
      '',
      '## Recent Traces',
      '',
      ...this.traceLines(snapshot.traces ?? []),
      '',
      '## Object Inspections',
      '',
      ...this.inspectionLines(snapshot.inspections ?? []),
      '',
      '## Event Monitors',
      '',
      ...this.monitorLines(snapshot.monitors ?? []),
      '',
      '## Event Occurrences',
      '',
      ...this.eventLines(snapshot.events ?? []),
      '',
      '## Notes',
      '',
      ...(snapshot.notes?.map((note) => `- ${note}`) ?? ['- Function scalpel tools are hook-preferred micro-operations, not a full instrumentation platform.'])
    ];

    return `${lines.join('\n')}\n`;
  }

  private hookLines(items: readonly FunctionHookRecord[]): string[] {
    if (items.length === 0) {
      return ['- none'];
    }
    return items.slice(0, 80).map((item) => `- ${item.hookId}: ${item.mode} ${item.targetExpression} enabled=${item.enabled}`);
  }

  private traceLines(items: readonly FunctionTraceRecord[]): string[] {
    if (items.length === 0) {
      return ['- none'];
    }
    return items.slice(-120).map((item) => {
      const status = item.error ? `ERROR ${item.error}` : 'ok';
      return `- ${item.calledAt} ${item.hookId} ${item.targetExpression}: ${status}`;
    });
  }

  private inspectionLines(items: readonly ObjectInspectionResult[]): string[] {
    if (items.length === 0) {
      return ['- none'];
    }
    return items.slice(-40).map((item) => `- ${item.inspectedAt} ${item.targetExpression}: ${item.preview} (${item.properties.length} properties)`);
  }

  private monitorLines(items: readonly EventMonitorRecord[]): string[] {
    if (items.length === 0) {
      return ['- none'];
    }
    return items.slice(0, 80).map((item) => `- ${item.monitorId}: ${item.target}${item.selector ? ` ${item.selector}` : ''} ${item.eventType} enabled=${item.enabled}`);
  }

  private eventLines(items: readonly EventOccurrence[]): string[] {
    if (items.length === 0) {
      return ['- none'];
    }
    return items.slice(-120).map((item) => `- ${item.firedAt} ${item.monitorId} ${item.eventType} ${item.targetSummary ?? ''}`);
  }
}
