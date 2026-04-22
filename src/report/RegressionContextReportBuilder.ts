import type { RegressionContext } from '../delivery-consumption/types.js';

export class RegressionContextReportBuilder {
  async build(
    result: RegressionContext,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return {
        json: result as unknown as Record<string, unknown>
      };
    }

    return {
      markdown: `${[
        '# JSAgent_mcp Regression Context Report',
        '',
        '## Baseline',
        '',
        `- ${result.baselineId ?? '(none)'}`,
        '',
        '## Compare Anchor',
        '',
        `- ${formatValue(result.compareAnchor)}`,
        '',
        '## Patch Preflight',
        '',
        `- ${formatValue(result.patchPreflight)}`,
        '',
        '## Rebuild Context',
        '',
        `- ${formatValue(result.rebuildContext)}`,
        '',
        '## Pure Preflight',
        '',
        `- ${formatValue(result.purePreflight)}`,
        '',
        '## Flow Reasoning',
        '',
        `- ${formatValue(result.flowReasoning)}`,
        '',
        '## Regression Notes',
        '',
        ...result.regressionNotes.map((item) => `- ${item}`),
        '',
        '## Next Actions',
        '',
        ...result.nextActions.map((item) => `- ${item}`),
        '',
        '## Stop If',
        '',
        ...result.stopIf.map((item) => `- ${item}`)
      ].join('\n')}\n`
    };
  }
}

function formatValue(value: unknown): string {
  return value ? JSON.stringify(value) : '(none)';
}
