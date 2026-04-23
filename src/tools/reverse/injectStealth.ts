import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps } from './browserOpsToolHelpers.js';

const schema = z.object({
  presetId: z.string(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type InjectStealthParams = z.infer<typeof schema>;

export const injectStealthTool = defineTool<InjectStealthParams>({
  name: 'inject_stealth',
  description: 'Inject a minimal preset-based stealth preload for field operations; not a full anti-detection platform and still hook-preferred.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getStealthPresetRegistry().applyPreset(params);
    const evidenceWritten = await recordBrowserOps(context, {
      evidence: {
        appliedFeatures: result.appliedFeatures,
        kind: 'browser_stealth',
        presetId: result.presetId
      },
      snapshotPatch: {
        lastStealthPreset: result.presetId,
        notes: [`Injected stealth preset ${result.presetId}; AI/debugger do not become truth sources.`]
      },
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    return {
      appliedFeatures: result.appliedFeatures,
      evidenceWritten,
      presetId: result.presetId
    };
  }
});
