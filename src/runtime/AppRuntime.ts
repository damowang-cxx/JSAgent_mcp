import { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { CodeCollector } from '../collector/CodeCollector.js';
import { EvidenceStore } from '../evidence/EvidenceStore.js';
import { HookManager } from '../hook/HookManager.js';
import { NetworkCollector } from '../network/NetworkCollector.js';
import { RequestInitiatorTracker } from '../network/RequestInitiatorTracker.js';
import { XhrWatchpointManager } from '../network/xhrWatchpoints.js';
import { PageController } from '../page/PageController.js';
import { ReverseWorkflowRunner } from '../workflow/ReverseWorkflowRunner.js';
import type { AppRuntimeServices } from './types.js';

export class AppRuntime implements AppRuntimeServices {
  readonly pageController: PageController;
  readonly codeCollector: CodeCollector;
  readonly hookManager: HookManager;
  readonly networkCollector: NetworkCollector;
  readonly requestInitiatorTracker: RequestInitiatorTracker;
  readonly xhrWatchpointManager: XhrWatchpointManager;
  readonly evidenceStore: EvidenceStore;
  readonly reverseWorkflowRunner: ReverseWorkflowRunner;

  constructor(readonly browserSession: BrowserSessionManager) {
    this.pageController = new PageController(browserSession);
    this.codeCollector = new CodeCollector(browserSession, this.pageController);
    this.hookManager = new HookManager(browserSession);
    this.requestInitiatorTracker = new RequestInitiatorTracker(browserSession);
    this.networkCollector = new NetworkCollector(browserSession, this.requestInitiatorTracker);
    this.xhrWatchpointManager = new XhrWatchpointManager(browserSession, this.requestInitiatorTracker);
    this.evidenceStore = new EvidenceStore();
    this.reverseWorkflowRunner = new ReverseWorkflowRunner({
      browserSession,
      codeCollector: this.codeCollector,
      evidenceStore: this.evidenceStore,
      hookManager: this.hookManager,
      networkCollector: this.networkCollector,
      pageController: this.pageController,
      requestInitiatorTracker: this.requestInitiatorTracker
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
}
