import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { asPureBoundary, asRuntimeTrace, pureBoundarySchema, pureSourceSchema, runtimeTraceSchema } from './pureToolHelpers.js';

const schema = z.object({
  boundary: pureBoundarySchema.optional(),
  runtimeTrace: runtimeTraceSchema.optional(),
  source: pureSourceSchema.optional(),
  taskId: z.string().optional(),
  writeSnapshot: z.boolean().optional()
});

type BuildPureFixtureParams = z.infer<typeof schema>;

export const buildPureFixtureTool = defineTool<BuildPureFixtureParams>({
  name: 'build_pure_fixture',
  description: 'Build a stable pure fixture from frozen sample, boundary, and optional runtime trace.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const frozenSample = await context.runtime.getFreezeManager().freeze({
      source: params.source,
      taskId: params.taskId
    });
    const runtimeTrace = params.runtimeTrace ? asRuntimeTrace(params.runtimeTrace) : null;
    const boundary = params.boundary
      ? asPureBoundary(params.boundary)
      : await context.runtime.getBoundaryDefiner().define({
          frozenSample,
          runtimeTrace
        });
    const fixture = await context.runtime.getPureFixtureBuilder().build({
      boundary,
      frozenSample,
      runtimeTrace
    });

    if (params.writeSnapshot && params.taskId) {
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, 'run/fixtures', fixture);
    }

    return {
      fixture
    };
  }
});
