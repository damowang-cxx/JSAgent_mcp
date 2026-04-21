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
