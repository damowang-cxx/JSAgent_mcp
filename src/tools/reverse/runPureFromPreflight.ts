import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const runSchema = z.object({
  traceTimeoutMs: z.number().int().positive().optional(),
  verifyTimeoutMs: z.number().int().positive().optional(),
  overwrite: z.boolean().optional(),
  targetFunctionName: z.string().optional(),
  probeExpressions: z.array(z.string()).optional()
}).optional();

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  targetUrl: z.string().optional(),
  writeEvidence: z.boolean().optional(),
  run: runSchema
});

type RunPureFromPreflightParams = z.infer<typeof schema>;

export const runPureFromPreflightTool = defineTool<RunPureFromPreflightParams>({
  name: 'run_pure_from_preflight',
  description: 'Resolve pure preflight from reverse/rebuild/flow evidence, then run context-aware PureExtraction; hooks are preferred and debugger remains breakpoint-last enhancer evidence.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' && !params.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'run_pure_from_preflight with source=task-artifact requires taskId.');
    }

    const preflight = await context.runtime.getPurePreflightPlanner().plan({
      source: params.source,
      targetUrl: params.targetUrl,
      taskId: params.taskId
    });

    let evidenceWritten = false;
    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({
        targetUrl: params.targetUrl,
        taskId: params.taskId
      });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        contextId: preflight.contextId,
        expectedOutputs: preflight.expectedOutputs,
        kind: 'pure_preflight',
        preservedInputs: preflight.preservedInputs,
        source: preflight.source,
        usedCompareAnchor: preflight.usedCompareAnchor ?? null,
        usedFlowReasoning: preflight.usedFlowReasoning ?? null,
        usedPatchPreflight: preflight.usedPatchPreflight ?? null,
        usedRebuildContext: preflight.usedRebuildContext ?? null
      });
      await context.runtime.getPurePreflightRegistry().storeToTask(params.taskId, preflight);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        purePreflight: 'pure-preflight/latest'
      });
      evidenceWritten = true;
    } else {
      context.runtime.getPurePreflightRegistry().setLast(preflight);
    }

    const result = await context.runtime.getPureExtractionRunner().run({
      overwrite: params.run?.overwrite,
      probeExpressions: params.run?.probeExpressions,
      purePreflight: preflight,
      source: params.source === 'task-artifact' ? 'task-artifact' : 'pure-preflight-last',
      targetFunctionName: params.run?.targetFunctionName,
      taskId: params.taskId,
      traceTimeoutMs: params.run?.traceTimeoutMs,
      verifyTimeoutMs: params.run?.verifyTimeoutMs,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      preflightUsed: preflight,
      result
    };
  }
});
