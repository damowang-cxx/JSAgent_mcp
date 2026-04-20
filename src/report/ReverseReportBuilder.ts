import type { AnalyzeTargetResult, AnalyzeTargetStep } from '../analysis/types.js';
import type { ReverseReportExport, ReverseReportFormat } from './types.js';

export class ReverseReportBuilder {
  async buildAnalyzeTargetReport(
    result: AnalyzeTargetResult,
    format: ReverseReportFormat
  ): Promise<ReverseReportExport> {
    const json = this.toJson(result);
    if (format === 'json') {
      return { json };
    }

    return {
      markdown: this.toMarkdown(result)
    };
  }

  private toJson(result: AnalyzeTargetResult): Record<string, unknown> {
    return {
      collection: result.collection,
      correlation: result.correlation,
      crypto: result.crypto,
      deobfuscation: result.deobfuscation,
      hooks: result.hooks,
      network: result.network,
      page: result.page,
      priorityTargets: result.priorityTargets,
      recommendedNextSteps: result.recommendedNextSteps,
      whyTheseSteps: result.whyTheseSteps,
      stopIf: result.stopIf,
      task: result.task,
      report: result.report,
      requestFingerprints: result.requestFingerprints,
      risk: result.risk,
      summaries: result.summaries,
      target: result.target,
      understanding: result.understanding
    };
  }

  private toMarkdown(result: AnalyzeTargetResult): string {
    const lines = [
      '# JSAgent_mcp Reverse Report',
      '',
      '## Target',
      '',
      `- URL: ${result.target.url}`,
      ...(result.target.targetUrl ? [`- Target URL: ${result.target.targetUrl}`] : []),
      ...(result.target.goal ? [`- Goal: ${result.target.goal}`] : []),
      '',
      '## Page',
      '',
      `- URL: ${result.page.url}`,
      `- Title: ${result.page.title || '(empty)'}`,
      '',
      '## Collection',
      '',
      `- Files: ${result.collection.totalFiles}`,
      `- Total Size: ${result.collection.totalSize}`,
      ...result.collection.topPriorityFiles.slice(0, 8).map((file) => `- ${file.type}: ${file.url} (${file.size})`),
      '',
      '## Risk',
      '',
      `- Score: ${result.risk.score}`,
      `- Level: ${result.risk.level}`,
      ...result.risk.recommendations.slice(0, 6).map((item) => `- ${item}`),
      '',
      '## Suspicious Requests / Fingerprints',
      '',
      `- Suspicious Requests: ${result.network.suspiciousRequests}`,
      ...this.fingerprintLines(result),
      '',
      '## Priority Targets',
      '',
      ...this.priorityTargetLines(result),
      '',
      '## Next Actions',
      '',
      ...result.recommendedNextSteps.slice(0, 12).map((step, index) => this.stepLine(step, index)),
      '',
      '## Why These Steps',
      '',
      ...this.bulletLines(result.whyTheseSteps, 'No workflow explanation was generated.'),
      '',
      '## Stop If',
      '',
      ...this.bulletLines(result.stopIf, 'No stop conditions were generated.'),
      '',
      ...(result.deobfuscation
        ? [
            '## Deobfuscation',
            '',
            `- Confidence: ${result.deobfuscation.confidence}`,
            `- Readability Score: ${result.deobfuscation.readabilityScore}`,
            `- Transformations: ${result.deobfuscation.transformations}`,
            `- Obfuscation Type: ${result.deobfuscation.obfuscationType.join(', ')}`,
            ...(result.deobfuscation.warnings ?? []).slice(0, 5).map((warning) => `- Warning: ${warning}`),
            ''
          ]
        : []),
      ...(result.correlation
        ? [
            '## Correlation',
            '',
            `- Timeline Entries: ${result.correlation.timeline.length}`,
            `- Correlated Flows: ${result.correlation.correlatedFlows.length}`,
            `- Suspicious Flows: ${result.correlation.suspiciousFlows.length}`,
            ...(result.correlation.warnings ?? []).slice(0, 3).map((warning) => `- Warning: ${warning}`),
            ''
          ]
        : [])
    ];

    return `${lines.join('\n')}\n`;
  }

  private fingerprintLines(result: AnalyzeTargetResult): string[] {
    const correlationFingerprints = result.correlation?.requestFingerprints ?? [];
    if (correlationFingerprints.length > 0) {
      return correlationFingerprints
        .slice(0, 8)
        .map((item) => `- ${item.fingerprint}: score=${item.suspiciousScore}, flows=${item.flowCount}`);
    }

    return result.requestFingerprints
      .slice(0, 8)
      .map((item) => `- ${item.method} ${item.pattern}: score=${item.suspiciousScore}, count=${item.count}`);
  }

  private priorityTargetLines(result: AnalyzeTargetResult): string[] {
    const correlationTargets = result.correlation?.priorityTargets ?? [];
    if (correlationTargets.length > 0) {
      return correlationTargets
        .slice(0, 10)
        .map((item) => `- ${item.type}: ${item.target} (score=${item.priorityScore}) ${item.reasons.join('; ')}`);
    }

    return result.priorityTargets
      .slice(0, 10)
      .map((item) => `- ${item.type}: ${item.label} (score=${item.score}) ${item.reason}`);
  }

  private stepLine(step: AnalyzeTargetStep, index: number): string {
    return `- ${index + 1}. ${step.action}${step.tool ? ` (tool: ${step.tool})` : ''} - ${step.reason}`;
  }

  private bulletLines(values: readonly string[], empty: string): string[] {
    if (values.length === 0) {
      return [`- ${empty}`];
    }

    return values.slice(0, 12).map((value) => `- ${value}`);
  }
}
