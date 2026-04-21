import type {
  DebuggerCallFrameDetail,
  DebuggerCorrelationHint,
  DebuggerReportInput,
  DebuggerScopeSummary,
  ManagedBreakpoint
} from './types.js';

export class DebuggerReportBuilder {
  async build(input: DebuggerReportInput, format: 'json' | 'markdown'): Promise<{ json?: object; markdown?: string }> {
    if (format === 'json') {
      return { json: this.toJson(input) };
    }

    return { markdown: this.toMarkdown(input) };
  }

  private toJson(input: DebuggerReportInput): Record<string, unknown> {
    return {
      breakpoints: input.breakpoints,
      callFrames: input.callFrames,
      correlations: input.correlations,
      notes: input.notes,
      pausedState: input.pausedState
    };
  }

  private toMarkdown(input: DebuggerReportInput): string {
    const lines = [
      '# JSAgent_mcp Debugger Inspection Report',
      '',
      '## Breakpoints',
      '',
      ...this.breakpointLines(input.breakpoints),
      '',
      '## Paused State',
      '',
      `- Paused: ${input.pausedState.isPaused}`,
      `- Reason: ${input.pausedState.reason ?? '(none)'}`,
      `- Hit Breakpoints: ${input.pausedState.hitBreakpoints.length > 0 ? input.pausedState.hitBreakpoints.join(', ') : '(none)'}`,
      `- Top Frame: ${input.pausedState.topFrame ? this.frameLabel(input.pausedState.topFrame) : '(none)'}`,
      '',
      '## Call Frames',
      '',
      ...this.callFrameLines(input.callFrames),
      '',
      '## Scope Variables Summary',
      '',
      ...this.scopeLines(input.callFrames),
      '',
      '## Correlation Hints',
      '',
      ...this.correlationLines(input.correlations),
      '',
      '## Notes',
      '',
      ...this.bulletLines(input.notes, 'No notes.')
    ];

    return `${lines.join('\n')}\n`;
  }

  private breakpointLines(items: readonly ManagedBreakpoint[]): string[] {
    if (items.length === 0) {
      return ['- No debugger breakpoints are currently managed.'];
    }

    return items
      .slice(0, 60)
      .map((item) => `- ${item.breakpointId}: ${item.url}:${item.lineNumber}:${item.columnNumber} source=${item.source}`);
  }

  private callFrameLines(items: readonly DebuggerCallFrameDetail[]): string[] {
    if (items.length === 0) {
      return ['- No paused call frames are available.'];
    }

    return items
      .slice(0, 60)
      .map((frame, index) => `- #${index} ${this.frameLabel(frame)} callFrameId=${frame.callFrameId || '(missing)'}`);
  }

  private scopeLines(items: readonly DebuggerCallFrameDetail[]): string[] {
    const lines: string[] = [];
    for (const [index, frame] of items.entries()) {
      for (const scope of frame.scopes ?? []) {
        lines.push(`- Frame #${index} ${scope.type}${scope.name ? ` ${scope.name}` : ''}: ${scope.variables.length} variables`);
        lines.push(...this.scopeVariableLines(scope).map((line) => `  ${line}`));
      }
    }

    return lines.length > 0 ? lines.slice(0, 120) : ['- No scope variables were captured in the latest inspection snapshot.'];
  }

  private scopeVariableLines(scope: DebuggerScopeSummary): string[] {
    if (scope.variables.length === 0) {
      return ['- No variables captured.'];
    }

    return scope.variables
      .slice(0, 20)
      .map((variable) => `- ${variable.name}: ${variable.valueType} = ${variable.preview}${variable.truncated ? ' [truncated]' : ''}`);
  }

  private correlationLines(items: readonly DebuggerCorrelationHint[]): string[] {
    if (items.length === 0) {
      return ['- No debugger correlation hints were inferred.'];
    }

    return items
      .slice(0, 40)
      .map((hint) => `- ${hint.kind}: ${hint.value} confidence=${hint.confidence} - ${hint.reason}`);
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }

    return values.slice(0, 40).map((value) => `- ${value}`);
  }

  private frameLabel(frame: { functionName: string; url?: string; scriptId?: string; lineNumber: number; columnNumber: number }): string {
    return `${frame.functionName || '(anonymous)'} @ ${frame.url ?? frame.scriptId ?? '(unknown script)'}:${frame.lineNumber}:${frame.columnNumber}`;
  }
}
