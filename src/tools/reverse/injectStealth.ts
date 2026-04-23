import { z } from 'zod';

import { normalizeLegacyStealthFeatureIds } from '../../stealth/StealthFeatureRegistry.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordBrowserOps } from './browserOpsToolHelpers.js';
import { recordStealthSubstrate } from './stealthSubstrateToolHelpers.js';

const schema = z.object({
  presetId: z.string(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type InjectStealthParams = z.infer<typeof schema>;

export const injectStealthTool = defineTool<InjectStealthParams>({
  name: 'inject_stealth',
  description: 'Inject a preset-based stealth preload for field operations and sync it into the thicker stealth substrate; not a full anti-detection platform and still hook-preferred.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getStealthPresetRegistry().applyPreset(params);
    const normalized = normalizeLegacyStealthFeatureIds(result.appliedFeatures);
    context.runtime.getStealthFeatureRegistry().setFeatures({
      enabled: normalized
    });
    const stealthState = await context.runtime.getStealthCoordinator().applyCurrentStealth();
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
    await recordStealthSubstrate(context, {
      evidence: {
        enabledFeatures: stealthState.enabledFeatures,
        kind: 'stealth_substrate',
        presetId: result.presetId
      },
      state: stealthState,
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
