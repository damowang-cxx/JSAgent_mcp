export interface IntermediateProbe {
  probeId: string;
  createdAt: string;
  taskId?: string | null;
  source: 'node-pure' | 'python-pure' | 'runtime-trace';
  path: string;
  value: unknown;
  note?: string;
}
