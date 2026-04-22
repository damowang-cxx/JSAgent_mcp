import type { RebuildWorkflowResult } from '../rebuild/types.js';

export class RebuildReportBuilder {
  async build(
    result: RebuildWorkflowResult,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return {
        json: this.toJson(result)
      };
    }

    return {
      markdown: this.toMarkdown(result)
    };
  }

  private toJson(result: RebuildWorkflowResult): Record<string, unknown> {
      return {
        bundle: result.bundle,
        comparison: result.comparison,
        contextUsed: result.contextUsed ?? null,
        excludedNoise: result.excludedNoise ?? [],
        expectedOutputs: result.expectedOutputs ?? [],
        expectedOutputsSource: result.expectedOutputsSource ?? null,
        fixture: result.fixture,
        nextActions: result.nextActions,
        patch: result.patch,
        preservedInputs: result.preservedInputs ?? [],
        preservedInputsSource: result.preservedInputsSource ?? null,
        run: result.run,
        stopIf: result.stopIf,
        task: result.task,
        usedCompareAnchor: result.usedCompareAnchor ?? null,
        usedPatchPreflight: result.usedPatchPreflight ?? null,
        whyTheseSteps: result.whyTheseSteps
      };
  }

  private toMarkdown(result: RebuildWorkflowResult): string {
    const divergence = result.comparison.divergence;
    const lines = [
      '# JSAgent_mcp Rebuild Report',
      '',
      '## Target / Task',
      '',
      `- Task: ${result.task?.taskId ?? '(none)'}`,
      `- Fixture Source: ${result.fixture?.source ?? '(none)'}`,
      `- Page: ${result.fixture?.page.url ?? '(unknown)'}`,
      `- Rebuild Context: ${result.contextUsed?.contextId ?? '(none)'}`,
      `- Context Fixture Source: ${result.contextUsed?.fixtureSource ?? '(none)'}`,
      '',
      '## Reverse Context',
      '',
      `- Compare Anchor: ${result.usedCompareAnchor ? `${result.usedCompareAnchor.label} (${result.usedCompareAnchor.kind})` : '(none)'}`,
      `- Patch Preflight: ${result.usedPatchPreflight ? `${result.usedPatchPreflight.surface}:${result.usedPatchPreflight.target}` : '(none)'}`,
      `- Expected Outputs Source: ${result.expectedOutputsSource ?? '(none)'}`,
      `- Preserved Inputs Source: ${result.preservedInputsSource ?? '(none)'}`,
      ...this.contextLines(result),
      '',
      '## Bundle',
      '',
      `- Bundle Dir: ${result.bundle.bundleDir}`,
      `- Entry File: ${result.bundle.entryFile}`,
      `- Target Files: ${result.bundle.targetFiles.length}`,
      ...result.bundle.warnings.map((warning) => `- Warning: ${warning}`),
      '',
      '## Run Result',
      '',
      `- OK: ${result.run.ok}`,
      `- Exit Code: ${result.run.exitCode}`,
      `- Duration: ${result.run.durationMs}ms`,
      `- Env Access: ${result.run.envAccessSummary?.total ?? 0}`,
      '',
      '## First Divergence',
      '',
      divergence
        ? `- ${divergence.kind} at ${divergence.path}: ${divergence.message}`
        : `- Matched: ${result.comparison.matched}`,
      '',
      '## Patch Suggestions',
      '',
      ...this.patchLines(result),
      '',
      '## Next Actions',
      '',
      ...result.nextActions.map((item) => `- ${item}`),
      '',
      '## Why These Steps',
      '',
      ...result.whyTheseSteps.map((item) => `- ${item}`),
      '',
      '## Stop If',
      '',
      ...result.stopIf.map((item) => `- ${item}`)
    ];

    return `${lines.join('\n')}\n`;
  }

  private contextLines(result: RebuildWorkflowResult): string[] {
    const outputs = result.expectedOutputs ?? [];
    const inputs = result.preservedInputs ?? [];
    const noise = result.excludedNoise ?? [];
    return [
      `- Expected Outputs: ${outputs.length}`,
      ...outputs.slice(0, 10).map((output) => `  - ${output.name} -> ${output.target}: ${output.reason}`),
      `- Preserved Inputs: ${inputs.length}`,
      ...inputs.slice(0, 10).map((input) => `  - ${input.name} freshness=${input.preserveFreshness}: ${input.reason}`),
      `- Excluded Noise: ${noise.length}`,
      ...noise.slice(0, 6).map((item) => `  - ${item}`)
    ];
  }

  private patchLines(result: RebuildWorkflowResult): string[] {
    if (result.patch.suggestions.length === 0) {
      return ['- No patch suggestion was generated.'];
    }

    return result.patch.suggestions.map((suggestion) =>
      `- ${suggestion.patchType} ${suggestion.target} (confidence=${suggestion.confidence}): ${suggestion.reason}`
    );
  }
}
