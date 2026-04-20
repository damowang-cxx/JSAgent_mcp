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
