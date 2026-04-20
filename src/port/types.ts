import type { NodePureScaffold, PureFixture, PureVerificationResult } from '../pure/types.js';

export interface PythonPureScaffold {
  createdAt: string;
  taskId?: string | null;
  outputDir: string;
  entryFile: string;
  implFile: string;
  fixtureFile: string;
  files: string[];
  notes: string[];
}

export interface PythonDivergence {
  kind: 'input-mismatch' | 'intermediate-mismatch' | 'output-mismatch' | 'node-error' | 'python-error' | 'no-output';
  path: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface PythonVerificationResult {
  verifiedAt: string;
  ok: boolean;
  nodeOutput?: unknown;
  pythonOutput?: unknown;
  divergence?: PythonDivergence | null;
  notes: string[];
}

export interface CrossLanguageDiffResult {
  createdAt: string;
  matched: boolean;
  divergence?: {
    kind: string;
    path: string;
    message: string;
    expected?: unknown;
    actual?: unknown;
  } | null;
  unchangedParts: string[];
  changedParts: string[];
  nextActionHint: string;
  notes: string[];
}

export interface PortWorkflowResult {
  task?: {
    taskId: string;
    taskDir: string;
  } | null;
  pure: {
    node: NodePureScaffold;
    fixture: PureFixture;
    verification: PureVerificationResult;
  };
  python: {
    scaffold: PythonPureScaffold;
    verification: PythonVerificationResult;
  };
  diff: CrossLanguageDiffResult;
  readyForSdkWrap: boolean;
  nextActions: string[];
  whyTheseSteps: string[];
  stopIf: string[];
}

export interface UpgradeDiffResult {
  createdAt: string;
  targetDescription?: string;
  firstDivergence?: {
    layer: 'request' | 'hook-output' | 'token-family' | 'crypto-helper' | 'env-state' | 'final-output';
    message: string;
    expected?: unknown;
    actual?: unknown;
  } | null;
  unchangedParts: string[];
  changedParts: string[];
  recommendation: string;
  notes: string[];
}
