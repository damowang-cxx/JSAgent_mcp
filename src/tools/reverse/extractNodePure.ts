import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { asPureBoundary, asPureFixture, pureBoundarySchema, pureFixtureSchema } from './pureToolHelpers.js';

const schema = z.object({
  boundary: pureBoundarySchema,
  fixture: pureFixtureSchema,
  overwrite: z.boolean().optional(),
  sourceBundleDir: z.string().optional(),
  targetFunctionName: z.string().optional(),
  taskId: z.string().optional()
});

type ExtractNodePureParams = z.infer<typeof schema>;

export const extractNodePureTool = defineTool<ExtractNodePureParams>({
  name: 'extract_node_pure',
  description: 'Generate a Node pure scaffold from a defined boundary and pure fixture.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    nodePure: await context.runtime.getPureNodeExtractor().extract({
      boundary: asPureBoundary(params.boundary),
      fixture: asPureFixture(params.fixture),
      overwrite: params.overwrite,
      sourceBundleDir: params.sourceBundleDir,
      targetFunctionName: params.targetFunctionName,
      taskId: params.taskId
    })
  })
});
