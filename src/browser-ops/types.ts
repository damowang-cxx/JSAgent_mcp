export interface DomQueryNode {
  selector: string;
  text?: string;
  htmlTag?: string;
  attributes?: Record<string, string>;
  visible?: boolean;
  clickable?: boolean;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface DomQueryResult {
  selector: string;
  all: boolean;
  count: number;
  items: DomQueryNode[];
}

export type ConsoleMessageType = 'log' | 'warning' | 'error' | 'info' | 'debug' | 'trace' | 'unknown';

export interface ConsoleMessageSummary {
  id: string;
  type: ConsoleMessageType;
  text: string;
  url?: string;
  timestamp: string;
}

export interface StorageEntry {
  key: string;
  value: string;
}

export interface StorageCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number | null;
  secure?: boolean;
  httpOnly?: boolean;
}

export interface StorageSnapshot {
  cookies?: StorageCookie[];
  localStorage?: StorageEntry[];
  sessionStorage?: StorageEntry[];
}

export interface SavedSessionState {
  sessionId: string;
  createdAt: string;
  url?: string;
  cookies?: StorageSnapshot['cookies'];
  localStorage?: StorageEntry[];
  sessionStorage?: StorageEntry[];
}

export interface StealthPresetSummary {
  presetId: string;
  description: string;
  features: string[];
}

export interface BrowserOpsSnapshot {
  lastDomQuery?: DomQueryResult | null;
  lastConsoleMessages?: ConsoleMessageSummary[];
  lastStorageSnapshot?: StorageSnapshot | null;
  activePreloadScripts?: Array<{
    scriptId: string;
    createdAt: string;
  }>;
  activeSessionStates?: Array<{
    sessionId: string;
    createdAt: string;
    url?: string;
  }>;
  lastStealthPreset?: string | null;
  currentUserAgent?: string | null;
  notes?: string[];
}
