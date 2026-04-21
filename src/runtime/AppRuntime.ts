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
import { BoundaryFixtureGenerator } from '../fixture/BoundaryFixtureGenerator.js';
import { FixtureCandidateRegistry } from '../fixture/FixtureCandidateRegistry.js';
import { HookManager } from '../hook/HookManager.js';
import { IntermediateAlignment } from '../intermediate/IntermediateAlignment.js';
import { IntermediateDiff } from '../intermediate/IntermediateDiff.js';
import { IntermediateProbeRegistry } from '../intermediate/IntermediateProbeRegistry.js';
import { NetworkCollector } from '../network/NetworkCollector.js';
import { RequestInitiatorTracker } from '../network/RequestInitiatorTracker.js';
import { XhrWatchpointManager } from '../network/xhrWatchpoints.js';
import { PageController } from '../page/PageController.js';
import { AcceptanceRecorder } from '../patch/AcceptanceRecorder.js';
import { FixtureStabilizer } from '../patch/FixtureStabilizer.js';
import { PatchApplier } from '../patch/PatchApplier.js';
import { PatchLoopRunner } from '../patch/PatchLoopRunner.js';
import { PatchPlanManager } from '../patch/PatchPlanManager.js';
import { ScenarioPatchHintGenerator } from '../patch/ScenarioPatchHintGenerator.js';
import { ScenarioPatchHintRegistry } from '../patch/ScenarioPatchHintRegistry.js';
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
import { IntermediateRegressionRunner } from '../regression/IntermediateRegressionRunner.js';
import { RegressionDiff } from '../regression/RegressionDiff.js';
import { UpgradeRegressionRunner } from '../regression/UpgradeRegressionRunner.js';
import { RegressionRunner } from '../regression/RegressionRunner.js';
import { VersionedBaselineRegistry } from '../regression/VersionedBaselineRegistry.js';
import { DeliveryReportBuilder } from '../report/DeliveryReportBuilder.js';
import { CaptureReportBuilder } from '../report/CaptureReportBuilder.js';
import { FixtureCandidateReportBuilder } from '../report/FixtureCandidateReportBuilder.js';
import { IntermediateRegressionReportBuilder } from '../report/IntermediateRegressionReportBuilder.js';
import { PatchReportBuilder } from '../report/PatchReportBuilder.js';
import { PortReportBuilder } from '../report/PortReportBuilder.js';
import { ProbePlanReportBuilder } from '../report/ProbePlanReportBuilder.js';
import { PureReportBuilder } from '../report/PureReportBuilder.js';
import { RebuildReportBuilder } from '../report/RebuildReportBuilder.js';
import { RegressionReportBuilder } from '../report/RegressionReportBuilder.js';
import { ReverseReportBuilder } from '../report/ReverseReportBuilder.js';
import { ScenarioReportBuilder } from '../report/ScenarioReportBuilder.js';
import { ScenarioPatchHintReportBuilder } from '../report/ScenarioPatchHintReportBuilder.js';
import { SdkReportBuilder } from '../report/SdkReportBuilder.js';
import { TaskStateReportBuilder } from '../report/TaskStateReportBuilder.js';
import { UpgradeReportBuilder } from '../report/UpgradeReportBuilder.js';
import { WindowReportBuilder } from '../report/WindowReportBuilder.js';
import { DivergenceComparator } from '../rebuild/DivergenceComparator.js';
import { EnvAccessLogger } from '../rebuild/EnvAccessLogger.js';
import { FixtureExtractor } from '../rebuild/FixtureExtractor.js';
import { PatchAdvisor } from '../rebuild/PatchAdvisor.js';
import { RebuildBundleExporter } from '../rebuild/RebuildBundleExporter.js';
import { RebuildRunner } from '../rebuild/RebuildRunner.js';
import { DeliveryAssembler } from '../sdk/DeliveryAssembler.js';
import { DeliverySmokeTester } from '../sdk/DeliverySmokeTester.js';
import { ProvenanceWriter } from '../sdk/ProvenanceWriter.js';
import { SDKPackager } from '../sdk/SDKPackager.js';
import { HelperBoundaryExtractor } from '../helper/HelperBoundaryExtractor.js';
import { HelperBoundaryRegistry } from '../helper/HelperBoundaryRegistry.js';
import { CapturePresetRegistry } from '../replay/CapturePresetRegistry.js';
import { ReplayActionRunner } from '../replay/ReplayActionRunner.js';
import { ReplayEvidenceWindow } from '../replay/ReplayEvidenceWindow.js';
import { ReplayRecipeRunner } from '../replay/ReplayRecipeRunner.js';
import { WaitConditionEvaluator } from '../replay/WaitConditionEvaluator.js';
import { ProbePlanRegistry } from '../probe/ProbePlanRegistry.js';
import { ScenarioProbePlanner } from '../probe/ScenarioProbePlanner.js';
import { CryptoHelperLocator } from '../scenario/CryptoHelperLocator.js';
import { RequestSinkLocator } from '../scenario/RequestSinkLocator.js';
import { ScenarioActionPlanner } from '../scenario/ScenarioActionPlanner.js';
import { ScenarioPresetRegistry } from '../scenario/ScenarioPresetRegistry.js';
import { ScenarioWorkflowRunner } from '../scenario/ScenarioWorkflowRunner.js';
import { SignatureScenarioAnalyzer } from '../scenario/SignatureScenarioAnalyzer.js';
import { TokenScenarioAnalyzer } from '../scenario/TokenScenarioAnalyzer.js';
import { StageGateEvaluator } from '../task/StageGateEvaluator.js';
import { TaskManifestManager } from '../task/TaskManifestManager.js';
import { AnalyzeTargetRunner } from '../workflow/AnalyzeTargetRunner.js';
import { DeliveryHardeningRunner } from '../workflow/DeliveryHardeningRunner.js';
import { DeliveryWorkflowRunner } from '../workflow/DeliveryWorkflowRunner.js';
import { PatchWorkflowRunner } from '../workflow/PatchWorkflowRunner.js';
import { PortWorkflowRunner } from '../workflow/PortWorkflowRunner.js';
import { PureExtractionRunner } from '../workflow/PureExtractionRunner.js';
import { RebuildWorkflowRunner } from '../workflow/RebuildWorkflowRunner.js';
import { RegressionWorkflowRunner } from '../workflow/RegressionWorkflowRunner.js';
import { ReverseWorkflowRunner } from '../workflow/ReverseWorkflowRunner.js';
import { UpgradeWorkflowRunner } from '../workflow/UpgradeWorkflowRunner.js';
import { DependencyWindowExtractor } from '../window/DependencyWindowExtractor.js';
import { DependencyWindowRegistry } from '../window/DependencyWindowRegistry.js';
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
  readonly intermediateProbeRegistry: IntermediateProbeRegistry;
  readonly intermediateAlignment: IntermediateAlignment;
  readonly intermediateDiff: IntermediateDiff;
  readonly baselineRegistry: BaselineRegistry;
  readonly versionedBaselineRegistry: VersionedBaselineRegistry;
  readonly regressionRunner: RegressionRunner;
  readonly intermediateRegressionRunner: IntermediateRegressionRunner;
  readonly upgradeRegressionRunner: UpgradeRegressionRunner;
  readonly regressionDiff: RegressionDiff;
  readonly sdkPackager: SDKPackager;
  readonly deliveryAssembler: DeliveryAssembler;
  readonly deliverySmokeTester: DeliverySmokeTester;
  readonly provenanceWriter: ProvenanceWriter;
  readonly taskStateReportBuilder: TaskStateReportBuilder;
  readonly intermediateRegressionReportBuilder: IntermediateRegressionReportBuilder;
  readonly regressionReportBuilder: RegressionReportBuilder;
  readonly sdkReportBuilder: SdkReportBuilder;
  readonly upgradeReportBuilder: UpgradeReportBuilder;
  readonly deliveryReportBuilder: DeliveryReportBuilder;
  readonly regressionWorkflowRunner: RegressionWorkflowRunner;
  readonly upgradeWorkflowRunner: UpgradeWorkflowRunner;
  readonly deliveryWorkflowRunner: DeliveryWorkflowRunner;
  readonly deliveryHardeningRunner: DeliveryHardeningRunner;
  readonly reverseWorkflowRunner: ReverseWorkflowRunner;
  readonly analyzeTargetRunner: AnalyzeTargetRunner;
  readonly signatureScenarioAnalyzer: SignatureScenarioAnalyzer;
  readonly tokenScenarioAnalyzer: TokenScenarioAnalyzer;
  readonly requestSinkLocator: RequestSinkLocator;
  readonly cryptoHelperLocator: CryptoHelperLocator;
  readonly scenarioPresetRegistry: ScenarioPresetRegistry;
  readonly scenarioActionPlanner: ScenarioActionPlanner;
  readonly scenarioWorkflowRunner: ScenarioWorkflowRunner;
  readonly scenarioReportBuilder: ScenarioReportBuilder;
  readonly capturePresetRegistry: CapturePresetRegistry;
  readonly replayActionRunner: ReplayActionRunner;
  readonly replayRecipeRunner: ReplayRecipeRunner;
  readonly helperBoundaryExtractor: HelperBoundaryExtractor;
  readonly helperBoundaryRegistry: HelperBoundaryRegistry;
  readonly captureReportBuilder: CaptureReportBuilder;
  readonly dependencyWindowExtractor: DependencyWindowExtractor;
  readonly dependencyWindowRegistry: DependencyWindowRegistry;
  readonly scenarioProbePlanner: ScenarioProbePlanner;
  readonly probePlanRegistry: ProbePlanRegistry;
  readonly windowReportBuilder: WindowReportBuilder;
  readonly probePlanReportBuilder: ProbePlanReportBuilder;
  readonly boundaryFixtureGenerator: BoundaryFixtureGenerator;
  readonly fixtureCandidateRegistry: FixtureCandidateRegistry;
  readonly scenarioPatchHintGenerator: ScenarioPatchHintGenerator;
  readonly scenarioPatchHintRegistry: ScenarioPatchHintRegistry;
  readonly fixtureCandidateReportBuilder: FixtureCandidateReportBuilder;
  readonly scenarioPatchHintReportBuilder: ScenarioPatchHintReportBuilder;
  private readonly waitConditionEvaluator: WaitConditionEvaluator;
  private readonly replayEvidenceWindow: ReplayEvidenceWindow;

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
    this.intermediateProbeRegistry = new IntermediateProbeRegistry(this.evidenceStore);
    this.intermediateAlignment = new IntermediateAlignment();
    this.intermediateDiff = new IntermediateDiff();
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
    this.requestSinkLocator = new RequestSinkLocator({
      browserSession,
      codeCollector: this.codeCollector,
      hookManager: this.hookManager,
      networkCollector: this.networkCollector,
      requestChainCorrelator: this.requestChainCorrelator
    });
    this.cryptoHelperLocator = new CryptoHelperLocator({
      analyzeTargetRunner: this.analyzeTargetRunner,
      codeCollector: this.codeCollector,
      cryptoDetector: this.cryptoDetector,
      deobfuscator: this.deobfuscator,
      staticAnalyzer: this.staticAnalyzer
    });
    this.tokenScenarioAnalyzer = new TokenScenarioAnalyzer({
      browserSession,
      codeCollector: this.codeCollector,
      hookManager: this.hookManager,
      networkCollector: this.networkCollector
    });
    this.signatureScenarioAnalyzer = new SignatureScenarioAnalyzer({
      analyzeTargetRunner: this.analyzeTargetRunner,
      browserSession,
      codeCollector: this.codeCollector,
      cryptoDetector: this.cryptoDetector,
      cryptoHelperLocator: this.cryptoHelperLocator,
      deobfuscator: this.deobfuscator,
      evidenceStore: this.evidenceStore,
      hookManager: this.hookManager,
      networkCollector: this.networkCollector,
      requestChainCorrelator: this.requestChainCorrelator,
      requestInitiatorTracker: this.requestInitiatorTracker,
      requestSinkLocator: this.requestSinkLocator,
      staticAnalyzer: this.staticAnalyzer,
      taskManifestManager: this.taskManifestManager
    });
    this.scenarioPresetRegistry = new ScenarioPresetRegistry();
    this.scenarioActionPlanner = new ScenarioActionPlanner();
    this.scenarioReportBuilder = new ScenarioReportBuilder();
    this.capturePresetRegistry = new CapturePresetRegistry();
    this.captureReportBuilder = new CaptureReportBuilder();
    this.windowReportBuilder = new WindowReportBuilder();
    this.probePlanReportBuilder = new ProbePlanReportBuilder();
    this.fixtureCandidateReportBuilder = new FixtureCandidateReportBuilder();
    this.scenarioPatchHintReportBuilder = new ScenarioPatchHintReportBuilder();
    this.waitConditionEvaluator = new WaitConditionEvaluator({
      networkCollector: this.networkCollector,
      pageController: this.pageController
    });
    this.replayActionRunner = new ReplayActionRunner({
      browserSession,
      pageController: this.pageController,
      waitConditionEvaluator: this.waitConditionEvaluator
    });
    this.replayEvidenceWindow = new ReplayEvidenceWindow({
      browserSession,
      hookManager: this.hookManager,
      networkCollector: this.networkCollector
    });
    this.scenarioWorkflowRunner = new ScenarioWorkflowRunner({
      browserSession,
      codeCollector: this.codeCollector,
      cryptoHelperLocator: this.cryptoHelperLocator,
      evidenceStore: this.evidenceStore,
      hookManager: this.hookManager,
      networkCollector: this.networkCollector,
      requestInitiatorTracker: this.requestInitiatorTracker,
      requestSinkLocator: this.requestSinkLocator,
      scenarioActionPlanner: this.scenarioActionPlanner,
      scenarioPresetRegistry: this.scenarioPresetRegistry,
      scenarioReportBuilder: this.scenarioReportBuilder,
      signatureScenarioAnalyzer: this.signatureScenarioAnalyzer,
      taskManifestManager: this.taskManifestManager,
      tokenScenarioAnalyzer: this.tokenScenarioAnalyzer
    });
    this.replayRecipeRunner = new ReplayRecipeRunner({
      browserSession,
      capturePresetRegistry: this.capturePresetRegistry,
      captureReportBuilder: this.captureReportBuilder,
      codeCollector: this.codeCollector,
      evidenceStore: this.evidenceStore,
      hookManager: this.hookManager,
      networkCollector: this.networkCollector,
      replayActionRunner: this.replayActionRunner,
      replayEvidenceWindow: this.replayEvidenceWindow,
      requestInitiatorTracker: this.requestInitiatorTracker,
      signatureScenarioAnalyzer: this.signatureScenarioAnalyzer,
      taskManifestManager: this.taskManifestManager
    });
    this.helperBoundaryRegistry = new HelperBoundaryRegistry(this.evidenceStore);
    this.dependencyWindowRegistry = new DependencyWindowRegistry(this.evidenceStore);
    this.probePlanRegistry = new ProbePlanRegistry(this.evidenceStore);
    this.fixtureCandidateRegistry = new FixtureCandidateRegistry(this.evidenceStore);
    this.scenarioPatchHintRegistry = new ScenarioPatchHintRegistry(this.evidenceStore);
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
    this.helperBoundaryExtractor = new HelperBoundaryExtractor({
      browserSession,
      codeCollector: this.codeCollector,
      cryptoHelperLocator: this.cryptoHelperLocator,
      evidenceStore: this.evidenceStore,
      hookManager: this.hookManager,
      networkCollector: this.networkCollector,
      pureExtractionRunner: this.pureExtractionRunner,
      rebuildWorkflowRunner: this.rebuildWorkflowRunner,
      replayRecipeRunner: this.replayRecipeRunner,
      requestSinkLocator: this.requestSinkLocator,
      scenarioWorkflowRunner: this.scenarioWorkflowRunner,
      signatureScenarioAnalyzer: this.signatureScenarioAnalyzer,
      tokenScenarioAnalyzer: this.tokenScenarioAnalyzer
    });
    this.dependencyWindowExtractor = new DependencyWindowExtractor({
      codeCollector: this.codeCollector,
      cryptoHelperLocator: this.cryptoHelperLocator,
      evidenceStore: this.evidenceStore,
      helperBoundaryExtractor: this.helperBoundaryExtractor,
      helperBoundaryRegistry: this.helperBoundaryRegistry,
      networkCollector: this.networkCollector,
      pureExtractionRunner: this.pureExtractionRunner,
      rebuildWorkflowRunner: this.rebuildWorkflowRunner,
      replayRecipeRunner: this.replayRecipeRunner,
      requestSinkLocator: this.requestSinkLocator,
      scenarioWorkflowRunner: this.scenarioWorkflowRunner,
      signatureScenarioAnalyzer: this.signatureScenarioAnalyzer,
      taskManifestManager: this.taskManifestManager,
      tokenScenarioAnalyzer: this.tokenScenarioAnalyzer
    });
    this.scenarioProbePlanner = new ScenarioProbePlanner({
      dependencyWindowExtractor: this.dependencyWindowExtractor,
      dependencyWindowRegistry: this.dependencyWindowRegistry,
      evidenceStore: this.evidenceStore,
      helperBoundaryRegistry: this.helperBoundaryRegistry,
      replayRecipeRunner: this.replayRecipeRunner,
      scenarioWorkflowRunner: this.scenarioWorkflowRunner
    });
    this.boundaryFixtureGenerator = new BoundaryFixtureGenerator({
      dependencyWindowExtractor: this.dependencyWindowExtractor,
      dependencyWindowRegistry: this.dependencyWindowRegistry,
      evidenceStore: this.evidenceStore,
      helperBoundaryExtractor: this.helperBoundaryExtractor,
      helperBoundaryRegistry: this.helperBoundaryRegistry,
      probePlanRegistry: this.probePlanRegistry,
      pureExtractionRunner: this.pureExtractionRunner,
      rebuildWorkflowRunner: this.rebuildWorkflowRunner,
      replayRecipeRunner: this.replayRecipeRunner,
      requestSinkLocator: this.requestSinkLocator,
      scenarioWorkflowRunner: this.scenarioWorkflowRunner,
      signatureScenarioAnalyzer: this.signatureScenarioAnalyzer,
      taskManifestManager: this.taskManifestManager,
      tokenScenarioAnalyzer: this.tokenScenarioAnalyzer
    });
    this.scenarioPatchHintGenerator = new ScenarioPatchHintGenerator({
      dependencyWindowRegistry: this.dependencyWindowRegistry,
      evidenceStore: this.evidenceStore,
      helperBoundaryRegistry: this.helperBoundaryRegistry,
      patchPlanManager: this.patchPlanManager,
      patchWorkflowRunner: this.patchWorkflowRunner,
      probePlanRegistry: this.probePlanRegistry,
      pureExtractionRunner: this.pureExtractionRunner,
      rebuildWorkflowRunner: this.rebuildWorkflowRunner,
      replayRecipeRunner: this.replayRecipeRunner,
      scenarioWorkflowRunner: this.scenarioWorkflowRunner
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
    this.versionedBaselineRegistry = new VersionedBaselineRegistry({
      baselineRegistry: this.baselineRegistry,
      evidenceStore: this.evidenceStore,
      intermediateProbeRegistry: this.intermediateProbeRegistry,
      stageGateEvaluator: this.stageGateEvaluator
    });
    this.regressionRunner = new RegressionRunner({
      baselineRegistry: this.baselineRegistry,
      crossLanguageVerifier: this.crossLanguageVerifier,
      evidenceStore: this.evidenceStore,
      pureVerifier: this.pureVerifier,
      regressionDiff: this.regressionDiff
    });
    this.intermediateRegressionRunner = new IntermediateRegressionRunner({
      baselineRegistry: this.baselineRegistry,
      evidenceStore: this.evidenceStore,
      intermediateAlignment: this.intermediateAlignment,
      intermediateDiff: this.intermediateDiff,
      intermediateProbeRegistry: this.intermediateProbeRegistry,
      regressionRunner: this.regressionRunner
    });
    this.upgradeRegressionRunner = new UpgradeRegressionRunner({
      evidenceStore: this.evidenceStore,
      intermediateRegressionRunner: this.intermediateRegressionRunner,
      regressionRunner: this.regressionRunner,
      upgradeDiffRunner: this.upgradeDiffRunner,
      versionedBaselineRegistry: this.versionedBaselineRegistry
    });
    this.sdkPackager = new SDKPackager({
      baselineRegistry: this.baselineRegistry,
      evidenceStore: this.evidenceStore,
      stageGateEvaluator: this.stageGateEvaluator,
      taskManifestManager: this.taskManifestManager
    });
    this.provenanceWriter = new ProvenanceWriter({
      evidenceStore: this.evidenceStore,
      taskManifestManager: this.taskManifestManager
    });
    this.deliveryAssembler = new DeliveryAssembler({
      baselineRegistry: this.baselineRegistry,
      evidenceStore: this.evidenceStore,
      provenanceWriter: this.provenanceWriter,
      sdkPackager: this.sdkPackager,
      stageGateEvaluator: this.stageGateEvaluator,
      taskManifestManager: this.taskManifestManager
    });
    this.deliverySmokeTester = new DeliverySmokeTester();
    this.taskStateReportBuilder = new TaskStateReportBuilder({
      stageGateEvaluator: this.stageGateEvaluator,
      taskManifestManager: this.taskManifestManager
    });
    this.intermediateRegressionReportBuilder = new IntermediateRegressionReportBuilder();
    this.regressionReportBuilder = new RegressionReportBuilder();
    this.sdkReportBuilder = new SdkReportBuilder();
    this.upgradeReportBuilder = new UpgradeReportBuilder();
    this.deliveryReportBuilder = new DeliveryReportBuilder();
    this.regressionWorkflowRunner = new RegressionWorkflowRunner({
      baselineRegistry: this.baselineRegistry,
      regressionRunner: this.regressionRunner,
      stageGateEvaluator: this.stageGateEvaluator
    });
    this.upgradeWorkflowRunner = new UpgradeWorkflowRunner(this.upgradeRegressionRunner);
    this.deliveryWorkflowRunner = new DeliveryWorkflowRunner({
      baselineRegistry: this.baselineRegistry,
      evidenceStore: this.evidenceStore,
      regressionRunner: this.regressionRunner,
      sdkPackager: this.sdkPackager,
      stageGateEvaluator: this.stageGateEvaluator
    });
    this.deliveryHardeningRunner = new DeliveryHardeningRunner({
      deliveryAssembler: this.deliveryAssembler,
      deliveryReportBuilder: this.deliveryReportBuilder,
      deliverySmokeTester: this.deliverySmokeTester,
      evidenceStore: this.evidenceStore,
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

  getIntermediateProbeRegistry(): IntermediateProbeRegistry {
    return this.intermediateProbeRegistry;
  }

  getIntermediateAlignment(): IntermediateAlignment {
    return this.intermediateAlignment;
  }

  getIntermediateDiff(): IntermediateDiff {
    return this.intermediateDiff;
  }

  getBaselineRegistry(): BaselineRegistry {
    return this.baselineRegistry;
  }

  getVersionedBaselineRegistry(): VersionedBaselineRegistry {
    return this.versionedBaselineRegistry;
  }

  getRegressionRunner(): RegressionRunner {
    return this.regressionRunner;
  }

  getIntermediateRegressionRunner(): IntermediateRegressionRunner {
    return this.intermediateRegressionRunner;
  }

  getUpgradeRegressionRunner(): UpgradeRegressionRunner {
    return this.upgradeRegressionRunner;
  }

  getRegressionDiff(): RegressionDiff {
    return this.regressionDiff;
  }

  getSdkPackager(): SDKPackager {
    return this.sdkPackager;
  }

  getDeliveryAssembler(): DeliveryAssembler {
    return this.deliveryAssembler;
  }

  getDeliverySmokeTester(): DeliverySmokeTester {
    return this.deliverySmokeTester;
  }

  getProvenanceWriter(): ProvenanceWriter {
    return this.provenanceWriter;
  }

  getTaskStateReportBuilder(): TaskStateReportBuilder {
    return this.taskStateReportBuilder;
  }

  getIntermediateRegressionReportBuilder(): IntermediateRegressionReportBuilder {
    return this.intermediateRegressionReportBuilder;
  }

  getRegressionReportBuilder(): RegressionReportBuilder {
    return this.regressionReportBuilder;
  }

  getSdkReportBuilder(): SdkReportBuilder {
    return this.sdkReportBuilder;
  }

  getUpgradeReportBuilder(): UpgradeReportBuilder {
    return this.upgradeReportBuilder;
  }

  getDeliveryReportBuilder(): DeliveryReportBuilder {
    return this.deliveryReportBuilder;
  }

  getRegressionWorkflowRunner(): RegressionWorkflowRunner {
    return this.regressionWorkflowRunner;
  }

  getUpgradeWorkflowRunner(): UpgradeWorkflowRunner {
    return this.upgradeWorkflowRunner;
  }

  getDeliveryWorkflowRunner(): DeliveryWorkflowRunner {
    return this.deliveryWorkflowRunner;
  }

  getDeliveryHardeningRunner(): DeliveryHardeningRunner {
    return this.deliveryHardeningRunner;
  }

  getReverseWorkflowRunner(): ReverseWorkflowRunner {
    return this.reverseWorkflowRunner;
  }

  getAnalyzeTargetRunner(): AnalyzeTargetRunner {
    return this.analyzeTargetRunner;
  }

  getSignatureScenarioAnalyzer(): SignatureScenarioAnalyzer {
    return this.signatureScenarioAnalyzer;
  }

  getTokenScenarioAnalyzer(): TokenScenarioAnalyzer {
    return this.tokenScenarioAnalyzer;
  }

  getRequestSinkLocator(): RequestSinkLocator {
    return this.requestSinkLocator;
  }

  getCryptoHelperLocator(): CryptoHelperLocator {
    return this.cryptoHelperLocator;
  }

  getScenarioPresetRegistry(): ScenarioPresetRegistry {
    return this.scenarioPresetRegistry;
  }

  getScenarioActionPlanner(): ScenarioActionPlanner {
    return this.scenarioActionPlanner;
  }

  getScenarioWorkflowRunner(): ScenarioWorkflowRunner {
    return this.scenarioWorkflowRunner;
  }

  getScenarioReportBuilder(): ScenarioReportBuilder {
    return this.scenarioReportBuilder;
  }

  getCapturePresetRegistry(): CapturePresetRegistry {
    return this.capturePresetRegistry;
  }

  getReplayActionRunner(): ReplayActionRunner {
    return this.replayActionRunner;
  }

  getReplayRecipeRunner(): ReplayRecipeRunner {
    return this.replayRecipeRunner;
  }

  getHelperBoundaryExtractor(): HelperBoundaryExtractor {
    return this.helperBoundaryExtractor;
  }

  getHelperBoundaryRegistry(): HelperBoundaryRegistry {
    return this.helperBoundaryRegistry;
  }

  getCaptureReportBuilder(): CaptureReportBuilder {
    return this.captureReportBuilder;
  }

  getDependencyWindowExtractor(): DependencyWindowExtractor {
    return this.dependencyWindowExtractor;
  }

  getDependencyWindowRegistry(): DependencyWindowRegistry {
    return this.dependencyWindowRegistry;
  }

  getScenarioProbePlanner(): ScenarioProbePlanner {
    return this.scenarioProbePlanner;
  }

  getProbePlanRegistry(): ProbePlanRegistry {
    return this.probePlanRegistry;
  }

  getWindowReportBuilder(): WindowReportBuilder {
    return this.windowReportBuilder;
  }

  getProbePlanReportBuilder(): ProbePlanReportBuilder {
    return this.probePlanReportBuilder;
  }

  getBoundaryFixtureGenerator(): BoundaryFixtureGenerator {
    return this.boundaryFixtureGenerator;
  }

  getFixtureCandidateRegistry(): FixtureCandidateRegistry {
    return this.fixtureCandidateRegistry;
  }

  getScenarioPatchHintGenerator(): ScenarioPatchHintGenerator {
    return this.scenarioPatchHintGenerator;
  }

  getScenarioPatchHintRegistry(): ScenarioPatchHintRegistry {
    return this.scenarioPatchHintRegistry;
  }

  getFixtureCandidateReportBuilder(): FixtureCandidateReportBuilder {
    return this.fixtureCandidateReportBuilder;
  }

  getScenarioPatchHintReportBuilder(): ScenarioPatchHintReportBuilder {
    return this.scenarioPatchHintReportBuilder;
  }
}
