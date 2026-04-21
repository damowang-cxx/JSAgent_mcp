export interface ReverseTaskDescriptor {
  taskId: string;
  slug?: string;
  targetUrl?: string;
  goal?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpenTaskInput {
  taskId: string;
  slug?: string;
  targetUrl?: string;
  goal?: string;
}

export interface OpenTaskResult {
  taskId: string;
  taskDir: string;
  descriptor: ReverseTaskDescriptor;
}

export type EvidenceLogName =
  | 'runtime-evidence'
  | 'network'
  | 'hooks'
  | 'acceptance'
  | 'regression-baselines'
  | 'regression'
  | 'intermediate-probes'
  | 'intermediate-baselines'
  | 'versioned-baselines';
