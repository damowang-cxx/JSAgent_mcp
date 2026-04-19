export type BrowserConnectionMode =
  | 'remote-browser-url'
  | 'remote-ws-endpoint'
  | 'auto-connected'
  | 'launched-local';

export interface BrowserSessionOptions {
  browserURL?: string;
  wsEndpoint?: string;
  autoConnect?: boolean;
  headless?: boolean;
  executablePath?: string;
}

export interface PageSummary {
  index: number;
  id: string;
  url: string;
  title: string;
  isSelected: boolean;
}

export interface BrowserHealth {
  connected: boolean;
  pagesCount: number;
  selectedPageIndex: number | null;
  selectedPageUrl: string | null;
  selectedPageTitle: string | null;
  mode: BrowserConnectionMode | null;
  browserVersion?: string;
  issues: string[];
}

export interface AutoConnectResult {
  browserURL: string;
  wsEndpoint: string;
}
