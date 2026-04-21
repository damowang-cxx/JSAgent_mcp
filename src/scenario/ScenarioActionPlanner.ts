import type {
  CryptoHelperResult,
  RequestSinkResult,
  ScenarioAnalysisResult,
  ScenarioType,
  TokenFamilyTraceResult
} from './types.js';

export class ScenarioActionPlanner {
  plan(input: {
    scenario: ScenarioType;
    analysis: ScenarioAnalysisResult;
    tokenTrace?: TokenFamilyTraceResult;
    sinkResult?: RequestSinkResult;
    helperResult?: CryptoHelperResult;
  }): {
    nextActions: string[];
    whyTheseSteps: string[];
    stopIf: string[];
  } {
    const nextActions: string[] = [];
    const whyTheseSteps: string[] = [];
    const stopIf: string[] = [];
    const topRequest = input.analysis.suspiciousRequests[0];
    const topFunction = input.analysis.candidateFunctions[0];
    const topSink = input.sinkResult?.topSink ?? input.analysis.requestSinks[0];
    const topHelper = input.helperResult?.helpers.find((helper) => !helper.name.startsWith('crypto:')) ?? input.helperResult?.helpers[0];
    const topBinding = input.tokenTrace?.requestBindings[0];

    if (input.scenario === 'crypto-helper' && topHelper) {
      nextActions.push(`Start with helper ${topHelper.name}; review/deobfuscate it and map its output to request parameters before expanding request capture.`);
      whyTheseSteps.push(`The crypto-helper preset is helper-first, and ${topHelper.name} is classified as ${topHelper.kind} with confidence ${topHelper.confidence}.`);
      stopIf.push('Stop helper-first analysis if the helper output cannot be bound to a request parameter, hook return, or token family member.');
    }

    if (topRequest) {
      nextActions.push(`Prioritize ${topRequest.method} ${topRequest.url}; inspect fields ${topRequest.indicators.slice(0, 6).join(', ') || '(no named indicators)'}.`);
      whyTheseSteps.push(`The top request has scenario score ${topRequest.score} from URL/body/header/method/hook evidence.`);
      stopIf.push('Stop broad request capture once this request is reproducible and its parameter set is stable.');
    } else {
      nextActions.push('Inject fetch/xhr hooks, replay the target action, then rerun analyze_signature_chain or run_scenario_recipe.');
      whyTheseSteps.push('No suspicious request has converged yet, so the next step must create runtime evidence.');
      stopIf.push('Stop scenario conclusions until at least one target request is observed or targetUrl is refined.');
    }

    if (topSink) {
      nextActions.push(`Inspect request sink ${topSink}; confirm it is the final hop before the target request leaves the page.`);
      whyTheseSteps.push('A stable request sink narrows the chain before rebuild or helper-boundary extraction.');
      stopIf.push('Stop sink expansion after the same sink is confirmed in code plus hook/network evidence.');
    }

    if (topFunction) {
      nextActions.push(`Search collected code for function ${topFunction}; review callers and arguments around sign/token/auth/nonce fields.`);
      whyTheseSteps.push('The candidate function name matches scenario keywords and should be checked against the request path.');
      stopIf.push('Stop function expansion if the candidate does not feed the target request or related helper.');
    }

    if (topHelper && input.scenario !== 'crypto-helper') {
      nextActions.push(`Run focused review or deobfuscate_code on helper ${topHelper.name}; capture one input/output sample if it feeds a request parameter.`);
      whyTheseSteps.push(`Crypto helper ${topHelper.name} was classified as ${topHelper.kind} with confidence ${topHelper.confidence}.`);
      stopIf.push('Stop helper extraction if no request parameter consumes the helper output.');
    }

    if (topBinding) {
      nextActions.push(`Trace ${input.tokenTrace?.familyName ?? 'token'} binding ${topBinding.param} on ${topBinding.method} ${topBinding.url}.`);
      whyTheseSteps.push('A request-bound token family member is more actionable than an isolated code identifier.');
      stopIf.push('Stop token-family expansion once source, transformation, and request binding are all represented by evidence.');
    }

    if (input.scenario === 'crypto-helper' && !topHelper) {
      nextActions.push('Run locate_crypto_helpers after collect_code top-priority collection; there is not enough helper evidence yet.');
      whyTheseSteps.push('Crypto-helper scenario requires code-side helper candidates before extraction.');
    }

    if (input.scenario === 'token-family' && (!input.tokenTrace || input.tokenTrace.members.length === 0)) {
      nextActions.push('Replay login/refresh/auth action with fetch/xhr hooks, then rerun trace_token_family.');
      whyTheseSteps.push('Token-family trace has no members yet, so runtime sampling should precede deeper static guesses.');
    }

    if (input.scenario === 'anti-bot') {
      nextActions.push('For anti-bot, compare challenge/verify/captcha/fingerprint fields across two captures before moving to rebuild.');
      whyTheseSteps.push('Anti-bot parameters often change per challenge, so repeated hook-backed samples are needed before extraction.');
      stopIf.push('Stop anti-bot capture once the challenge parameter source and request binding are both stable across two samples.');
    }

    return {
      nextActions: this.unique(nextActions).slice(0, 12),
      stopIf: this.unique([...stopIf, ...input.analysis.stopIf]).slice(0, 12),
      whyTheseSteps: this.unique([...whyTheseSteps, ...input.analysis.whyTheseTargets]).slice(0, 12)
    };
  }

  private unique(values: readonly string[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];

    for (const value of values) {
      const normalized = value.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      output.push(normalized);
    }

    return output;
  }
}
