import type {
  DeliveryAiAugmentationSummary,
  DeliveryCompareAnchorSummary,
  DeliveryContext,
  DeliveryPatchPreflightSummary,
  DeliveryPurePreflightSummary,
  DeliveryRebuildContextSummary
} from '../delivery-consumption/types.js';

export interface SDKPackageExport {
  packageId: string;
  taskId?: string | null;
  createdAt: string;
  target: 'node' | 'python' | 'dual';
  outputDir: string;
  files: string[];
  contractFile: string;
  readmeFile: string;
  notes: string[];
  deliveryContextUsed?: DeliveryContext | null;
  compareAnchorUsed?: DeliveryCompareAnchorSummary | null;
  patchPreflightUsed?: DeliveryPatchPreflightSummary | null;
  rebuildContextUsed?: DeliveryRebuildContextSummary | null;
  purePreflightUsed?: DeliveryPurePreflightSummary | null;
  aiAugmentationUsed?: DeliveryAiAugmentationSummary | null;
}

export interface DeliveryBundleExport {
  bundleId: string;
  taskId?: string | null;
  createdAt: string;
  outputDir: string;
  files: string[];
  target: 'node' | 'python' | 'dual';
  provenanceFile: string;
  smokeEntry?: string | null;
  notes: string[];
  deliveryContextUsed?: DeliveryContext | null;
  compareAnchorUsed?: DeliveryCompareAnchorSummary | null;
  patchPreflightUsed?: DeliveryPatchPreflightSummary | null;
  rebuildContextUsed?: DeliveryRebuildContextSummary | null;
  purePreflightUsed?: DeliveryPurePreflightSummary | null;
  aiAugmentationUsed?: DeliveryAiAugmentationSummary | null;
}

export interface DeliverySmokeTestResult {
  testedAt: string;
  ok: boolean;
  target: 'node' | 'python' | 'dual';
  node?: {
    ok: boolean;
    stdout?: string;
    stderr?: string;
  } | null;
  python?: {
    ok: boolean;
    stdout?: string;
    stderr?: string;
  } | null;
  notes: string[];
  nextActionHint: string;
}
