import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  taskId: z.string()
});

type GetTaskManifestParams = z.infer<typeof schema>;

export const getTaskManifestTool = defineTool<GetTaskManifestParams>({
  name: 'get_task_manifest',
  description: 'Return the canonical task manifest and artifact index for a task.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const manifest = await context.runtime.getTaskManifestManager().ensureTask(params.taskId);
    const gates = await context.runtime.getStageGateEvaluator().evaluateAll(params.taskId);
    return {
      artifactIndex: await context.runtime.getTaskManifestManager().buildArtifactIndex(params.taskId),
      gates,
      manifest: await context.runtime.getTaskManifestManager().getTask(params.taskId) ?? manifest
    };
  }
});
