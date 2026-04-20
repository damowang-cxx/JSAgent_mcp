import type { PatchIterationResult, PatchWorkflowResult } from '../patch/types.js';

export class PatchReportBuilder {
  async buildPatchIteration(
    result: PatchIterationResult,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return {
        json: this.iterationJson(result)
      };
    }

    return {
      markdown: this.iterationMarkdown(result)
    };
  }

  async buildPatchWorkflow(
    result: PatchWorkflowResult,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return {
        json: this.workflowJson(result)
      };
    }

    return {
      markdown: this.workflowMarkdown(result)
    };
  }

  private iterationJson(result: PatchIterationResult): Record<string, unknown> {
    return {
      appliedPatch: result.appliedPatch,
      bundle: result.bundle,
      comparison: result.comparison,
      divergenceProgress: result.divergenceProgress,
      iterationId: result.iterationId,
      nextActions: result.nextActions,
      patchPlan: result.patchPlan,
      run: result.run,
      stopIf: result.stopIf,
      whyTheseSteps: result.whyTheseSteps
    };
  }

  private workflowJson(result: PatchWorkflowResult): Record<string, unknown> {
    return {
      latestAcceptance: result.latestAcceptance,
      nextActions: result.nextActions,
      patchIterations: result.patchIterations,
      readyForPureExtraction: result.readyForPureExtraction,
      rebuild: result.rebuild,
      stability: result.stability,
      stopIf: result.stopIf,
      task: result.task,
      whyTheseSteps: result.whyTheseSteps
    };
  }

  private iterationMarkdown(result: PatchIterationResult): string {
    return `${[
      '# JSAgent_mcp Patch Iteration Report',
      '',
      '## Task / Target',
      '',
      `- Iteration: ${result.iterationId}`,
      `- Bundle: ${result.bundle.bundleDir}`,
      '',
      '## Current Rebuild State',
      '',
      `- Run OK: ${result.run.ok}`,
      `- Exit Code: ${result.run.exitCode}`,
      '',
      '## First Divergence',
      '',
      this.divergenceLine(result.comparison.divergence),
      '',
      '## Patch Applied',
      '',
      result.appliedPatch
        ? `- ${result.appliedPatch.patchType} ${result.appliedPatch.target}: ${result.appliedPatch.reason}`
        : '- No patch applied.',
      '',
      '## Divergence Progress',
      '',
      `- Resolved: ${result.divergenceProgress.resolved}`,
      `- Moved Forward: ${result.divergenceProgress.movedForward}`,
      `- Unchanged: ${result.divergenceProgress.unchanged}`,
      `- Worsened: ${result.divergenceProgress.worsened}`,
      '',
      '## Acceptance',
      '',
      '- Not recorded in a single iteration result.',
      '',
      '## Ready for Pure Extraction',
      '',
      '- Requires patch workflow readiness gate.',
      '',
      '## Next Actions',
      '',
      ...result.nextActions.map((item) => `- ${item}`)
    ].join('\n')}\n`;
  }

  private workflowMarkdown(result: PatchWorkflowResult): string {
    const latestIteration = result.patchIterations.at(-1) ?? null;
    return `${[
      '# JSAgent_mcp Patch Workflow Report',
      '',
      '## Task / Target',
      '',
      `- Task: ${result.task?.taskId ?? '(none)'}`,
      '',
      '## Current Rebuild State',
      '',
      result.rebuild
        ? `- Run OK: ${result.rebuild.run.ok}, Matched: ${result.rebuild.comparison.matched}`
        : '- No rebuild state recorded.',
      '',
      '## Fixture Stability',
      '',
      result.stability
        ? `- Stable: ${result.stability.stable}, Samples: ${result.stability.comparedSamples}, Mismatches: ${result.stability.mismatches.length}`
        : '- Not requested.',
      '',
      '## First Divergence',
      '',
      latestIteration ? this.divergenceLine(latestIteration.comparison.divergence) : '- No patch iteration recorded.',
      '',
      '## Patch Applied',
      '',
      latestIteration?.appliedPatch
        ? `- ${latestIteration.appliedPatch.patchType} ${latestIteration.appliedPatch.target}: ${latestIteration.appliedPatch.reason}`
        : '- No patch applied.',
      '',
      '## Divergence Progress',
      '',
      latestIteration
        ? `- Resolved: ${latestIteration.divergenceProgress.resolved}, Moved Forward: ${latestIteration.divergenceProgress.movedForward}, Worsened: ${latestIteration.divergenceProgress.worsened}`
        : '- No progress record.',
      '',
      '## Acceptance',
      '',
      result.latestAcceptance
        ? `- ${result.latestAcceptance.status} at ${result.latestAcceptance.recordedAt}`
        : '- No acceptance record.',
      '',
      '## Ready for Pure Extraction',
      '',
      `- ${result.readyForPureExtraction}`,
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

  private divergenceLine(divergence: PatchIterationResult['comparison']['divergence']): string {
    return divergence
      ? `- ${divergence.kind} at ${divergence.path}: ${divergence.message}`
      : '- No first divergence; comparison matched or resolved.';
  }
}
