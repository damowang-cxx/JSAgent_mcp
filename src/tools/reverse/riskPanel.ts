import { z } from 'zod';

import type { CodeFile } from '../../collector/types.js';
import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  code: z.string().optional(),
  includeHookSignals: z.boolean().optional(),
  topN: z.number().int().positive().optional()
});

type RiskPanelParams = z.infer<typeof schema>;

const DEFAULT_TOP_N = 5;

function mergeFiles(files: readonly CodeFile[]): string {
  return files
    .map((file) => `\n/* JSAGENT_FILE: ${file.url} */\n${file.content}`)
    .join('\n');
}

function isSuspiciousRequest(method: string, url: string): boolean {
  return /sign|signature|token|auth|api|nonce/i.test(url) || /^(POST|PUT|PATCH)$/i.test(method);
}

export const riskPanelTool = defineTool<RiskPanelParams>({
  name: 'risk_panel',
  description: 'Build an explainable risk panel from static analysis, crypto detection, hook signals, and network signals.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    const collector = context.runtime.getCodeCollector();
    const topN = params.topN ?? DEFAULT_TOP_N;
    const sourceFiles = params.code === undefined ? collector.getTopPriorityFiles(topN).files : [];
    const code = params.code ?? mergeFiles(sourceFiles);

    if (code.trim().length === 0) {
      throw new AppError('NO_CODE_AVAILABLE', 'risk_panel requires code or non-empty collector top-priority code. Run collect_code first or pass code directly.', {
        topN
      });
    }

    const [staticAnalysis, crypto] = await Promise.all([
      context.runtime.getStaticAnalyzer().understand({ code, focus: 'all' }),
      context.runtime.getCryptoDetector().detect({ code })
    ]);

    const [hookSignalCount, suspiciousNetworkRequests] = await Promise.all([
      params.includeHookSignals === false ? Promise.resolve(0) : countHookSignals(context),
      countSuspiciousNetworkRequests(context)
    ]);
    const risk = await context.runtime.getRiskScorer().score({
      crypto,
      hookSignalCount,
      staticAnalysis,
      suspiciousNetworkRequests
    });

    return {
      crypto,
      risk,
      source: {
        codeProvided: params.code !== undefined,
        filesUsed: sourceFiles.map((file) => ({
          size: file.size,
          type: file.type,
          url: file.url
        })),
        topN
      },
      staticAnalysis
    };
  }
});

async function countHookSignals(context: Parameters<typeof riskPanelTool.handler>[1]): Promise<number> {
  try {
    const page = await context.browserSession.getSelectedPage();
    const hookData = await context.runtime.getHookManager().getHookData(page);
    return Object.values(hookData.records).reduce((total, records) => total + records.length, 0);
  } catch {
    return 0;
  }
}

async function countSuspiciousNetworkRequests(context: Parameters<typeof riskPanelTool.handler>[1]): Promise<number> {
  try {
    const result = await context.runtime.getNetworkCollector().listRequests({ limit: 200 });
    return result.requests.filter((request) => isSuspiciousRequest(request.method, request.url)).length;
  } catch {
    return 0;
  }
}
