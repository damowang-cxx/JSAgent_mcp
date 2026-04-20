import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { RequestInitiatorTracker } from '../network/RequestInitiatorTracker.js';
import type { XhrWatchpointManager } from '../network/xhrWatchpoints.js';
import type { PageController } from '../page/PageController.js';
import type { ReverseWorkflowRunner } from '../workflow/ReverseWorkflowRunner.js';

export interface AppRuntimeServices {
  browserSession: BrowserSessionManager;
  pageController: PageController;
  codeCollector: CodeCollector;
  hookManager: HookManager;
  networkCollector: NetworkCollector;
  requestInitiatorTracker: RequestInitiatorTracker;
  xhrWatchpointManager: XhrWatchpointManager;
  evidenceStore: EvidenceStore;
  reverseWorkflowRunner: ReverseWorkflowRunner;
}
