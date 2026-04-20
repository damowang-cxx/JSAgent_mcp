import type { CorrelationResult } from '../correlation/types.js';
import type { DeobfuscateResult } from '../deobfuscation/types.js';
import type { AnalyzeTargetResult, AnalyzeTargetStep } from './types.js';

export class ExplainEngine {
  explainDeobfuscation(result: DeobfuscateResult): string {
    const successful = result.transformations.filter((item) => item.success);
    const changed = successful.filter((item) => {
      const detail = item.detail ?? {};
      return Object.values(detail).some((value) => typeof value === 'number' ? value > 0 : Boolean(value));
    });
    const warnings = result.warnings && result.warnings.length > 0 ? ` Warnings: ${result.warnings.slice(0, 3).join(' | ')}.` : '';

    return [
      `Detected ${result.obfuscationType.join(', ')}.`,
      `${successful.length} pipeline step(s) completed; ${changed.length} reported concrete changes.`,
      `Readability score is ${result.readabilityScore}, confidence is ${result.confidence}.`,
      warnings
    ].join(' ').trim();
  }

  explainCorrelation(result: CorrelationResult): string[] {
    const lines = [
      `Built ${result.timeline.length} timeline entries from hook/network observations.`,
      `Correlated ${result.correlatedFlows.length} flow(s); ${result.suspiciousFlows.length} look suspicious by method, URL, signature indicator, or initiator evidence.`,
      `Generated ${result.requestFingerprints.length} request fingerprint(s) and ${result.priorityTargets.length} priority target(s).`
    ];

    const topFingerprint = result.requestFingerprints[0];
    if (topFingerprint) {
      lines.push(`Top fingerprint: ${topFingerprint.fingerprint} with score ${topFingerprint.suspiciousScore}.`);
    }

    return lines;
  }

  explainAnalyzeTarget(input: {
    result: Pick<
      AnalyzeTargetResult,
      'risk' | 'network' | 'hooks' | 'priorityTargets' | 'recommendedNextSteps' | 'correlation' | 'deobfuscation'
    >;
  }): {
    whyTheseSteps: string[];
    stopIf: string[];
    actionPlan: string[];
  } {
    const { result } = input;
    const whyTheseSteps: string[] = [];
    const actionPlan: string[] = [];
    const stopIf: string[] = [];

    if (result.network.suspiciousRequests > 0) {
      whyTheseSteps.push(`${result.network.suspiciousRequests} suspicious request(s) were observed, so request/initiator inspection is prioritized.`);
      actionPlan.push('Inspect suspicious request fingerprints and matched initiators before changing code.');
    }

    if (result.hooks.injected.length > 0 && result.hooks.signalCount === 0) {
      whyTheseSteps.push('Hooks were installed but produced no records yet, so another target interaction is needed before drawing runtime conclusions.');
      actionPlan.push('Trigger the target action after hooks are active, then read hook data.');
    }

    if (result.correlation && result.correlation.suspiciousFlows.length > 0) {
      whyTheseSteps.push(`Correlation found ${result.correlation.suspiciousFlows.length} suspicious flow(s), so prioritize those URL patterns.`);
      actionPlan.push('Open the highest-scoring correlated flow and compare hook records, network request body, and initiator stack.');
    }

    if (result.deobfuscation && result.deobfuscation.transformations > 0) {
      whyTheseSteps.push(`Deobfuscation completed ${result.deobfuscation.transformations} step(s), so inspect cleaned code around priority functions.`);
      actionPlan.push('Use deobfuscated snippets as hints, not as a source of truth, and verify against collected original code.');
    }

    if (result.risk.level === 'high') {
      whyTheseSteps.push(`Risk level is high with score ${result.risk.score}, so preserve evidence before deeper transforms.`);
      actionPlan.push('Write evidence snapshots before attempting aggressive deobfuscation or replay.');
    }

    if (result.priorityTargets.length > 0) {
      actionPlan.push(`Start with priority target: ${result.priorityTargets[0].label}.`);
    }

    stopIf.push('Stop if no network or hook signal reproduces after the target action; collect a fresh observe sample first.');
    stopIf.push('Stop treating correlation as exact if timestamps, URL patterns, or initiators do not line up.');
    if (!result.deobfuscation) {
      stopIf.push('Stop before deobfuscation conclusions because runDeobfuscation was not enabled.');
    }

    return {
      actionPlan: this.unique(actionPlan),
      stopIf: this.unique(stopIf),
      whyTheseSteps: this.unique([
        ...whyTheseSteps,
        ...result.recommendedNextSteps.map((step: AnalyzeTargetStep) => step.reason)
      ])
    };
  }

  private unique(values: readonly string[]): string[] {
    return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
  }
}
