import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps } from './browserOpsToolHelpers.js';

const schema = z.object({
  fullPage: z.boolean().optional(),
  selector: z.string().optional(),
  format: z.enum(['png', 'jpeg']).optional(),
  quality: z.number().int().min(1).max(100).optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type TakeScreenshotParams = z.infer<typeof schema>;

export const takeScreenshotTool = defineTool<TakeScreenshotParams>({
  name: 'take_screenshot',
  description: 'Capture page or element screenshot for field evidence; observe-first artifact before hook/debugger escalation.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getDomInspector().takeScreenshot(params);
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        format: result.format,
        fullPage: result.fullPage,
        kind: 'browser_screenshot',
        path: result.path ?? null,
        selector: result.selector ?? null
      },
      snapshotPatch: {
        notes: [`Screenshot captured at ${result.path ?? '(memory)'}.`]
      },
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    return {
      ...result,
      evidenceWritten
    };
  }
});
