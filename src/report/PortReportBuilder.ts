import type { PortWorkflowResult } from '../port/types.js';

export class PortReportBuilder {
  async build(
    result: PortWorkflowResult,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return {
        json: this.toJson(result)
      };
    }

    return {
      markdown: this.toMarkdown(result)
    };
  }

  private toJson(result: PortWorkflowResult): Record<string, unknown> {
    return {
      diff: result.diff,
      nextActions: result.nextActions,
      pure: result.pure,
      python: result.python,
      readyForSdkWrap: result.readyForSdkWrap,
      stopIf: result.stopIf,
      task: result.task,
      whyTheseSteps: result.whyTheseSteps
    };
  }

  private toMarkdown(result: PortWorkflowResult): string {
    return `${[
      '# JSAgent_mcp Port Report',
      '',
      '## Task',
      '',
      `- Task: ${result.task?.taskId ?? '(none)'}`,
      '',
      '## Node Pure Baseline',
      '',
      `- Entry: ${result.pure.node.entryFile}`,
      `- Verification OK: ${result.pure.verification.ok}`,
      result.pure.verification.divergence
        ? `- Divergence: ${result.pure.verification.divergence.kind} at ${result.pure.verification.divergence.path}`
        : '- Divergence: none',
      '',
      '## Python Pure Scaffold',
      '',
      `- Entry: ${result.python.scaffold.entryFile}`,
      `- Impl: ${result.python.scaffold.implFile}`,
      '',
      '## Verification',
      '',
      `- OK: ${result.python.verification.ok}`,
      result.python.verification.divergence
        ? `- Divergence: ${result.python.verification.divergence.kind} at ${result.python.verification.divergence.path}: ${result.python.verification.divergence.message}`
        : '- Divergence: none',
      '',
      '## Cross-Language Diff',
      '',
      `- Matched: ${result.diff.matched}`,
      `- Unchanged: ${result.diff.unchangedParts.join(', ') || '(none)'}`,
      `- Changed: ${result.diff.changedParts.join(', ') || '(none)'}`,
      `- Next Action Hint: ${result.diff.nextActionHint}`,
      '',
      '## Ready for SDK Wrap',
      '',
      `- ${result.readyForSdkWrap}`,
      '',
      '## Next Actions',
      '',
      ...result.nextActions.map((item) => `- ${item}`),
      '',
      '## Why These Steps',
      '',
      ...result.whyTheseSteps.map((item) => `- ${item}`),
      '',
      '## Stop If',
      '',
      ...result.stopIf.map((item) => `- ${item}`)
    ].join('\n')}\n`;
  }
}
