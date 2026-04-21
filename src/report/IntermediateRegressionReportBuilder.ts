import type { IntermediateRegressionResult } from '../regression/types.js';

export class IntermediateRegressionReportBuilder {
  async build(
    result: IntermediateRegressionResult,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return {
        json: result as unknown as Record<string, unknown>
      };
    }

    const keys = Array.from(new Set([
      ...Object.keys(result.nodeIntermediates ?? {}),
      ...Object.keys(result.pythonIntermediates ?? {})
    ])).sort();
    return {
      markdown: `${[
        '# JSAgent_mcp Intermediate Regression Report',
        '',
        '## Baseline',
        '',
        `- ${result.baselineId}`,
        '',
        '## Intermediate Keys',
        '',
        `- ${keys.join(', ') || '(none)'}`,
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
