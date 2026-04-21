import type { ScenarioPatchHintSet } from '../patch/types.scenario.js';

export class ScenarioPatchHintReportBuilder {
  async build(result: ScenarioPatchHintSet, format: 'json' | 'markdown'): Promise<{ json?: object; markdown?: string }> {
    const json = this.toJson(result);
    if (format === 'json') {
      return { json };
    }

    return { markdown: this.toMarkdown(result) };
  }

  private toJson(result: ScenarioPatchHintSet): Record<string, unknown> {
    return {
      basedOn: result.basedOn,
      hints: result.hints,
      notes: result.notes,
      pureNextActions: result.pureNextActions,
      rebuildNextActions: result.rebuildNextActions,
      scenario: result.scenario,
      setId: result.setId,
      targetName: result.targetName
    };
  }

  private toMarkdown(result: ScenarioPatchHintSet): string {
    const lines = [
      '# JSAgent_mcp Scenario Patch Hint Report',
      '',
      '## Target',
      '',
      `- Name: ${result.targetName}`,
      `- Set ID: ${result.setId}`,
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
      `- Rebuild Workflow: ${Boolean(result.basedOn.rebuildWorkflow)}`,
      `- Patch Workflow: ${Boolean(result.basedOn.patchWorkflow)}`,
      '',
      '## Hints',
      '',
      ...this.hintLines(result),
      '',
      '## Rebuild Next Actions',
      '',
      ...this.bulletLines(result.rebuildNextActions, 'No rebuild next actions were generated.'),
      '',
      '## Pure Next Actions',
      '',
      ...this.bulletLines(result.pureNextActions, 'No pure next actions were generated.'),
      '',
      '## Notes',
      '',
      ...this.bulletLines(result.notes, 'No notes.')
    ];

    return `${lines.join('\n')}\n`;
  }

  private hintLines(result: ScenarioPatchHintSet): string[] {
    if (result.hints.length === 0) {
      return ['- No scenario patch hints were generated.'];
    }

    return result.hints
      .slice(0, 30)
      .flatMap((hint) => [
        `- ${hint.hintId}: ${hint.focus} (${hint.patchableSurface}, confidence=${hint.confidence})`,
        `  - Why: ${hint.why}`,
        `  - Suggested: ${hint.suggestedActions.join('; ') || '(none)'}`,
        `  - Stop If: ${hint.stopIf.join('; ') || '(none)'}`
      ]);
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }

    return values.slice(0, 40).map((value) => `- ${value}`);
  }
}
