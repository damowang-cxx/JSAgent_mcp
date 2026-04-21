import type { DeliveryHardeningResult } from '../workflow/DeliveryHardeningRunner.js';

export class DeliveryReportBuilder {
  async build(
    result: DeliveryHardeningResult,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return {
        json: result as unknown as Record<string, unknown>
      };
    }

    return {
      markdown: `${[
        '# JSAgent_mcp Delivery Report',
        '',
        '## Bundle',
        '',
        `- ${result.bundle.outputDir}`,
        '',
        '## Provenance',
        '',
        `- ${result.bundle.provenanceFile}`,
        '',
        '## Regression',
        '',
        `- Delivery Gate Passed: ${result.deliveryGate.passed}`,
        '',
        '## Smoke Test',
        '',
        `- OK: ${result.smoke.ok}`,
        `- Hint: ${result.smoke.nextActionHint}`,
        '',
        '## Ready for Distribution',
        '',
        `- ${result.readyForDistribution}`
      ].join('\n')}\n`
    };
  }
}
