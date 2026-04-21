import { z } from 'zod';

import type { ReplayAction } from '../../replay/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { replayActionSchema } from './runCaptureRecipe.js';

const schema = z.object({
  action: replayActionSchema,
  captureWindowMs: z.number().int().positive().optional(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type ReplayTargetActionParams = z.infer<typeof schema>;

export const replayTargetActionTool = defineTool<ReplayTargetActionParams>({
  name: 'replay_target_action',
  description: 'Convenience single-action replay capture entry backed by the manual-single-action capture preset.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    result: await context.runtime.getReplayRecipeRunner().run({
      actions: [params.action as ReplayAction],
      captureWindowMs: params.captureWindowMs,
      presetId: 'manual-single-action',
      targetUrl: params.targetUrl,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    })
  })
});
