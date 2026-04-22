import type { RebuildContext } from '../rebuild-integration/types.js';

export class RebuildContextReportBuilder {
  async build(result: RebuildContext, format: 'json' | 'markdown'): Promise<{ json?: object; markdown?: string }> {
    if (format === 'json') {
      return { json: this.toJson(result) };
    }

    return { markdown: this.toMarkdown(result) };
  }

  private toJson(result: RebuildContext): Record<string, unknown> {
    return {
      contextId: result.contextId,
      excludedNoise: result.excludedNoise,
      expectedOutputs: result.expectedOutputs,
      fixtureSource: result.fixtureSource,
      nextActions: result.nextActions,
      preservedInputs: result.preservedInputs,
      rebuildNotes: result.rebuildNotes,
      stopIf: result.stopIf,
      usedBoundaryFixture: result.usedBoundaryFixture ?? null,
      usedCompareAnchor: result.usedCompareAnchor ?? null,
      usedPatchPreflight: result.usedPatchPreflight ?? null
    };
  }

  private toMarkdown(result: RebuildContext): string {
    const lines = [
      '# JSAgent_mcp Rebuild Context Report',
      '',
      '## Fixture Source',
      '',
      `- Context: ${result.contextId}`,
      `- Source: ${result.fixtureSource}`,
      `- Boundary Fixture: ${result.usedBoundaryFixture ? `${result.usedBoundaryFixture.fixtureId} (${result.usedBoundaryFixture.targetName})` : '(none)'}`,
      '',
      '## Compare Anchor Used',
      '',
      result.usedCompareAnchor
        ? `- ${result.usedCompareAnchor.label} (${result.usedCompareAnchor.kind}, ${result.usedCompareAnchor.compareStrategy})`
        : '- No compare anchor was available.',
      '',
      '## Patch Preflight Used',
      '',
      result.usedPatchPreflight
        ? `- ${result.usedPatchPreflight.surface}: ${result.usedPatchPreflight.target}`
        : '- No patch preflight focus was available.',
      '',
      '## Expected Outputs',
      '',
      ...this.outputLines(result.expectedOutputs),
      '',
      '## Preserved Inputs',
      '',
      ...this.inputLines(result.preservedInputs),
      '',
      '## Excluded Noise',
      '',
      ...this.bulletLines(result.excludedNoise, 'No excluded noise recorded.'),
      '',
      '## Rebuild Notes',
      '',
      ...this.bulletLines(result.rebuildNotes, 'No rebuild notes.'),
      '',
      '## Next Actions',
      '',
      ...this.bulletLines(result.nextActions, 'No next actions.'),
      '',
      '## Stop If',
      '',
      ...this.bulletLines(result.stopIf, 'No stop conditions.')
    ];

    return `${lines.join('\n')}\n`;
  }

  private outputLines(outputs: RebuildContext['expectedOutputs']): string[] {
    if (outputs.length === 0) {
      return ['- No expected outputs available.'];
    }
    return outputs.slice(0, 40).map((output) => `- ${output.name} -> ${output.target}: ${output.reason}`);
  }

  private inputLines(inputs: RebuildContext['preservedInputs']): string[] {
    if (inputs.length === 0) {
      return ['- No preserved inputs available.'];
    }
    return inputs
      .slice(0, 40)
      .map((input) => `- ${input.name} freshness=${input.preserveFreshness}: ${input.reason}`);
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }
    return values.slice(0, 60).map((value) => `- ${value}`);
  }
}
