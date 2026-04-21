import type { UpgradeWorkflowResult } from '../regression/types.js';

export class UpgradeReportBuilder {
  async build(
    result: UpgradeWorkflowResult,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return {
        json: result as unknown as Record<string, unknown>
      };
    }

    return {
      markdown: `${[
        '# JSAgent_mcp Upgrade Report',
        '',
        '## Version Label',
        '',
        `- ${result.baseline.label}`,
        '',
        '## Baseline',
        '',
        `- ${result.baseline.versionId}`,
        `- Based On: ${result.baseline.basedOnBaselineId ?? '(none)'}`,
        '',
        '## Regression',
        '',
        `- Matched: ${result.currentRegression?.matchedBaseline ?? false}`,
        '',
        '## Intermediate Regression',
        '',
        result.intermediateRegression
          ? `- Matched: ${result.intermediateRegression.matched}`
          : '- not run',
        '',
        '## First Divergence Layer',
        '',
        `- ${result.upgradeDiff.firstDivergence?.layer ?? '(none)'}`,
        '',
        '## Recommendation',
        '',
        `- ${result.upgradeDiff.recommendation}`
      ].join('\n')}\n`
    };
  }
}
