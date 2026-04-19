export type HookType = 'function' | 'fetch' | 'xhr';

export interface HookCreateOptions {
  type: HookType;
  hookId?: string;
  description?: string;
  params?: Record<string, unknown>;
}

export interface HookMeta {
  hookId: string;
  type: HookType;
  description: string;
  createdAt: string;
  enabled: boolean;
  injectedTargets: number;
  config: HookCreateOptions;
}

export interface HookInjectionOptions {
  currentDocument?: boolean;
  futureDocuments?: boolean;
}

export interface HookDataResult {
  hookId?: string;
  totalHooks: number;
  records: Record<string, Array<Record<string, unknown>>>;
}

export interface HookManagerStats {
  totalHooks: number;
  enabledHooks: number;
  disabledHooks: number;
}
