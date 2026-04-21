import type { FixtureCandidateResult } from '../fixture/types.js';

export class FixtureCandidateReportBuilder {
  async build(result: FixtureCandidateResult, format: 'json' | 'markdown'): Promise<{ json?: object; markdown?: string }> {
    const json = this.toJson(result);
    if (format === 'json') {
      return { json };
    }

    return { markdown: this.toMarkdown(result) };
  }

  private toJson(result: FixtureCandidateResult): Record<string, unknown> {
    return {
      basedOn: result.basedOn,
      excludedNoise: result.excludedNoise,
      expectedOutputs: result.expectedOutputs,
      fixtureId: result.fixtureId,
      inputs: result.inputs,
      notes: result.notes,
      pureUsageHints: result.pureUsageHints,
      rebuildUsageHints: result.rebuildUsageHints,
      scenario: result.scenario,
      targetName: result.targetName,
      validationAnchors: result.validationAnchors
    };
  }

  private toMarkdown(result: FixtureCandidateResult): string {
    const lines = [
      '# JSAgent_mcp Boundary Fixture Candidate Report',
      '',
      '## Target',
      '',
      `- Name: ${result.targetName}`,
      `- Fixture ID: ${result.fixtureId}`,
      '',
      '## Scenario',
      '',
      `- ${result.scenario ?? '(unknown)'}`,
      '',
      '## Based On',
      '',
      `- Helper Boundary: ${Boolean(result.basedOn.helperBoundary)}`,
      `- Dependency Window: ${Boolean(result.basedOn.dependencyWindow)}`,
      `- Probe Plan: ${Boolean(result.basedOn.probePlan)}`,
      `- Capture Result: ${Boolean(result.basedOn.captureResult)}`,
      `- Scenario Workflow: ${Boolean(result.basedOn.scenarioWorkflow)}`,
      '',
      '## Inputs',
      '',
      ...this.inputLines(result),
      '',
      '## Expected Outputs',
      '',
      ...this.outputLines(result),
      '',
      '## Validation Anchors',
      '',
      ...this.anchorLines(result),
      '',
      '## Excluded Noise',
      '',
      ...this.bulletLines(result.excludedNoise, 'No runtime noise exclusions were inferred.'),
      '',
      '## Rebuild Usage Hints',
      '',
      ...this.bulletLines(result.rebuildUsageHints, 'No rebuild usage hints were generated.'),
      '',
      '## Pure Usage Hints',
      '',
      ...this.bulletLines(result.pureUsageHints, 'No pure usage hints were generated.'),
      '',
      '## Notes',
      '',
      ...this.bulletLines(result.notes, 'No notes.')
    ];

    return `${lines.join('\n')}\n`;
  }

  private inputLines(result: FixtureCandidateResult): string[] {
    if (result.inputs.length === 0) {
      return ['- No fixture inputs were inferred.'];
    }

    return result.inputs
      .slice(0, 40)
      .map((input) => `- ${input.name} from ${input.source} required=${input.required} freshness=${input.preserveFreshness} confidence=${input.confidence} - ${input.reason}`);
  }

  private outputLines(result: FixtureCandidateResult): string[] {
    if (result.expectedOutputs.length === 0) {
      return ['- No expected outputs were inferred.'];
    }

    return result.expectedOutputs
      .slice(0, 40)
      .map((output) => `- ${output.name} -> ${output.target} confidence=${output.confidence} - ${output.reason}`);
  }

  private anchorLines(result: FixtureCandidateResult): string[] {
    if (result.validationAnchors.length === 0) {
      return ['- No validation anchors were inferred.'];
    }

    return result.validationAnchors
      .slice(0, 40)
      .map((anchor) => `- ${anchor.type}: ${anchor.value} - ${anchor.reason}`);
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }

    return values.slice(0, 40).map((value) => `- ${value}`);
  }
}
