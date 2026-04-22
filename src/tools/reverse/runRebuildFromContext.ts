import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string().optional(),
  source: z.enum(['runtime-last', 'task-artifact']).optional(),
  targetUrl: z.string().optional(),
  writeEvidence: z.boolean().optional(),
  run: z
    .object({
      timeoutMs: z.number().int().positive().optional()
    })
    .optional()
});

type RunRebuildFromContextParams = z.infer<typeof schema>;

export const runRebuildFromContextTool = defineTool<RunRebuildFromContextParams>({
  name: 'run_rebuild_from_context',
  description: 'Resolve a rebuild context and run the context-aware rebuild workflow; compare anchor and patch preflight are carried as provenance, not automatic patch execution.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    if (params.source === 'task-artifact' && !params.taskId) {
      throw new AppError('TASK_ID_REQUIRED', 'run_rebuild_from_context with source=task-artifact requires taskId.');
    }

    const contextUsed = await context.runtime.getRebuildInputResolver().resolve({
      source: params.source,
      targetUrl: params.targetUrl,
      taskId: params.taskId
    });

    if (params.taskId && params.writeEvidence) {
      await context.runtime.getEvidenceStore().openTask({
        targetUrl: params.targetUrl,
        taskId: params.taskId
      });
      await context.runtime.getRebuildContextRegistry().storeToTask(params.taskId, contextUsed);
      await context.runtime.getTaskManifestManager().ensureTask(params.taskId, {
        targetUrl: params.targetUrl
      });
      await context.runtime.getTaskManifestManager().updatePointers(params.taskId, {
        rebuildContext: 'rebuild-context/latest'
      });
    } else {
      context.runtime.getRebuildContextRegistry().setLast(contextUsed);
    }

    const result = await context.runtime.getRebuildWorkflowRunner().runWithContext({
      export: {
        includeAccessLogger: true,
        includeEnvShim: true,
        includeFixture: true,
        overwrite: true,
        taskId: params.taskId
      },
      fixtureSource: 'rebuild-context-last',
      rebuildContext: contextUsed,
      run: params.run,
      targetUrl: params.targetUrl,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      contextUsed,
      evidenceWritten: Boolean(params.taskId && params.writeEvidence),
      result
    };
  }
});
