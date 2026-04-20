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
      fixture: result.fixture,
      nextActions: result.nextActions,
      patch: result.patch,
      run: result.run,
      stopIf: result.stopIf,
      task: result.task,
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

  private patchLines(result: RebuildWorkflowResult): string[] {
    if (result.patch.suggestions.length === 0) {
      return ['- No patch suggestion was generated.'];
    }

    return result.patch.suggestions.map((suggestion) =>
      `- ${suggestion.patchType} ${suggestion.target} (confidence=${suggestion.confidence}): ${suggestion.reason}`
    );
  }
}
