import type { StealthRuntimeState } from '../stealth/StealthCoordinator.js';

export class StealthSubstrateReportBuilder {
  async build(
    state: StealthRuntimeState,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return {
        json: state as unknown as Record<string, unknown>
      };
    }
    return {
      markdown: this.toMarkdown(state)
    };
  }

  private toMarkdown(state: StealthRuntimeState): string {
    const lines = [
      '# JSAgent_mcp Stealth Substrate Report',
      '',
      '## Current Preset',
      '',
      `- ${state.presetId ?? '(none)'}`,
      '',
      '## Enabled Features',
      '',
      ...(state.enabledFeatures.length ? state.enabledFeatures.map((feature) => `- ${feature}`) : ['- none']),
      '',
      '## Runtime Notes',
      '',
      ...(state.notes?.map((note) => `- ${note}`) ?? ['- Stealth substrate uses preload coordination and does not replace browser ownership.']),
      '',
      '## AI / Browser Compatibility Notes',
      '',
      '- AI augmentation remains semantic-only and does not validate stealth success.',
      '- BrowserSessionManager remains the only browser/session owner.',
      '- This is not a full anti-detection matrix or site adapter.'
    ];
    return `${lines.join('\n')}\n`;
  }
}
