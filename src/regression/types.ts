export interface RegressionBaseline {
  baselineId: string;
  taskId?: string | null;
  createdAt: string;
  source: 'pure' | 'port';
  fixtureFile: string;
  nodeEntryFile: string;
  pythonEntryFile?: string | null;
  expectedNodeOutput?: unknown;
  expectedPythonOutput?: unknown;
  contractSummary?: {
    explicitInputs: string[];
    outputs: string[];
  };
  notes: string[];
}

export interface RegressionRunResult {
  runId: string;
  baselineId: string;
  executedAt: string;
  node?: {
    ok: boolean;
    output?: unknown;
    error?: unknown;
  };
  python?: {
    ok: boolean;
    output?: unknown;
    error?: unknown;
  } | null;
  matchedBaseline: boolean;
  divergence?: {
    layer: 'node' | 'python' | 'cross-language' | 'baseline';
    message: string;
    path: string;
    expected?: unknown;
    actual?: unknown;
  } | null;
  notes: string[];
  nextActionHint: string;
}
