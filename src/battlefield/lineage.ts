import type { BattlefieldIntegrationSnapshot } from './types.js';

export interface BattlefieldLineageContribution {
  notes: string[];
  nextActions: string[];
  stopIf: string[];
  whyTheseSteps: string[];
  provenance: string[];
  basedOn: string[];
}

export interface BattlefieldSnapshotRegistryLike {
  getLast(): BattlefieldIntegrationSnapshot | null;
  readFromTask(taskId: string): Promise<BattlefieldIntegrationSnapshot | null>;
}

export async function readBattlefieldLineageSnapshot(
  registry: BattlefieldSnapshotRegistryLike | undefined,
  input: {
    taskId?: string;
    preferTaskArtifact?: boolean;
  } = {}
): Promise<BattlefieldIntegrationSnapshot | null> {
  if (!registry) {
    return null;
  }

  if (input.taskId) {
    const snapshot = await registry.readFromTask(input.taskId);
    if (snapshot || input.preferTaskArtifact) {
      return snapshot;
    }
  }

  return registry.getLast();
}

export function buildBattlefieldLineageContribution(
  snapshot: BattlefieldIntegrationSnapshot | null,
  consumer: string
): BattlefieldLineageContribution {
  if (!snapshot) {
    return {
      basedOn: [],
      nextActions: [],
      notes: [],
      provenance: [],
      stopIf: [],
      whyTheseSteps: []
    };
  }

  const notes = [
    `Battlefield context ${snapshot.context.contextId} is available for ${consumer}.`,
    snapshot.actionPlan
      ? `Battlefield recommended phase before ${consumer}: ${snapshot.actionPlan.phase}.`
      : `No cached battlefield action plan is attached to ${snapshot.context.contextId}; use plan_battlefield_action if the next phase is still unclear.`
  ];
  const nextActions = snapshot.actionPlan
    ? [
        `Reuse battlefield phase ${snapshot.actionPlan.phase} before broad escalation: ${snapshot.actionPlan.recommendedTools.slice(0, 5).join(', ')}.`,
        ...snapshot.actionPlan.nextActions.slice(0, 2)
      ]
    : snapshot.context.nextActions.slice(0, 2);
  const stopIf = snapshot.actionPlan
    ? snapshot.actionPlan.stopIf.slice(0, 2)
    : snapshot.context.stopIf.slice(0, 2);

  return {
    basedOn: [
      `battlefield:${snapshot.context.contextId}`,
      ...(snapshot.actionPlan?.basedOn ?? [])
    ].slice(0, 8),
    nextActions,
    notes,
    provenance: [
      `Battlefield context: ${snapshot.context.contextId}.`,
      snapshot.actionPlan
        ? `Battlefield phase: ${snapshot.actionPlan.phase}.`
        : 'Battlefield phase: unresolved.'
    ],
    stopIf,
    whyTheseSteps: [
      `Battlefield lineage keeps ${consumer} tied to live browser/source/runtime evidence before heavier workflow escalation.`
    ]
  };
}

export function uniqueStrings(values: readonly string[], limit = 50): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

