export interface DeobfuscateOptions {
  code: string;
  aggressive?: boolean;
  renameVariables?: boolean;
  explain?: boolean;
}

export interface ObfuscationSignal {
  type: string;
  confidence: number;
  evidence: string[];
}

export interface TransformationRecord {
  type: string;
  description: string;
  executed: boolean;
  changed: boolean;
  success: boolean;
  detail?: Record<string, unknown>;
}

export interface TransformResult {
  code: string;
  changed: boolean;
  detail?: Record<string, unknown>;
  warnings?: string[];
}

export interface DeobfuscateResult {
  code: string;
  obfuscationType: string[];
  transformations: TransformationRecord[];
  readabilityScore: number;
  confidence: number;
  warnings?: string[];
  analysis?: string;
}
