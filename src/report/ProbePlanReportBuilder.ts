import type { ProbePlan } from '../probe/types.js';

export class ProbePlanReportBuilder {
  async build(result: ProbePlan, format: 'json' | 'markdown'): Promise<{ json?: object; markdown?: string }> {
    const json = this.toJson(result);
    if (format === 'json') {
      return { json };
    }

    return { markdown: this.toMarkdown(result) };
  }

  private toJson(result: ProbePlan): Record<string, unknown> {
    return {
      basedOn: result.basedOn,
      fixtureHints: result.fixtureHints,
      hookHints: result.hookHints,
      nextActions: result.nextActions,
      notes: result.notes,
      planId: result.planId,
      priority: result.priority,
      scenario: result.scenario,
      steps: result.steps,
      stopIf: result.stopIf,
      targetName: result.targetName,
      validationChecks: result.validationChecks
    };
  }

  private toMarkdown(result: ProbePlan): string {
    const lines = [
      '# JSAgent_mcp Scenario Probe Plan',
      '',
      '## Target',
      '',
      `- Name: ${result.targetName}`,
      `- Plan ID: ${result.planId}`,
      `- Priority: ${result.priority}`,
      '',
      '## Scenario',
      '',
      `- ${result.scenario ?? '(unknown)'}`,
      '',
      '## Based On',
      '',
      `- Scenario Workflow: ${Boolean(result.basedOn.scenarioWorkflow)}`,
      `- Capture Result: ${Boolean(result.basedOn.captureResult)}`,
      `- Helper Boundary: ${Boolean(result.basedOn.helperBoundary)}`,
      `- Dependency Window: ${Boolean(result.basedOn.dependencyWindow)}`,
      '',
      '## Steps',
      '',
      ...this.stepLines(result),
      '',
      '## Fixture Hints',
      '',
      ...this.bulletLines(result.fixtureHints, 'No fixture hints were generated.'),
      '',
      '## Hook Hints',
      '',
      ...this.bulletLines(result.hookHints, 'No hook hints were generated.'),
      '',
      '## Validation Checks',
      '',
      ...this.bulletLines(result.validationChecks, 'No validation checks were generated.'),
      '',
      '## Next Actions',
      '',
      ...this.bulletLines(result.nextActions, 'No next actions were generated.'),
      '',
      '## Stop If',
      '',
      ...this.bulletLines(result.stopIf, 'No stop conditions were generated.'),
      '',
      '## Notes',
      '',
      ...this.bulletLines(result.notes, 'No notes.')
    ];

    return `${lines.join('\n')}\n`;
  }

  private stepLines(result: ProbePlan): string[] {
    if (result.steps.length === 0) {
      return ['- No probe steps were generated.'];
    }

    return result.steps
      .slice(0, 30)
      .map((step, index) => `- ${index + 1}. ${step.step} - ${step.purpose}${step.stopIf ? ` Stop if: ${step.stopIf}` : ''}`);
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }

    return values.slice(0, 40).map((value) => `- ${value}`);
  }
}
