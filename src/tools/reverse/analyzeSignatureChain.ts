import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  correlationWindowMs: z.number().int().positive().optional(),
  includeDynamic: z.boolean().optional(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  topN: z.number().int().positive().optional(),
  writeEvidence: z.boolean().optional()
});

type AnalyzeSignatureChainParams = z.infer<typeof schema>;

export const analyzeSignatureChainTool = defineTool<AnalyzeSignatureChainParams>({
  name: 'analyze_signature_chain',
  description: 'Analyze request signature/auth/nonce parameter chains with target-chain-first scenario heuristics.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getSignatureScenarioAnalyzer().analyze({
      correlationWindowMs: params.correlationWindowMs,
      includeDynamic: params.includeDynamic,
      targetUrl: params.targetUrl,
      topN: params.topN
    });

    let evidenceWritten = false;
    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({
        targetUrl: params.targetUrl,
        taskId: params.taskId
      });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        indicators: result.indicators.slice(0, 30),
        kind: 'analyze_signature_chain',
        priorityTargets: result.priorityTargets,
        suspiciousRequests: result.suspiciousRequests
      });
      await evidenceStore.writeSnapshot(params.taskId, 'scenario/analysis', result);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        scenarioWorkflow: 'scenario/analysis'
      });
      evidenceWritten = true;
    }

    return {
      evidenceWritten,
      result
    };
  }
});
