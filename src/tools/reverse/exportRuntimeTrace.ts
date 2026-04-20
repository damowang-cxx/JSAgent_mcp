import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  bundleDir: z.string().optional(),
  fixturePath: z.string().optional(),
  probeExpressions: z.array(z.string()).optional(),
  targetFunctionName: z.string().optional(),
  taskId: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  writeSnapshot: z.boolean().optional()
});

type ExportRuntimeTraceParams = z.infer<typeof schema>;

export const exportRuntimeTraceTool = defineTool<ExportRuntimeTraceParams>({
  name: 'export_runtime_trace',
  description: 'Export a minimal local rebuild runtime trace for a target function and optional probes.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const rebuild = context.runtime.getRebuildWorkflowRunner().getLastRebuildWorkflowResult();
    const bundleDir = params.bundleDir ?? rebuild?.bundle.bundleDir;
    if (!bundleDir) {
      throw new AppError('REBUILD_BUNDLE_NOT_AVAILABLE', 'bundleDir was not provided and no rebuild workflow result is cached.');
    }

    const runtimeTrace = await context.runtime.getRuntimeTraceSampler().sample({
      bundleDir,
      fixturePath: params.fixturePath ?? rebuild?.bundle.fixtureFile ?? undefined,
      probeExpressions: params.probeExpressions,
      targetFunctionName: params.targetFunctionName,
      timeoutMs: params.timeoutMs
    });

    if (params.writeSnapshot && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.writeSnapshot(params.taskId, 'run/exported-runtime-trace', runtimeTrace);
    }

    return {
      runtimeTrace
    };
  }
});
