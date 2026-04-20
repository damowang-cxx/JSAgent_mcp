import { AppError } from '../core/errors.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { CrossLanguageDiff } from '../port/CrossLanguageDiff.js';
import type { CrossLanguageVerifier } from '../port/CrossLanguageVerifier.js';
import type { PythonPortExtractor } from '../port/PythonPortExtractor.js';
import type { PortWorkflowResult } from '../port/types.js';
import type { NodePureScaffold, PureFixture, PureVerificationResult } from '../pure/types.js';
import type { PortReportBuilder } from '../report/PortReportBuilder.js';
import type { PureExtractionRunner } from './PureExtractionRunner.js';

export type PurePortBaseline = {
  node: NodePureScaffold;
  fixture: PureFixture;
  verification: PureVerificationResult;
  readyForPort: boolean;
};

export class PortWorkflowRunner {
  private lastResult: PortWorkflowResult | null = null;

  constructor(
    private readonly deps: {
      evidenceStore: EvidenceStore;
      pureExtractionRunner: PureExtractionRunner;
      pythonPortExtractor: PythonPortExtractor;
      crossLanguageVerifier: CrossLanguageVerifier;
      crossLanguageDiff: CrossLanguageDiff;
      portReportBuilder: PortReportBuilder;
    }
  ) {}

  async run(options: {
    taskId?: string;
    overwrite?: boolean;
    verifyTimeoutMs?: number;
    writeEvidence?: boolean;
  }): Promise<PortWorkflowResult> {
    const baseline = await this.getPureBaseline(options.taskId);
    this.assertGateSatisfied(baseline);

    const task = options.writeEvidence && options.taskId
      ? await this.deps.evidenceStore.openTask({ taskId: options.taskId })
      : options.taskId
        ? {
            taskDir: this.deps.evidenceStore.getTaskDir(options.taskId),
            taskId: options.taskId
          }
        : null;
    const pythonScaffold = await this.deps.pythonPortExtractor.extract({
      fixture: baseline.fixture,
      nodePure: baseline.node,
      overwrite: options.overwrite,
      taskId: options.taskId
    });
    const verification = await this.deps.crossLanguageVerifier.verify({
      fixtureFile: pythonScaffold.fixtureFile,
      nodeEntryFile: baseline.node.entryFile,
      pythonEntryFile: pythonScaffold.entryFile,
      timeoutMs: options.verifyTimeoutMs
    });
    const diff = await this.deps.crossLanguageDiff.diff({
      verification
    });
    const readyForSdkWrap = Boolean(baseline.verification.ok && verification.ok && diff.matched);
    const result: PortWorkflowResult = {
      diff,
      nextActions: this.buildNextActions(readyForSdkWrap, verification),
      pure: {
        fixture: baseline.fixture,
        node: baseline.node,
        verification: baseline.verification
      },
      python: {
        scaffold: pythonScaffold,
        verification
      },
      readyForSdkWrap,
      stopIf: this.buildStopIf(readyForSdkWrap, verification),
      task,
      whyTheseSteps: this.buildWhyTheseSteps(baseline, verification)
    };

    if (options.writeEvidence && options.taskId) {
      await this.writeEvidence(options.taskId, result);
    }

    this.lastResult = result;
    return result;
  }

  getLastPortWorkflowResult(): PortWorkflowResult | null {
    return this.lastResult;
  }

  async getPortWorkflowResult(taskId?: string): Promise<PortWorkflowResult | null> {
    if (this.lastResult && (!taskId || this.lastResult.task?.taskId === taskId)) {
      return this.lastResult;
    }

    if (!taskId) {
      return null;
    }

    const baseline = await this.getPureBaseline(taskId);
    const [pythonScaffold, pythonVerification, diff] = await Promise.all([
      this.deps.evidenceStore.readSnapshot(taskId, 'run/python-pure'),
      this.deps.evidenceStore.readSnapshot(taskId, 'run/python-verification'),
      this.deps.evidenceStore.readSnapshot(taskId, 'run/cross-language-diff')
    ]);
    if (!pythonScaffold || !pythonVerification || !diff) {
      return null;
    }

    const verification = pythonVerification as PortWorkflowResult['python']['verification'];
    const crossDiff = diff as PortWorkflowResult['diff'];
    return {
      diff: crossDiff,
      nextActions: this.buildNextActions(Boolean(baseline.verification.ok && verification.ok && crossDiff.matched), verification),
      pure: {
        fixture: baseline.fixture,
        node: baseline.node,
        verification: baseline.verification
      },
      python: {
        scaffold: pythonScaffold as PortWorkflowResult['python']['scaffold'],
        verification
      },
      readyForSdkWrap: Boolean(baseline.verification.ok && verification.ok && crossDiff.matched),
      stopIf: this.buildStopIf(Boolean(baseline.verification.ok && verification.ok && crossDiff.matched), verification),
      task: {
        taskDir: this.deps.evidenceStore.getTaskDir(taskId),
        taskId
      },
      whyTheseSteps: this.buildWhyTheseSteps(baseline, verification)
    };
  }

