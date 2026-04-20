import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { fixtureSourceSchema } from './rebuildToolHelpers.js';

const schema = z.object({
  samples: z.number().int().positive().optional(),
  source: fixtureSourceSchema.optional(),
  suspiciousRequestLimit: z.number().int().positive().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type StabilizeFixtureParams = z.infer<typeof schema>;

export const stabilizeFixtureTool = defineTool<StabilizeFixtureParams>({
  name: 'stabilize_fixture',
  description: 'Extract multiple compact runtime fixtures and report coarse fixture stability.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const result = await context.runtime.getFixtureStabilizer().stabilize({
      samples: params.samples,
      source: params.source ?? 'current-page',
      suspiciousRequestLimit: params.suspiciousRequestLimit
    });

    if (params.writeEvidence && params.taskId) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        kind: 'fixture_stability',
        stability: result.stability
      });
      await evidenceStore.writeSnapshot(params.taskId, 'fixture-stability', result.stability);
      await evidenceStore.writeSnapshot(params.taskId, 'fixture-samples', result.fixtures);
    }

    return {
      fixtures: result.fixtures,
      stability: result.stability
    };
  }
});
