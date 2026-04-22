import type { DeliveryContext } from '../delivery-consumption/types.js';

export class DeliveryContextReportBuilder {
  async build(
    result: DeliveryContext,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return {
        json: result as unknown as Record<string, unknown>
      };
    }

    return {
      markdown: `${[
        '# JSAgent_mcp Delivery Context Report',
        '',
        '## Regression Context',
        '',
        `- ${result.regressionContext?.contextId ?? '(none)'}`,
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
        '## AI Augmentation',
        '',
        `- ${formatValue(result.aiAugmentation)}`,
        '',
        '## Handoff Notes',
        '',
        ...result.handoffNotes.map((item) => `- ${item}`),
        '',
        '## Provenance Summary',
        '',
        ...result.provenanceSummary.map((item) => `- ${item}`),
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
