import type { ExplainEngine } from '../analysis/ExplainEngine.js';
import { detectObfuscationTypes } from './detectors.js';
import { calculateConfidence, calculateReadabilityScore } from './scoring.js';
import {
  cleanupReadability,
  decodeBase64AndHexLiterals,
  decodeEscapedStrings,
  decodeEvalStringFromCharCode,
  eliminateSimpleDeadBranches,
  extractPackerPayload,
  foldStringConcats,
  renameHexVariables,
  simplifyConstantsAndSyntax,
  simplifyStringArrayAccess
} from './transforms.js';
import type { DeobfuscateOptions, DeobfuscateResult, TransformationRecord, TransformResult } from './types.js';

type TransformStep = {
  type: string;
  description: string;
  run: (code: string) => TransformResult;
};

export class Deobfuscator {
  constructor(private readonly explainEngine?: ExplainEngine) {}

  async deobfuscate(options: DeobfuscateOptions): Promise<DeobfuscateResult> {
    const originalCode = options.code ?? '';
    let code = originalCode;
    const warnings: string[] = [];
    const transformations: TransformationRecord[] = [];
    const obfuscationType = detectObfuscationTypes(code);

    const steps: TransformStep[] = [
      {
        description: 'Decode simple eval(String.fromCharCode(...)) wrappers.',
        run: decodeEvalStringFromCharCode,
        type: 'unpack:from-char-code'
      },
      {
        description: 'Extract basic packer-like wrapper payload when recognizable.',
        run: extractPackerPayload,
        type: 'unpack:packer-like'
      },
      {
        description: 'Decode escaped unicode and hex string literals.',
        run: decodeEscapedStrings,
        type: 'decode:escaped-strings'
      },
      {
        description: 'Decode simple base64 and hex literals.',
        run: decodeBase64AndHexLiterals,
        type: 'decode:base64-hex'
      },
      {
        description: 'Simplify boolean aliases, undefined aliases, and redundant wrappers.',
        run: simplifyConstantsAndSyntax,
        type: 'simplify:constants'
      },
      {
        description: 'Fold direct string literal concatenations.',
        run: foldStringConcats,
        type: 'simplify:string-concat'
      },
      {
        description: 'Eliminate simple static true/false branches.',
        run: eliminateSimpleDeadBranches,
        type: 'simplify:dead-branches'
      },
      {
        description: 'Replace direct string-array index access.',
        run: simplifyStringArrayAccess,
        type: 'simplify:string-array'
      },
      ...(options.renameVariables === false
        ? []
        : [
            {
              description: 'Rename obvious hex-like local identifiers to stable decoded_N names.',
              run: renameHexVariables,
              type: 'rename:hex-identifiers'
            } satisfies TransformStep
          ]),
      {
        description: 'Clean repeated semicolons, spacing, and very long one-line code.',
        run: cleanupReadability,
        type: 'cleanup:readability'
      }
    ];

    for (const step of steps) {
      try {
        const result = step.run(code);
        if (result.changed) {
          code = result.code;
        }
        if (result.warnings) {
          warnings.push(...result.warnings);
        }
        transformations.push({
          description: step.description,
          detail: result.detail,
          success: true,
          type: step.type
        });
      } catch (error) {
        transformations.push({
          description: `${step.description} Failed: ${error instanceof Error ? error.message : String(error)}`,
          success: false,
          type: step.type
        });
        warnings.push(`${step.type} failed but the pipeline continued.`);
      }
    }

    if (options.aggressive) {
      warnings.push('aggressive=true currently enables the same deterministic transforms; VM-level deobfuscation is intentionally not implemented.');
    }

    const readabilityScore = calculateReadabilityScore(code);
    const confidence = calculateConfidence(originalCode, code, transformations);
    const detectedTypes = obfuscationType.length > 0 ? obfuscationType : ['none-detected'];
    const result: DeobfuscateResult = {
      code,
      confidence,
      obfuscationType: detectedTypes,
      readabilityScore,
      transformations,
      ...(warnings.length > 0 ? { warnings } : {})
    };

    if (options.explain) {
      result.analysis = this.explainEngine
        ? this.explainEngine.explainDeobfuscation(result)
        : this.defaultExplain(result);
    }

    if (originalCode === code) {
      result.warnings = [
        ...(result.warnings ?? []),
        'No significant deterministic transformation changed the code; returning original input.'
      ];
    }

    return result;
  }

  private defaultExplain(result: DeobfuscateResult): string {
    const successes = result.transformations.filter((item) => item.success).length;
    return `Detected ${result.obfuscationType.join(', ')}; ${successes} deterministic step(s) completed with confidence ${result.confidence}.`;
  }
}
