import { CodeSummarizer } from '../analysis/CodeSummarizer.js';
import { CryptoDetector } from '../analysis/CryptoDetector.js';
import { ExplainEngine } from '../analysis/ExplainEngine.js';
import { RiskScorer } from '../analysis/RiskScorer.js';
import { SessionReporter } from '../analysis/SessionReporter.js';
import { StaticAnalyzer } from '../analysis/StaticAnalyzer.js';
import { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { CodeCollector } from '../collector/CodeCollector.js';
import { RequestChainCorrelator } from '../correlation/RequestChainCorrelator.js';
import { Deobfuscator } from '../deobfuscation/Deobfuscator.js';
import { EvidenceStore } from '../evidence/EvidenceStore.js';
import { HookManager } from '../hook/HookManager.js';
import { NetworkCollector } from '../network/NetworkCollector.js';
import { RequestInitiatorTracker } from '../network/RequestInitiatorTracker.js';
import { XhrWatchpointManager } from '../network/xhrWatchpoints.js';
import { PageController } from '../page/PageController.js';
import { AcceptanceRecorder } from '../patch/AcceptanceRecorder.js';
import { FixtureStabilizer } from '../patch/FixtureStabilizer.js';
import { PatchApplier } from '../patch/PatchApplier.js';
import { PatchLoopRunner } from '../patch/PatchLoopRunner.js';
import { PatchPlanManager } from '../patch/PatchPlanManager.js';
import { BoundaryDefiner } from '../pure/BoundaryDefiner.js';
import { FreezeManager } from '../pure/FreezeManager.js';
import { PureFixtureBuilder } from '../pure/PureFixtureBuilder.js';
import { PureNodeExtractor } from '../pure/PureNodeExtractor.js';
import { PureVerifier } from '../pure/PureVerifier.js';
import { RuntimeTraceSampler } from '../pure/RuntimeTraceSampler.js';
import { PatchReportBuilder } from '../report/PatchReportBuilder.js';
import { PureReportBuilder } from '../report/PureReportBuilder.js';
import { RebuildReportBuilder } from '../report/RebuildReportBuilder.js';
import { ReverseReportBuilder } from '../report/ReverseReportBuilder.js';
import { DivergenceComparator } from '../rebuild/DivergenceComparator.js';
import { EnvAccessLogger } from '../rebuild/EnvAccessLogger.js';
import { FixtureExtractor } from '../rebuild/FixtureExtractor.js';
import { PatchAdvisor } from '../rebuild/PatchAdvisor.js';
import { RebuildBundleExporter } from '../rebuild/RebuildBundleExporter.js';
import { RebuildRunner } from '../rebuild/RebuildRunner.js';
import { AnalyzeTargetRunner } from '../workflow/AnalyzeTargetRunner.js';
import { PatchWorkflowRunner } from '../workflow/PatchWorkflowRunner.js';
import { PureExtractionRunner } from '../workflow/PureExtractionRunner.js';
import { RebuildWorkflowRunner } from '../workflow/RebuildWorkflowRunner.js';
import { ReverseWorkflowRunner } from '../workflow/ReverseWorkflowRunner.js';
import type { AppRuntimeServices } from './types.js';

export class AppRuntime implements AppRuntimeServices {
  readonly pageController: PageController;
  readonly codeCollector: CodeCollector;
  readonly codeSummarizer: CodeSummarizer;
  readonly staticAnalyzer: StaticAnalyzer;
  readonly cryptoDetector: CryptoDetector;
  readonly riskScorer: RiskScorer;
  readonly sessionReporter: SessionReporter;
  readonly explainEngine: ExplainEngine;
  readonly deobfuscator: Deobfuscator;
  readonly requestChainCorrelator: RequestChainCorrelator;
  readonly reverseReportBuilder: ReverseReportBuilder;
  readonly rebuildBundleExporter: RebuildBundleExporter;
  readonly rebuildRunner: RebuildRunner;
  readonly envAccessLogger: EnvAccessLogger;
  readonly fixtureExtractor: FixtureExtractor;
  readonly divergenceComparator: DivergenceComparator;
  readonly patchAdvisor: PatchAdvisor;
  readonly patchPlanManager: PatchPlanManager;
  readonly patchApplier: PatchApplier;
  readonly patchLoopRunner: PatchLoopRunner;
  readonly acceptanceRecorder: AcceptanceRecorder;
  readonly fixtureStabilizer: FixtureStabilizer;
  readonly patchWorkflowRunner: PatchWorkflowRunner;
  readonly patchReportBuilder: PatchReportBuilder;
  readonly freezeManager: FreezeManager;
  readonly runtimeTraceSampler: RuntimeTraceSampler;
  readonly boundaryDefiner: BoundaryDefiner;
  readonly pureFixtureBuilder: PureFixtureBuilder;
  readonly pureNodeExtractor: PureNodeExtractor;
  readonly pureVerifier: PureVerifier;
  readonly pureExtractionRunner: PureExtractionRunner;
  readonly pureReportBuilder: PureReportBuilder;
  readonly rebuildWorkflowRunner: RebuildWorkflowRunner;
  readonly rebuildReportBuilder: RebuildReportBuilder;
  readonly hookManager: HookManager;
  readonly networkCollector: NetworkCollector;
  readonly requestInitiatorTracker: RequestInitiatorTracker;
  readonly xhrWatchpointManager: XhrWatchpointManager;
  readonly evidenceStore: EvidenceStore;
  readonly reverseWorkflowRunner: ReverseWorkflowRunner;
  readonly analyzeTargetRunner: AnalyzeTargetRunner;

  constructor(readonly browserSession: BrowserSessionManager) {
    this.pageController = new PageController(browserSession);
    this.codeCollector = new CodeCollector(browserSession, this.pageController);
    this.hookManager = new HookManager(browserSession);
    this.requestInitiatorTracker = new RequestInitiatorTracker(browserSession);
    this.networkCollector = new NetworkCollector(browserSession, this.requestInitiatorTracker);
    this.xhrWatchpointManager = new XhrWatchpointManager(browserSession, this.requestInitiatorTracker);
    this.evidenceStore = new EvidenceStore();
    this.codeSummarizer = new CodeSummarizer();
    this.staticAnalyzer = new StaticAnalyzer();
    this.cryptoDetector = new CryptoDetector();
    this.riskScorer = new RiskScorer();
    this.explainEngine = new ExplainEngine();
    this.deobfuscator = new Deobfuscator(this.explainEngine);
    this.requestChainCorrelator = new RequestChainCorrelator({
      hookManager: this.hookManager,
      networkCollector: this.networkCollector
    });
    this.reverseReportBuilder = new ReverseReportBuilder();
    this.envAccessLogger = new EnvAccessLogger();
    this.fixtureExtractor = new FixtureExtractor({
      browserSession,
      codeCollector: this.codeCollector,
      hookManager: this.hookManager,
      networkCollector: this.networkCollector
    });
    this.rebuildBundleExporter = new RebuildBundleExporter({
      codeCollector: this.codeCollector,
      envAccessLogger: this.envAccessLogger,
      evidenceStore: this.evidenceStore,
      fixtureExtractor: this.fixtureExtractor
    });
    this.rebuildRunner = new RebuildRunner(this.envAccessLogger);
    this.divergenceComparator = new DivergenceComparator();
    this.patchAdvisor = new PatchAdvisor();
    this.rebuildReportBuilder = new RebuildReportBuilder();
    this.patchPlanManager = new PatchPlanManager(this.evidenceStore);
    this.patchApplier = new PatchApplier();
    this.acceptanceRecorder = new AcceptanceRecorder(this.evidenceStore);
    this.patchReportBuilder = new PatchReportBuilder();
    this.runtimeTraceSampler = new RuntimeTraceSampler();
    this.boundaryDefiner = new BoundaryDefiner();
    this.pureFixtureBuilder = new PureFixtureBuilder();
    this.pureNodeExtractor = new PureNodeExtractor(this.evidenceStore);
    this.pureVerifier = new PureVerifier();
    this.pureReportBuilder = new PureReportBuilder();
    this.sessionReporter = new SessionReporter({
      browserSession,
      codeCollector: this.codeCollector,
      cryptoDetector: this.cryptoDetector,
      evidenceStore: this.evidenceStore,
      hookManager: this.hookManager,
      networkCollector: this.networkCollector,
      riskScorer: this.riskScorer,
      staticAnalyzer: this.staticAnalyzer
    });
    this.reverseWorkflowRunner = new ReverseWorkflowRunner({
      browserSession,
      codeCollector: this.codeCollector,
      evidenceStore: this.evidenceStore,
      hookManager: this.hookManager,
      networkCollector: this.networkCollector,
      pageController: this.pageController,
      requestInitiatorTracker: this.requestInitiatorTracker
    });
    this.analyzeTargetRunner = new AnalyzeTargetRunner({
      browserSession,
      codeCollector: this.codeCollector,
      codeSummarizer: this.codeSummarizer,
      cryptoDetector: this.cryptoDetector,
      deobfuscator: this.deobfuscator,
      evidenceStore: this.evidenceStore,
      explainEngine: this.explainEngine,
      hookManager: this.hookManager,
      networkCollector: this.networkCollector,
      requestChainCorrelator: this.requestChainCorrelator,
      reverseReportBuilder: this.reverseReportBuilder,
      requestInitiatorTracker: this.requestInitiatorTracker,
      riskScorer: this.riskScorer,
      staticAnalyzer: this.staticAnalyzer
    });
    this.rebuildWorkflowRunner = new RebuildWorkflowRunner({
      analyzeTargetRunner: this.analyzeTargetRunner,
      browserSession,
      divergenceComparator: this.divergenceComparator,
      evidenceStore: this.evidenceStore,
      fixtureExtractor: this.fixtureExtractor,
      patchAdvisor: this.patchAdvisor,
      rebuildBundleExporter: this.rebuildBundleExporter,
      rebuildReportBuilder: this.rebuildReportBuilder,
      rebuildRunner: this.rebuildRunner
    });
    this.fixtureStabilizer = new FixtureStabilizer({
      analyzeTargetRunner: this.analyzeTargetRunner,
      fixtureExtractor: this.fixtureExtractor
    });
    this.patchLoopRunner = new PatchLoopRunner({
      analyzeTargetRunner: this.analyzeTargetRunner,
      divergenceComparator: this.divergenceComparator,
      evidenceStore: this.evidenceStore,
      fixtureExtractor: this.fixtureExtractor,
      patchAdvisor: this.patchAdvisor,
      patchApplier: this.patchApplier,
      patchPlanManager: this.patchPlanManager,
      rebuildRunner: this.rebuildRunner,
      rebuildWorkflowRunner: this.rebuildWorkflowRunner
    });
    this.patchWorkflowRunner = new PatchWorkflowRunner({
      acceptanceRecorder: this.acceptanceRecorder,
      browserSession,
      evidenceStore: this.evidenceStore,
      fixtureStabilizer: this.fixtureStabilizer,
      patchLoopRunner: this.patchLoopRunner,
      patchReportBuilder: this.patchReportBuilder,
      rebuildWorkflowRunner: this.rebuildWorkflowRunner
    });
    this.freezeManager = new FreezeManager({
      acceptanceRecorder: this.acceptanceRecorder,
      analyzeTargetRunner: this.analyzeTargetRunner,
      evidenceStore: this.evidenceStore,
      fixtureExtractor: this.fixtureExtractor,
      patchWorkflowRunner: this.patchWorkflowRunner,
      rebuildWorkflowRunner: this.rebuildWorkflowRunner
    });
    this.pureExtractionRunner = new PureExtractionRunner({
      analyzeTargetRunner: this.analyzeTargetRunner,
      boundaryDefiner: this.boundaryDefiner,
      evidenceStore: this.evidenceStore,
      freezeManager: this.freezeManager,
      pureFixtureBuilder: this.pureFixtureBuilder,
      pureNodeExtractor: this.pureNodeExtractor,
      pureReportBuilder: this.pureReportBuilder,
      pureVerifier: this.pureVerifier,
      rebuildWorkflowRunner: this.rebuildWorkflowRunner,
      runtimeTraceSampler: this.runtimeTraceSampler
    });
  }

  getBrowserSession(): BrowserSessionManager {
    return this.browserSession;
  }

  getPageController(): PageController {
    return this.pageController;
  }

  getCodeCollector(): CodeCollector {
    return this.codeCollector;
  }

  getCodeSummarizer(): CodeSummarizer {
    return this.codeSummarizer;
  }

  getStaticAnalyzer(): StaticAnalyzer {
    return this.staticAnalyzer;
  }

  getCryptoDetector(): CryptoDetector {
    return this.cryptoDetector;
  }

  getRiskScorer(): RiskScorer {
    return this.riskScorer;
  }

  getSessionReporter(): SessionReporter {
    return this.sessionReporter;
  }

  getExplainEngine(): ExplainEngine {
    return this.explainEngine;
  }

  getDeobfuscator(): Deobfuscator {
    return this.deobfuscator;
  }

  getRequestChainCorrelator(): RequestChainCorrelator {
    return this.requestChainCorrelator;
  }

  getReverseReportBuilder(): ReverseReportBuilder {
    return this.reverseReportBuilder;
  }

  getRebuildBundleExporter(): RebuildBundleExporter {
    return this.rebuildBundleExporter;
  }

  getRebuildRunner(): RebuildRunner {
    return this.rebuildRunner;
  }

  getEnvAccessLogger(): EnvAccessLogger {
    return this.envAccessLogger;
  }

  getFixtureExtractor(): FixtureExtractor {
    return this.fixtureExtractor;
  }

  getDivergenceComparator(): DivergenceComparator {
    return this.divergenceComparator;
  }

  getPatchAdvisor(): PatchAdvisor {
    return this.patchAdvisor;
  }

  getPatchPlanManager(): PatchPlanManager {
    return this.patchPlanManager;
  }

  getPatchApplier(): PatchApplier {
    return this.patchApplier;
  }

  getPatchLoopRunner(): PatchLoopRunner {
    return this.patchLoopRunner;
  }

  getAcceptanceRecorder(): AcceptanceRecorder {
    return this.acceptanceRecorder;
  }

  getFixtureStabilizer(): FixtureStabilizer {
    return this.fixtureStabilizer;
  }

  getPatchWorkflowRunner(): PatchWorkflowRunner {
    return this.patchWorkflowRunner;
  }

  getPatchReportBuilder(): PatchReportBuilder {
    return this.patchReportBuilder;
  }

  getFreezeManager(): FreezeManager {
    return this.freezeManager;
  }

  getRuntimeTraceSampler(): RuntimeTraceSampler {
    return this.runtimeTraceSampler;
  }

  getBoundaryDefiner(): BoundaryDefiner {
    return this.boundaryDefiner;
  }

  getPureFixtureBuilder(): PureFixtureBuilder {
    return this.pureFixtureBuilder;
  }

  getPureNodeExtractor(): PureNodeExtractor {
    return this.pureNodeExtractor;
  }

  getPureVerifier(): PureVerifier {
    return this.pureVerifier;
  }

  getPureExtractionRunner(): PureExtractionRunner {
    return this.pureExtractionRunner;
  }

  getPureReportBuilder(): PureReportBuilder {
    return this.pureReportBuilder;
  }

  getRebuildWorkflowRunner(): RebuildWorkflowRunner {
    return this.rebuildWorkflowRunner;
  }

  getRebuildReportBuilder(): RebuildReportBuilder {
    return this.rebuildReportBuilder;
  }

  getHookManager(): HookManager {
    return this.hookManager;
  }

  getNetworkCollector(): NetworkCollector {
    return this.networkCollector;
  }

  getRequestInitiatorTracker(): RequestInitiatorTracker {
    return this.requestInitiatorTracker;
  }

  getXhrWatchpointManager(): XhrWatchpointManager {
    return this.xhrWatchpointManager;
  }

  getEvidenceStore(): EvidenceStore {
    return this.evidenceStore;
  }

  getReverseWorkflowRunner(): ReverseWorkflowRunner {
    return this.reverseWorkflowRunner;
  }

  getAnalyzeTargetRunner(): AnalyzeTargetRunner {
    return this.analyzeTargetRunner;
  }
}
