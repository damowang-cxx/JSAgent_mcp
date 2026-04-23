import type { BrowserSessionManager } from '../browser/BrowserSessionManager.js';
import type { PreloadScriptRegistry } from '../browser-ops/PreloadScriptRegistry.js';
import type { StealthPresetRegistry } from '../browser-ops/StealthPresetRegistry.js';
import type { EvidenceStore } from '../evidence/EvidenceStore.js';
import type { TaskManifestManager } from '../task/TaskManifestManager.js';
import { buildStealthFeatureScript, type StealthFeatureRegistry } from './StealthFeatureRegistry.js';

export interface StealthRuntimeState {
  createdAt?: string;
  presetId?: string | null;
  enabledFeatures: string[];
  disabledFeatures?: string[];
  notes?: string[];
}

export class StealthCoordinator {
  private lastState: StealthRuntimeState | null = null;

  constructor(private readonly deps: {
    browserSession: BrowserSessionManager;
    evidenceStore: EvidenceStore;
    featureRegistry: StealthFeatureRegistry;
    preloadScriptRegistry: PreloadScriptRegistry;
    stealthPresetRegistry: StealthPresetRegistry;
    taskManifestManager: TaskManifestManager;
  }) {}

  async applyCurrentStealth(): Promise<StealthRuntimeState> {
    const featureState = this.deps.featureRegistry.getState();
    const script = buildStealthFeatureScript(featureState.enabled);
    const notes = [
      'Stealth substrate applied through preload coordination on the selected page.',
      'No puppeteer-extra ownership handoff was used; BrowserSessionManager remains the browser owner.',
      'This is not a full anti-detection platform or site adapter.'
    ];
    await this.deps.preloadScriptRegistry.add(script);
    try {
      const page = await this.deps.browserSession.getSelectedPage();
      await page.evaluate((source) => {
        (0, eval)(source);
      }, script);
    } catch (error) {
      notes.push(`Immediate selected-page evaluation failed or was unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }

    const state = {
      createdAt: new Date().toISOString(),
      disabledFeatures: featureState.disabled,
      enabledFeatures: featureState.enabled,
      notes,
      presetId: this.deps.stealthPresetRegistry.getLastPreset()
    };
    this.setLast(state);
    return this.getRuntimeState();
  }

  getRuntimeState(): StealthRuntimeState {
    if (this.lastState) {
      return cloneState(this.lastState);
    }
    const featureState = this.deps.featureRegistry.getState();
    return {
      disabledFeatures: featureState.disabled,
      enabledFeatures: featureState.enabled,
      notes: [
        'Stealth substrate is configured but may not have been applied to the current page yet.',
        'Use set_stealth_features or list_stealth_runtime_state with evidence to capture current substrate state.'
      ],
      presetId: this.deps.stealthPresetRegistry.getLastPreset()
    };
  }

  setLast(state: StealthRuntimeState): void {
    this.lastState = {
      ...state,
      createdAt: state.createdAt ?? new Date().toISOString(),
      disabledFeatures: state.disabledFeatures ? [...state.disabledFeatures] : undefined,
      enabledFeatures: [...state.enabledFeatures],
      notes: state.notes ? [...state.notes] : undefined
    };
  }

  async storeToTask(taskId: string, state: StealthRuntimeState): Promise<void> {
    await this.deps.evidenceStore.openTask({ taskId });
    const current = await this.readFromTask(taskId);
    const merged = mergeState(current, state);
    this.setLast(merged);
    await this.deps.evidenceStore.writeSnapshot(taskId, 'stealth-substrate/latest', merged);
    await this.deps.taskManifestManager.ensureTask(taskId);
    await this.deps.taskManifestManager.updatePointers(taskId, {
      stealthSubstrate: 'stealth-substrate/latest'
    });
  }

  async readFromTask(taskId: string): Promise<StealthRuntimeState | null> {
    try {
      const value = await this.deps.evidenceStore.readSnapshot(taskId, 'stealth-substrate/latest');
      return isStealthRuntimeState(value) ? cloneState(value) : null;
    } catch {
      return null;
    }
  }
}

function mergeState(current: StealthRuntimeState | null, patch: StealthRuntimeState): StealthRuntimeState {
  return {
    ...(current ?? {}),
    ...patch,
    createdAt: new Date().toISOString(),
    disabledFeatures: patch.disabledFeatures ? [...patch.disabledFeatures] : current?.disabledFeatures,
    enabledFeatures: [...patch.enabledFeatures],
    notes: [
      ...(current?.notes ?? []),
      ...(patch.notes ?? [])
    ].slice(-80)
  };
}

function cloneState(state: StealthRuntimeState): StealthRuntimeState {
  return {
    ...state,
    disabledFeatures: state.disabledFeatures ? [...state.disabledFeatures] : undefined,
    enabledFeatures: [...state.enabledFeatures],
    notes: state.notes ? [...state.notes] : undefined
  };
}

function isStealthRuntimeState(value: unknown): value is StealthRuntimeState {
  return Boolean(
    value
      && typeof value === 'object'
      && Array.isArray((value as StealthRuntimeState).enabledFeatures)
  );
}
