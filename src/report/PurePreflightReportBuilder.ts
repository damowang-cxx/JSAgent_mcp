import type { PurePreflightContext } from '../pure-preflight/types.js';

export class PurePreflightReportBuilder {
  async build(result: PurePreflightContext, format: 'json' | 'markdown'): Promise<{ json?: object; markdown?: string }> {
    if (format === 'json') {
      return { json: this.toJson(result) };
    }

    return { markdown: this.toMarkdown(result) };
  }

  private toJson(result: PurePreflightContext): Record<string, unknown> {
    return {
      contextId: result.contextId,
      excludedNoise: result.excludedNoise,
      expectedOutputs: result.expectedOutputs,
      nextActions: result.nextActions,
      preservedInputs: result.preservedInputs,
      pureNotes: result.pureNotes,
      source: result.source,
      stopIf: result.stopIf,
      usedBoundaryFixture: result.usedBoundaryFixture ?? null,
      usedCompareAnchor: result.usedCompareAnchor ?? null,
      usedFlowReasoning: result.usedFlowReasoning ?? null,
      usedPatchPreflight: result.usedPatchPreflight ?? null,
      usedRebuildContext: result.usedRebuildContext ?? null
    };
  }

  private toMarkdown(result: PurePreflightContext): string {
    const lines = [
      '# JSAgent_mcp Pure Preflight Report',
      '',
      '## Source',
      '',
      `- Context: ${result.contextId}`,
      `- Source: ${result.source}`,
      '',
      '## Boundary Fixture Used',
      '',
      result.usedBoundaryFixture
        ? `- ${result.usedBoundaryFixture.fixtureId} (${result.usedBoundaryFixture.targetName})`
        : '- No boundary fixture was used.',
      '',
      '## Compare Anchor Used',
      '',
      result.usedCompareAnchor
        ? `- ${result.usedCompareAnchor.label} (${result.usedCompareAnchor.kind}, ${result.usedCompareAnchor.anchorId})`
        : '- No compare anchor was used.',
      '',
      '## Patch Preflight Used',
      '',
      result.usedPatchPreflight
        ? `- ${result.usedPatchPreflight.surface}: ${result.usedPatchPreflight.target}`
        : '- No patch preflight focus was used.',
      '',
      '## Rebuild Context Used',
      '',
      result.usedRebuildContext
        ? `- ${result.usedRebuildContext.contextId} (${result.usedRebuildContext.fixtureSource})`
        : '- No rebuild context was used.',
      '',
      '## Flow Reasoning Used',
      '',
      result.usedFlowReasoning
        ? `- ${result.usedFlowReasoning.resultId} (${result.usedFlowReasoning.targetName})`
        : '- No flow reasoning result was used.',
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
      '## Pure Notes',
      '',
      ...this.bulletLines(result.pureNotes, 'No pure notes.'),
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

  private outputLines(outputs: PurePreflightContext['expectedOutputs']): string[] {
    if (outputs.length === 0) {
      return ['- No expected outputs available.'];
    }
    return outputs.slice(0, 60).map((output) => `- ${output.name} -> ${output.target}: ${output.reason}`);
  }

  private inputLines(inputs: PurePreflightContext['preservedInputs']): string[] {
    if (inputs.length === 0) {
      return ['- No preserved inputs available.'];
    }
    return inputs
      .slice(0, 60)
      .map((input) => `- ${input.name} freshness=${input.preserveFreshness}: ${input.reason}`);
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }
    return values.slice(0, 80).map((value) => `- ${value}`);
  }
}
