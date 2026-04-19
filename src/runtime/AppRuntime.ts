import { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import { CodeCollector } from '../collector/CodeCollector.js';
import { PageController } from '../page/PageController.js';
import type { AppRuntimeServices } from './types.js';

export class AppRuntime implements AppRuntimeServices {
  readonly pageController: PageController;
  readonly codeCollector: CodeCollector;

  constructor(readonly browserSession: BrowserSessionManager) {
    this.pageController = new PageController(browserSession);
    this.codeCollector = new CodeCollector(browserSession, this.pageController);
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
}
