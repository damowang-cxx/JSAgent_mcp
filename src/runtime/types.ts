import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { HookManager } from '../hook/HookManager.js';
import type { NetworkCollector } from '../network/NetworkCollector.js';
import type { PageController } from '../page/PageController.js';

export interface AppRuntimeServices {
  browserSession: BrowserSessionManager;
  pageController: PageController;
  codeCollector: CodeCollector;
  hookManager: HookManager;
  networkCollector: NetworkCollector;
  evidenceStore: EvidenceStore;
}
