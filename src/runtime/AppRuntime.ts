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
import { CrossLanguageDiff } from '../port/CrossLanguageDiff.js';
import { CrossLanguageVerifier } from '../port/CrossLanguageVerifier.js';
import { PythonPortExtractor } from '../port/PythonPortExtractor.js';
import { UpgradeDiffRunner } from '../port/UpgradeDiffRunner.js';
import { BoundaryDefiner } from '../pure/BoundaryDefiner.js';
import { FreezeManager } from '../pure/FreezeManager.js';
import { PureFixtureBuilder } from '../pure/PureFixtureBuilder.js';
import { PureNodeExtractor } from '../pure/PureNodeExtractor.js';
import { PureVerifier } from '../pure/PureVerifier.js';
import { RuntimeTraceSampler } from '../pure/RuntimeTraceSampler.js';
import { BaselineRegistry } from '../regression/BaselineRegistry.js';
import { RegressionDiff } from '../regression/RegressionDiff.js';
import { RegressionRunner } from '../regression/RegressionRunner.js';
import { PatchReportBuilder } from '../report/PatchReportBuilder.js';
import { PortReportBuilder } from '../report/PortReportBuilder.js';
import { PureReportBuilder } from '../report/PureReportBuilder.js';
import { RebuildReportBuilder } from '../report/RebuildReportBuilder.js';
import { RegressionReportBuilder } from '../report/RegressionReportBuilder.js';
import { ReverseReportBuilder } from '../report/ReverseReportBuilder.js';
import { SdkReportBuilder } from '../report/SdkReportBuilder.js';
import { TaskStateReportBuilder } from '../report/TaskStateReportBuilder.js';
import { DivergenceComparator } from '../rebuild/DivergenceComparator.js';
import { EnvAccessLogger } from '../rebuild/EnvAccessLogger.js';
import { FixtureExtractor } from '../rebuild/FixtureExtractor.js';
import { PatchAdvisor } from '../rebuild/PatchAdvisor.js';
import { RebuildBundleExporter } from '../rebuild/RebuildBundleExporter.js';
import { RebuildRunner } from '../rebuild/RebuildRunner.js';
import { SDKPackager } from '../sdk/SDKPackager.js';
import { StageGateEvaluator } from '../task/StageGateEvaluator.js';
import { TaskManifestManager } from '../task/TaskManifestManager.js';
import { AnalyzeTargetRunner } from '../workflow/AnalyzeTargetRunner.js';
import { DeliveryWorkflowRunner } from '../workflow/DeliveryWorkflowRunner.js';
import { PatchWorkflowRunner } from '../workflow/PatchWorkflowRunner.js';
import { PortWorkflowRunner } from '../workflow/PortWorkflowRunner.js';
import { PureExtractionRunner } from '../workflow/PureExtractionRunner.js';
import { RebuildWorkflowRunner } from '../workflow/RebuildWorkflowRunner.js';
import { RegressionWorkflowRunner } from '../workflow/RegressionWorkflowRunner.js';
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
  readonly pythonPortExtractor: PythonPortExtractor;
  readonly crossLanguageVerifier: CrossLanguageVerifier;
  readonly crossLanguageDiff: CrossLanguageDiff;
  readonly upgradeDiffRunner: UpgradeDiffRunner;
  readonly portWorkflowRunner: PortWorkflowRunner;
  readonly portReportBuilder: PortReportBuilder;
  readonly rebuildWorkflowRunner: RebuildWorkflowRunner;
  readonly rebuildReportBuilder: RebuildReportBuilder;
  readonly hookManager: HookManager;
  readonly networkCollector: NetworkCollector;
  readonly requestInitiatorTracker: RequestInitiatorTracker;
  readonly xhrWatchpointManager: XhrWatchpointManager;
  readonly evidenceStore: EvidenceStore;
  readonly taskManifestManager: TaskManifestManager;
  readonly stageGateEvaluator: StageGateEvaluator;
  readonly baselineRegistry: BaselineRegistry;
  readonly regressionRunner: RegressionRunner;
  readonly regressionDiff: RegressionDiff;
  readonly sdkPackager: SDKPackager;
  readonly taskStateReportBuilder: TaskStateReportBuilder;
  readonly regressionReportBuilder: RegressionReportBuilder;
  readonly sdkReportBuilder: SdkReportBuilder;
  readonly regressionWorkflowRunner: RegressionWorkflowRunner;
  readonly deliveryWorkflowRunner: DeliveryWorkflowRunner;
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
    this.taskManifestManager = new TaskManifestManager(this.evidenceStore);
    this.stageGateEvaluator = new StageGateEvaluator({
      evidenceStore: this.evidenceStore,
      taskManifestManager: this.taskManifestManager
    });
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
    this.pythonPortExtractor = new PythonPortExtractor(this.evidenceStore);
    this.crossLanguageVerifier = new CrossLanguageVerifier();
    this.crossLanguageDiff = new CrossLanguageDiff();
    this.upgradeDiffRunner = new UpgradeDiffRunner();
    this.portReportBuilder = new PortReportBuilder();
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
    this.portWorkflowRunner = new PortWorkflowRunner({
      crossLanguageDiff: this.crossLanguageDiff,
      crossLanguageVerifier: this.crossLanguageVerifier,
      evidenceStore: this.evidenceStore,
      portReportBuilder: this.portReportBuilder,
      pureExtractionRunner: this.pureExtractionRunner,
      pythonPortExtractor: this.pythonPortExtractor
    });
    this.regressionDiff = new RegressionDiff();
    this.baselineRegistry = new BaselineRegistry({
      evidenceStore: this.evidenceStore,
      stageGateEvaluator: this.stageGateEvaluator,
      taskManifestManager: this.taskManifestManager
    });
    this.regressionRunner = new RegressionRunner({
      baselineRegistry: this.baselineRegistry,
      crossLanguageVerifier: this.crossLanguageVerifier,
      evidenceStore: this.evidenceStore,
      pureVerifier: this.pureVerifier,
      regressionDiff: this.regressionDiff
    });
    this.sdkPackager = new SDKPackager({
      baselineRegistry: this.baselineRegistry,
      evidenceStore: this.evidenceStore,
      stageGateEvaluator: this.stageGateEvaluator,
      taskManifestManager: this.taskManifestManager
    });
    this.taskStateReportBuilder = new TaskStateReportBuilder({
      stageGateEvaluator: this.stageGateEvaluator,
      taskManifestManager: this.taskManifestManager
    });
    this.regressionReportBuilder = new RegressionReportBuilder();
    this.sdkReportBuilder = new SdkReportBuilder();
    this.regressionWorkflowRunner = new RegressionWorkflowRunner({
      baselineRegistry: this.baselineRegistry,
      regressionRunner: this.regressionRunner,
      stageGateEvaluator: this.stageGateEvaluator
    });
    this.deliveryWorkflowRunner = new DeliveryWorkflowRunner({
      baselineRegistry: this.baselineRegistry,
      evidenceRoot: this.evidenceStore,
      regressionRunner: this.regressionRunner,
      sdkPackager: this.sdkPackager,
      stageGateEvaluator: this.stageGateEvaluator
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

  getPythonPortExtractor(): PythonPortExtractor {
    return this.pythonPortExtractor;
  }

  getCrossLanguageVerifier(): CrossLanguageVerifier {
    return this.crossLanguageVerifier;
  }

  getCrossLanguageDiff(): CrossLanguageDiff {
    return this.crossLanguageDiff;
  }

  getUpgradeDiffRunner(): UpgradeDiffRunner {
    return this.upgradeDiffRunner;
  }

  getPortWorkflowRunner(): PortWorkflowRunner {
    return this.portWorkflowRunner;
  }

  getPortReportBuilder(): PortReportBuilder {
    return this.portReportBuilder;
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

  getTaskManifestManager(): TaskManifestManager {
    return this.taskManifestManager;
  }

  getStageGateEvaluator(): StageGateEvaluator {
    return this.stageGateEvaluator;
  }

  getBaselineRegistry(): BaselineRegistry {
    return this.baselineRegistry;
  }

  getRegressionRunner(): RegressionRunner {
    return this.regressionRunner;
  }

  getRegressionDiff(): RegressionDiff {
    return this.regressionDiff;
  }

  getSdkPackager(): SDKPackager {
    return this.sdkPackager;
  }

  getTaskStateReportBuilder(): TaskStateReportBuilder {
    return this.taskStateReportBuilder;
  }

  getRegressionReportBuilder(): RegressionReportBuilder {
    return this.regressionReportBuilder;
  }

  getSdkReportBuilder(): SdkReportBuilder {
    return this.sdkReportBuilder;
  }

  getRegressionWorkflowRunner(): RegressionWorkflowRunner {
    return this.regressionWorkflowRunner;
  }

  getDeliveryWorkflowRunner(): DeliveryWorkflowRunner {
    return this.deliveryWorkflowRunner;
  }

  getReverseWorkflowRunner(): ReverseWorkflowRunner {
    return this.reverseWorkflowRunner;
  }

  getAnalyzeTargetRunner(): AnalyzeTargetRunner {
    return this.analyzeTargetRunner;
  }
}
