import type { CodeSummarizer } from '../analysis/CodeSummarizer.js';
import type { CryptoDetector } from '../analysis/CryptoDetector.js';
import type { RiskScorer } from '../analysis/RiskScorer.js';
import type { SessionReporter } from '../analysis/SessionReporter.js';
import type { StaticAnalyzer } from '../analysis/StaticAnalyzer.js';
import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { RequestInitiatorTracker } from '../network/RequestInitiatorTracker.js';
import type { XhrWatchpointManager } from '../network/xhrWatchpoints.js';
import type { PageController } from '../page/PageController.js';
import type { AnalyzeTargetRunner } from '../workflow/AnalyzeTargetRunner.js';
import type { ReverseWorkflowRunner } from '../workflow/ReverseWorkflowRunner.js';

export interface AppRuntimeServices {
  browserSession: BrowserSessionManager;
  pageController: PageController;
  codeCollector: CodeCollector;
  codeSummarizer: CodeSummarizer;
  staticAnalyzer: StaticAnalyzer;
  cryptoDetector: CryptoDetector;
  riskScorer: RiskScorer;
  sessionReporter: SessionReporter;
  hookManager: HookManager;
  networkCollector: NetworkCollector;
  requestInitiatorTracker: RequestInitiatorTracker;
  xhrWatchpointManager: XhrWatchpointManager;
  evidenceStore: EvidenceStore;
  reverseWorkflowRunner: ReverseWorkflowRunner;
  analyzeTargetRunner: AnalyzeTargetRunner;
}
