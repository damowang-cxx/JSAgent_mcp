import type { PureExtractionResult } from '../pure/types.js';

export class PureReportBuilder {
  async build(
    result: PureExtractionResult,
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

  private toJson(result: PureExtractionResult): Record<string, unknown> {
    return {
      boundary: result.boundary,
      fixture: result.fixture,
      frozenSample: result.frozenSample,
      nextActions: result.nextActions,
      nodePure: result.nodePure,
      readyForPort: result.readyForPort,
      runtimeTrace: result.runtimeTrace,
      stopIf: result.stopIf,
      task: result.task,
      verification: result.verification,
      whyTheseSteps: result.whyTheseSteps
    };
  }

  private toMarkdown(result: PureExtractionResult): string {
    return `${[
      '# JSAgent_mcp PureExtraction Report',
      '',
      '## Task / Target',
      '',
      `- Task: ${result.task?.taskId ?? '(none)'}`,
      `- Page: ${result.frozenSample.page.url}`,
      '',
      '## Frozen Sample',
      '',
      `- Source: ${result.frozenSample.source}`,
      `- Acceptance: ${result.frozenSample.acceptance?.status ?? '(none)'}`,
      `- Hook Samples: ${result.frozenSample.hookSamples.length}`,
      '',
      '## Runtime Trace Summary',
      '',
      result.runtimeTrace
        ? `- Records: ${result.runtimeTrace.records.length}, Warnings: ${result.runtimeTrace.warnings.length}`
        : '- No runtime trace was exported.',
      '',
      '## Pure Boundary',
      '',
      `- Explicit Inputs: ${result.boundary.explicitInputs.join(', ') || '(none)'}`,
      `- Derived Inputs: ${result.boundary.derivedInputs.join(', ') || '(none)'}`,
      `- Environment State: ${result.boundary.environmentState.join(', ') || '(none)'}`,
      `- Outputs: ${result.boundary.outputs.join(', ') || '(none)'}`,
      '',
      '## Fixture',
      '',
      `- Expected Output Type: ${typeof result.fixture.expectedOutput}`,
      `- Notes: ${result.fixture.notes.join(' | ')}`,
      '',
      '## Node Pure Scaffold',
      '',
      `- Output Dir: ${result.nodePure.outputDir}`,
      `- Entry File: ${result.nodePure.entryFile}`,
      '',
      '## Verification',
      '',
      `- OK: ${result.verification.ok}`,
      result.verification.divergence
        ? `- Divergence: ${result.verification.divergence.kind} at ${result.verification.divergence.path}: ${result.verification.divergence.message}`
        : '- Divergence: none',
      '',
      '## Ready for Port',
      '',
      `- ${result.readyForPort}`,
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
    ].join('\n')}\n`;
  }
}