  async getPureBaseline(taskId?: string): Promise<PurePortBaseline> {
    const cached = this.deps.pureExtractionRunner.getLastPureExtractionResult();
    if (cached && (!taskId || cached.task?.taskId === taskId || cached.nodePure.taskId === taskId)) {
      return {
        fixture: cached.fixture,
        node: cached.nodePure,
        readyForPort: cached.readyForPort,
        verification: cached.verification
      };
    }

    if (!taskId) {
      throw new AppError('PURE_BASELINE_NOT_FOUND', 'No run_pure_workflow result is cached and no taskId was supplied.');
    }

    const [node, fixture, verification] = await Promise.all([
      this.deps.evidenceStore.readSnapshot(taskId, 'run/node-pure'),
      this.deps.evidenceStore.readSnapshot(taskId, 'run/fixtures'),
      this.deps.evidenceStore.readSnapshot(taskId, 'run/pure-verification')
    ]);
    if (!node || !fixture || !verification) {
      throw new AppError('PURE_BASELINE_NOT_FOUND', 'Task artifacts do not contain a complete pure baseline.', {
        hasFixture: Boolean(fixture),
        hasNodePure: Boolean(node),
        hasVerification: Boolean(verification),
        taskId
      });
    }

    return {
      fixture: fixture as PureFixture,
      node: node as NodePureScaffold,
      readyForPort: await this.readReadyForPort(taskId),
      verification: verification as PureVerificationResult
    };
  }

  private assertGateSatisfied(baseline: PurePortBaseline): void {
    if (!baseline.readyForPort || !baseline.verification.ok) {
      throw new AppError('PORT_GATE_NOT_SATISFIED', 'PureExtraction gate is not satisfied; do not start port workflow yet.', {
        pureVerificationOk: baseline.verification.ok,
        readyForPort: baseline.readyForPort
      });
    }
  }

  private async readReadyForPort(taskId: string): Promise<boolean> {
    try {
      const snapshot = await this.deps.evidenceStore.readSnapshot(taskId, 'run/pure-extraction');
      if (snapshot && typeof snapshot === 'object' && 'readyForPort' in snapshot) {
        const record = snapshot as { readyForPort?: unknown; verification?: { ok?: unknown } };
        if (record.readyForPort === true && record.verification?.ok === true) {
          return true;
        }
      }
      const logs = await this.deps.evidenceStore.readLog(taskId, 'runtime-evidence');
      return logs.some((entry) => (
        entry.kind === 'pure_extraction' &&
        entry.readyForPort === true &&
        entry.verificationOk === true
      ));
    } catch {
      return false;
    }
  }

  private buildNextActions(
    readyForSdkWrap: boolean,
    verification: PortWorkflowResult['python']['verification']
  ): string[] {
    if (readyForSdkWrap) {
      return [
        'Freeze the Python scaffold and fixture as the cross-language baseline.',
        'Start SDK wrapping only after keeping this report with the task artifacts.'
      ];
    }

    switch (verification.divergence?.kind) {
      case 'python-error':
        return ['Fix the Python scaffold/runtime error and rerun verify_python_pure.'];
      case 'node-error':
        return ['Return to verify_node_pure; Python must not chase a broken Node baseline.'];
      case 'no-output':
        return ['Inspect the entry script that emitted no structured result.'];
      case 'output-mismatch':
        return ['Update compute_pure in Python around the reported first divergence, then rerun verification.'];
      default:
        return ['Resolve the cross-language first divergence before SDK wrapping.'];
    }
  }

  private buildWhyTheseSteps(
    baseline: PurePortBaseline,
    verification: PortWorkflowResult['python']['verification']
  ): string[] {
    return [
      'Port starts only after the PureExtraction gate, so Node pure remains the baseline.',
      `Fixture explicit input count: ${Object.keys(baseline.fixture.input).length}.`,
      `Node pure verification was ${baseline.verification.ok ? 'passing' : 'not passing'} before Python export.`,
      `Python verification ${verification.ok ? 'matched' : 'diverged from'} the Node baseline.`
    ];
  }

  private buildStopIf(
    readyForSdkWrap: boolean,
    verification: PortWorkflowResult['python']['verification']
  ): string[] {
    return [
      'Stop if PureExtraction readyForPort is false or Node verification is not passing.',
      'Stop if Python consumes a different fixture contract than Node pure.',
      ...(verification.ok ? [] : ['Stop SDK wrapping; fix the cross-language divergence first.']),
      ...(readyForSdkWrap ? ['Stop broad refactors; package the stable fixture-bound implementation first.'] : [])
    ];
  }

  private async writeEvidence(taskId: string, result: PortWorkflowResult): Promise<void> {
    await this.deps.evidenceStore.appendLog(taskId, 'runtime-evidence', {
      kind: 'port_workflow',
      pythonVerificationOk: result.python.verification.ok,
      readyForSdkWrap: result.readyForSdkWrap
    });
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/python-pure', result.python.scaffold);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/python-verification', result.python.verification);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/cross-language-diff', result.diff);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/port-workflow', result);
    const report = await this.deps.portReportBuilder.build(result, 'markdown');
    await this.deps.evidenceStore.writeSnapshot(taskId, 'run/port-report-markdown', report);
  }
}
