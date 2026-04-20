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
import { ReverseReportBuilder } from '../report/ReverseReportBuilder.js';
import { AnalyzeTargetRunner } from '../workflow/AnalyzeTargetRunner.js';
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
