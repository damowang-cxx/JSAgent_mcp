import type {
  CryptoHelperResult,
  RequestSinkResult,
  ScenarioAnalysisResult,
  ScenarioWorkflowResult,
  TokenFamilyTraceResult
} from '../scenario/types.js';

export class ScenarioReportBuilder {
  async build(
    result: ScenarioWorkflowResult | ScenarioAnalysisResult,
    format: 'json' | 'markdown'
  ): Promise<{ json?: object; markdown?: string }> {
    const json = this.toJson(result);
    if (format === 'json') {
      return { json };
    }

    return {
      markdown: this.toMarkdown(result)
    };
  }

  private toJson(result: ScenarioWorkflowResult | ScenarioAnalysisResult): Record<string, unknown> {
    if (this.isWorkflow(result)) {
      return {
        analysis: result.analysis,
        evidenceWritten: result.evidenceWritten,
        helperResult: result.helperResult,
        nextActions: result.nextActions,
        preset: result.preset,
        sinkResult: result.sinkResult,
        stopIf: result.stopIf,
        task: result.task,
        tokenTrace: result.tokenTrace,
        whyTheseSteps: result.whyTheseSteps
      };
    }

    return {
      analysis: result
    };
  }

  private toMarkdown(result: ScenarioWorkflowResult | ScenarioAnalysisResult): string {
    const workflow = this.isWorkflow(result) ? result : null;
    const analysis = workflow?.analysis ?? result as ScenarioAnalysisResult;
    const tokenTrace = workflow?.tokenTrace ?? null;
    const sinkResult = workflow?.sinkResult ?? null;
    const helperResult = workflow?.helperResult ?? null;
    const nextActions = workflow?.nextActions ?? analysis.nextActions.map((action) => action.step);
    const whyTheseSteps = workflow?.whyTheseSteps ?? analysis.whyTheseTargets;
    const stopIf = workflow?.stopIf ?? analysis.stopIf;

    const lines = [
      '# JSAgent_mcp Scenario Report',
      '',
      '## Scenario',
      '',
      `- Type: ${analysis.scenario}`,
      ...(analysis.targetUrl ? [`- Target URL: ${analysis.targetUrl}`] : []),
      ...(workflow ? [`- Preset: ${workflow.preset.presetId}`] : []),
      '',
      '## Indicators',
      '',
      ...this.indicatorLines(analysis),
      '',
      '## Suspicious Requests',
      '',
      ...this.suspiciousRequestLines(analysis),
      '',
      '## Candidate Functions',
      '',
      ...this.bulletLines(analysis.candidateFunctions.slice(0, 20), 'No candidate functions were identified.'),
      '',
      '## Request Sinks',
      '',
      ...this.requestSinkLines(analysis, sinkResult),
      '',
      '## Crypto Helpers',
      '',
      ...this.cryptoHelperLines(helperResult),
      '',
      '## Token Family',
      '',
      ...this.tokenTraceLines(tokenTrace),
      '',
      '## Priority Targets',
      '',
      ...analysis.priorityTargets.slice(0, 15).map((target) => `- ${target.kind}: ${target.target} (score=${target.score}) ${target.reasons.join('; ')}`),
      '',
      '## Next Actions',
      '',
      ...this.bulletLines(nextActions, 'No next action was generated.'),
      '',
      '## Why These Steps',
      '',
      ...this.bulletLines(whyTheseSteps, 'No scenario rationale was generated.'),
      '',
      '## Stop If',
      '',
      ...this.bulletLines(stopIf, 'No stop conditions were generated.'),
      '',
      '## Notes',
      '',
      ...this.bulletLines(analysis.notes, 'No notes.')
    ];

    return `${lines.join('\n')}\n`;
  }

  private indicatorLines(analysis: ScenarioAnalysisResult): string[] {
    if (analysis.indicators.length === 0) {
      return ['- No indicators were identified.'];
    }

    return analysis.indicators
      .slice(0, 30)
      .map((indicator) => `- ${indicator.type}: ${indicator.value} (confidence=${indicator.confidence}) ${indicator.reason}`);
  }

  private suspiciousRequestLines(analysis: ScenarioAnalysisResult): string[] {
    if (analysis.suspiciousRequests.length === 0) {
      return ['- No suspicious request is available yet.'];
    }

    return analysis.suspiciousRequests
      .slice(0, 15)
      .map((request) => `- ${request.method} ${request.url} (score=${request.score}) indicators=${request.indicators.join(', ') || 'none'}`);
  }

  private requestSinkLines(analysis: ScenarioAnalysisResult, sinkResult: RequestSinkResult | null): string[] {
    if (sinkResult?.sinks.length) {
      return sinkResult.sinks
        .slice(0, 15)
        .map((sink) => `- ${sink.source}: ${sink.sink} (score=${sink.score}) ${sink.reasons.join('; ')}`);
    }

    return this.bulletLines(analysis.requestSinks.slice(0, 20), 'No request sink was identified.');
  }

  private cryptoHelperLines(helperResult: CryptoHelperResult | null): string[] {
    if (!helperResult || helperResult.helpers.length === 0) {
      return ['- No crypto helper was identified.'];
    }

    return [
      ...(helperResult.libraries.length > 0 ? [`- Libraries: ${helperResult.libraries.join(', ')}`] : []),
      ...helperResult.helpers
        .slice(0, 15)
        .map((helper) => `- ${helper.kind}: ${helper.name}${helper.file ? ` @ ${helper.file}` : ''} (confidence=${helper.confidence}) ${helper.reasons.join('; ')}`)
    ];
  }

  private tokenTraceLines(tokenTrace: TokenFamilyTraceResult | null): string[] {
    if (!tokenTrace) {
      return ['- Token family trace was not run for this report.'];
    }

    return [
      `- Family: ${tokenTrace.familyName}`,
      `- Members: ${tokenTrace.members.length}`,
      `- Transformations: ${tokenTrace.transformations.length}`,
      `- Request Bindings: ${tokenTrace.requestBindings.length}`,
      ...tokenTrace.requestBindings
        .slice(0, 8)
        .map((binding) => `- Binding: ${binding.method} ${binding.url} param=${binding.param}`)
    ];
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }

    return values.map((value) => `- ${value}`);
  }

  private isWorkflow(value: ScenarioWorkflowResult | ScenarioAnalysisResult): value is ScenarioWorkflowResult {
    return 'preset' in value && 'analysis' in value;
  }
}
