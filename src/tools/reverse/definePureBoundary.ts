import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { asRuntimeTrace, pureSourceSchema, runtimeTraceSchema } from './pureToolHelpers.js';

const schema = z.object({
  runtimeTrace: runtimeTraceSchema.optional(),
  source: pureSourceSchema.optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type DefinePureBoundaryParams = z.infer<typeof schema>;

export const definePureBoundaryTool = defineTool<DefinePureBoundaryParams>({
  name: 'define_pure_boundary',
  description: 'Define deterministic pure extraction boundary from a frozen accepted sample and optional runtime trace.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const frozenSample = await context.runtime.getFreezeManager().freeze({
      source: params.source,
      taskId: params.taskId
    });
    const boundary = await context.runtime.getBoundaryDefiner().define({
      analyzeTargetSummary: context.runtime.getAnalyzeTargetRunner().getLastAnalyzeTargetResult(),
      frozenSample,
      runtimeTrace: params.runtimeTrace ? asRuntimeTrace(params.runtimeTrace) : null
    });

    if (params.writeSnapshot && params.taskId) {
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, 'run/pure-boundary', boundary);
    }

    return {
      boundary
    };
  }
});
