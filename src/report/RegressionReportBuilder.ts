import type { RegressionRunResult } from '../regression/types.js';

export class RegressionReportBuilder {
  async build(
    result: RegressionRunResult,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return { json: result as unknown as Record<string, unknown> };
    }

    return {
      markdown: `${[
        '# JSAgent_mcp Regression Report',
        '',
        '## Baseline',
        '',
        `- Baseline: ${result.baselineId}`,
        `- Run: ${result.runId}`,
        '',
        '## Node Result',
        '',
        `- OK: ${result.node?.ok ?? false}`,
        '',
        '## Python Result',
        '',
        `- OK: ${result.python?.ok ?? '(none)'}`,
        '',
        '## Divergence',
        '',
        result.divergence
          ? `- ${result.divergence.layer} at ${result.divergence.path}: ${result.divergence.message}`
          : '- none',
        '',
        '## Next Action Hint',
        '',
        `- ${result.nextActionHint}`
      ].join('\n')}\n`
    };
  }
}
