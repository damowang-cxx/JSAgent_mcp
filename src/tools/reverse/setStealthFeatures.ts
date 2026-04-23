import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordStealthSubstrate } from './stealthSubstrateToolHelpers.js';

const schema = z.object({
  enabled: z.array(z.string()).optional(),
  disabled: z.array(z.string()).optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type SetStealthFeaturesParams = z.infer<typeof schema>;

export const setStealthFeaturesTool = defineTool<SetStealthFeaturesParams>({
  name: 'set_stealth_features',
  description: 'Set bounded stealth feature toggles and coordinate preload application without changing browser ownership.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const featureState = context.runtime.getStealthFeatureRegistry().setFeatures({
      disabled: params.disabled,
      enabled: params.enabled
    });
    const applied = await context.runtime.getStealthCoordinator().applyCurrentStealth();
    const result = {
      ...applied,
      disabledFeatures: featureState.disabled,
      enabledFeatures: featureState.enabled
    };
    const evidenceWritten = await recordStealthSubstrate(context, {
      evidence: {
        disabled: params.disabled ?? [],
        enabled: params.enabled ?? [],
        enabledFeatures: result.enabledFeatures,
        kind: 'stealth_substrate'
      },
      state: result,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });
    return {
      evidenceWritten,
      result
    };
  }
});
