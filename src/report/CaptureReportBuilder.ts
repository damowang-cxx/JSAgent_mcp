import type { ReplayRecipeResult } from '../replay/types.js';

export class CaptureReportBuilder {
  async build(result: ReplayRecipeResult, format: 'json' | 'markdown'): Promise<{ json?: object; markdown?: string }> {
    const json = this.toJson(result);
    if (format === 'json') {
      return { json };
    }

    return {
      markdown: this.toMarkdown(result)
    };
  }

  private toJson(result: ReplayRecipeResult): Record<string, unknown> {
    return {
      evidenceWritten: result.evidenceWritten,
      executedSteps: result.executedSteps,
      hookSummary: result.hookSummary,
      nextActions: result.nextActions,
      notes: result.notes,
      observedRequests: result.observedRequests,
      preset: result.preset,
      scenarioResult: result.scenarioResult,
      stopIf: result.stopIf,
      suspiciousRequests: result.suspiciousRequests,
      task: result.task
    };
  }

  private toMarkdown(result: ReplayRecipeResult): string {
    const lines = [
      '# JSAgent_mcp Capture Report',
      '',
      '## Preset',
      '',
      `- ID: ${result.preset.presetId}`,
      ...(result.preset.scenario ? [`- Scenario: ${result.preset.scenario}`] : []),
      `- Description: ${result.preset.description}`,
      '',
      '## Actions',
      '',
      ...result.executedSteps.map((step, index) => `- ${index + 1}. ${step.action.type}${step.action.description ? ` - ${step.action.description}` : ''}`),
      '',
      '## Executed Steps',
      '',
      ...result.executedSteps.map((step, index) => `- ${index + 1}. ${step.ok ? 'ok' : 'failed'}: ${step.summary}`),
      '',
      '## Observed Requests',
      '',
      ...this.observedRequestLines(result),
      '',
      '## Hook Summary',
      '',
      `- New Records: ${result.hookSummary.recordCount}`,
      `- Hook IDs: ${result.hookSummary.hookIds.join(', ') || '(none)'}`,
      '',
      '## Suspicious Requests',
      '',
      ...this.suspiciousRequestLines(result),
      '',
      '## Scenario Notes',
      '',
      ...this.bulletLines(result.scenarioResult?.notes ?? [], 'No scenario notes were generated.'),
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
      ...this.bulletLines(result.notes, 'No capture notes.')
    ];

    return `${lines.join('\n')}\n`;
  }

  private observedRequestLines(result: ReplayRecipeResult): string[] {
    if (result.observedRequests.length === 0) {
      return ['- No new requests were observed during the replay window.'];
    }

    return result.observedRequests
      .slice(0, 30)
      .map((request) => `- ${request.method} ${request.url}${request.requestId ? ` (${request.requestId})` : ''}`);
  }

  private suspiciousRequestLines(result: ReplayRecipeResult): string[] {
    if (result.suspiciousRequests.length === 0) {
      return ['- No suspicious request was promoted by scenario analysis.'];
    }

    return result.suspiciousRequests
      .slice(0, 20)
      .map((request) => `- ${request.method} ${request.url} (score=${request.score}) indicators=${request.indicators.join(', ') || 'none'}`);
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }

    return values.slice(0, 30).map((value) => `- ${value}`);
  }
}
