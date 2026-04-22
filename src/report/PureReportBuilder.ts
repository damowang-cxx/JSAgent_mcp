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
      excludedNoiseSource: result.excludedNoiseSource,
      expectedOutputsSource: result.expectedOutputsSource,
      preservedInputsSource: result.preservedInputsSource,
      purePreflightUsed: result.purePreflightUsed ?? null,
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
      `- Pure Preflight: ${result.purePreflightUsed?.contextId ?? '(none)'}`,
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
      `- Expected Outputs Source: ${result.expectedOutputsSource ?? 'legacy pure workflow expected outputs'}`,
      `- Preserved Inputs Source: ${result.preservedInputsSource ?? 'legacy pure workflow preserved inputs'}`,
      `- Excluded Noise Source: ${result.excludedNoiseSource ?? 'legacy pure workflow excluded noise'}`,
      '',
      '## Pure Preflight Provenance',
      '',
      result.purePreflightUsed
        ? `- Source: ${result.purePreflightUsed.source}`
        : '- No pure preflight context was attached.',
      result.purePreflightUsed?.usedBoundaryFixture
        ? `- Boundary Fixture: ${result.purePreflightUsed.usedBoundaryFixture.fixtureId} (${result.purePreflightUsed.usedBoundaryFixture.targetName})`
        : '- Boundary Fixture: (none)',
      result.purePreflightUsed?.usedCompareAnchor
        ? `- Compare Anchor: ${result.purePreflightUsed.usedCompareAnchor.label} (${result.purePreflightUsed.usedCompareAnchor.kind})`
        : '- Compare Anchor: (none)',
      result.purePreflightUsed?.usedPatchPreflight
        ? `- Patch Preflight: ${result.purePreflightUsed.usedPatchPreflight.surface}:${result.purePreflightUsed.usedPatchPreflight.target}`
        : '- Patch Preflight: (none)',
      result.purePreflightUsed?.usedRebuildContext
        ? `- Rebuild Context: ${result.purePreflightUsed.usedRebuildContext.contextId} (${result.purePreflightUsed.usedRebuildContext.fixtureSource})`
        : '- Rebuild Context: (none)',
      result.purePreflightUsed?.usedFlowReasoning
        ? `- Flow Reasoning: ${result.purePreflightUsed.usedFlowReasoning.resultId} (${result.purePreflightUsed.usedFlowReasoning.targetName})`
        : '- Flow Reasoning: (none)',
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
