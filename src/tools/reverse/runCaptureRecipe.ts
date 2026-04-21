import { z } from 'zod';

import type { ReplayAction } from '../../replay/types.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

export const replayActionSchema = z.object({
  description: z.string().optional(),
  expression: z.string().optional(),
  method: z.string().optional(),
  optional: z.boolean().optional(),
  selector: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  type: z.enum([
    'click',
    'input',
    'submit',
    'evaluate',
    'navigate',
    'wait-for-selector',
    'wait-for-request',
    'wait-for-timeout'
  ]),
  url: z.string().optional(),
  value: z.string().optional()
});

const schema = z.object({
  actions: z.array(replayActionSchema),
  captureWindowMs: z.number().int().positive().optional(),
  presetId: z.string(),
  targetUrl: z.string().optional(),
  taskId: z.string().optional(),
  topN: z.number().int().positive().optional(),
  writeEvidence: z.boolean().optional()
});

type RunCaptureRecipeParams = z.infer<typeof schema>;

export const runCaptureRecipeTool = defineTool<RunCaptureRecipeParams>({
  name: 'run_capture_recipe',
  description: 'Run a replay-oriented capture recipe, then correlate new network/hook evidence with scenario analysis.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    result: await context.runtime.getReplayRecipeRunner().run({
      actions: params.actions as ReplayAction[],
      captureWindowMs: params.captureWindowMs,
      presetId: params.presetId,
      targetUrl: params.targetUrl,
      taskId: params.taskId,
      topN: params.topN,
      writeEvidence: params.writeEvidence
    })
  })
});
