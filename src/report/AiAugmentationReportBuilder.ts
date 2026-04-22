import type { AiAugmentationResult, AiSourceArtifact } from '../ai/types.js';

export class AiAugmentationReportBuilder {
  async build(result: AiAugmentationResult, format: 'json' | 'markdown'): Promise<{ json?: object; markdown?: string }> {
    if (format === 'json') {
      return { json: this.toJson(result) };
    }

    return { markdown: this.toMarkdown(result) };
  }

  private toJson(result: AiAugmentationResult): Record<string, unknown> {
    return {
      augmentationId: result.augmentationId,
      basedOn: result.basedOn,
      cautions: result.cautions,
      explanation: result.explanation,
      mode: result.mode,
      modelName: result.modelName ?? null,
      nextActions: result.nextActions,
      notes: result.notes,
      providerAvailable: result.providerAvailable,
      providerName: result.providerName ?? null
    };
  }

  private toMarkdown(result: AiAugmentationResult): string {
    const lines = [
      '# JSAgent_mcp AI Augmentation Report',
      '',
      '## Mode',
      '',
      `- Augmentation: ${result.augmentationId}`,
      `- Mode: ${result.mode}`,
      '',
      '## Provider',
      '',
      `- Available: ${result.providerAvailable}`,
      `- Provider: ${result.providerName ?? '(none)'}`,
      `- Model: ${result.modelName ?? '(none)'}`,
      '',
      '## Based On',
      '',
      ...this.artifactLines(result.basedOn),
      '',
      '## Explanation',
      '',
      result.explanation || '(no explanation)',
      '',
      '## Cautions',
      '',
      ...this.bulletLines(result.cautions, 'No cautions.'),
      '',
      '## Next Actions',
      '',
      ...this.bulletLines(result.nextActions, 'No next actions.'),
      '',
      '## Notes',
      '',
      ...this.bulletLines(result.notes, 'No notes.')
    ];

    return `${lines.join('\n')}\n`;
  }

  private artifactLines(artifacts: readonly AiSourceArtifact[]): string[] {
    if (artifacts.length === 0) {
      return ['- No deterministic artifacts were available.'];
    }

    return artifacts.slice(0, 20).map((artifact) =>
      `- ${artifact.kind}${artifact.id ? ` (${artifact.id})` : ''}: ${artifact.summary.replace(/\s+/g, ' ').slice(0, 500)}`
    );
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }
    return values.slice(0, 60).map((value) => `- ${value}`);
  }
}
