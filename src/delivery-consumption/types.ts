export interface DeliveryCompareAnchorSummary {
  anchorId: string;
  label: string;
  kind: string;
}

export interface DeliveryPatchPreflightSummary {
  surface: string;
  target: string;
}

export interface DeliveryRebuildContextSummary {
  contextId: string;
  fixtureSource: string;
}

export interface DeliveryPurePreflightSummary {
  contextId: string;
  source: string;
}

export interface DeliveryFlowReasoningSummary {
  resultId: string;
  targetName: string;
}

export interface DeliveryAiAugmentationSummary {
  augmentationId: string;
  mode: string;
  providerAvailable: boolean;
}

export interface RegressionContext {
  contextId: string;
  baselineId?: string;
  compareAnchor?: DeliveryCompareAnchorSummary | null;
  patchPreflight?: DeliveryPatchPreflightSummary | null;
  rebuildContext?: DeliveryRebuildContextSummary | null;
  purePreflight?: DeliveryPurePreflightSummary | null;
  flowReasoning?: DeliveryFlowReasoningSummary | null;
  regressionNotes: string[];
  nextActions: string[];
  stopIf: string[];
}

export interface DeliveryContext {
  contextId: string;
  regressionContext?: RegressionContext | null;
  compareAnchor?: DeliveryCompareAnchorSummary | null;
  patchPreflight?: DeliveryPatchPreflightSummary | null;
  rebuildContext?: DeliveryRebuildContextSummary | null;
  purePreflight?: DeliveryPurePreflightSummary | null;
  aiAugmentation?: DeliveryAiAugmentationSummary | null;
  handoffNotes: string[];
  provenanceSummary: string[];
  nextActions: string[];
  stopIf: string[];
}

export interface StoredRegressionContextSnapshot {
  createdAt: string;
  taskId?: string;
  result: RegressionContext;
}

export interface StoredDeliveryContextSnapshot {
  createdAt: string;
  taskId?: string;
  result: DeliveryContext;
}
