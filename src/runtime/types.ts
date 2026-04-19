import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { CodeCollector } from '../collector/CodeCollector.js';
import type { PageController } from '../page/PageController.js';

export interface AppRuntimeServices {
  browserSession: BrowserSessionManager;
  pageController: PageController;
  codeCollector: CodeCollector;
}
