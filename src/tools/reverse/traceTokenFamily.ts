import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  candidateNames: z.array(z.string()).optional(),
  familyName: z.string().optional(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type TraceTokenFamilyParams = z.infer<typeof schema>;

export const traceTokenFamilyTool = defineTool<TraceTokenFamilyParams>({
  name: 'trace_token_family',
  description: 'Trace token/auth/nonce/verify family members across requests, hooks, and collected code.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getTokenScenarioAnalyzer().trace({
      candidateNames: params.candidateNames,
      familyName: params.familyName,
      targetUrl: params.targetUrl
    });

    let evidenceWritten = false;
    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({
        targetUrl: params.targetUrl,
        taskId: params.taskId
      });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        familyName: result.familyName,
        kind: 'trace_token_family',
        members: result.members.slice(0, 30),
        requestBindings: result.requestBindings.slice(0, 30)
      });
      await evidenceStore.writeSnapshot(params.taskId, 'scenario/token-family', result);
      evidenceWritten = true;
    }

    return {
      evidenceWritten,
      result
    };
  }
});
