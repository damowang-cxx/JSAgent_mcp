import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { rebuildBundleOptionsSchema } from './rebuildToolHelpers.js';

const schema = rebuildBundleOptionsSchema;

type ExportRebuildBundleParams = z.infer<typeof schema>;

export const exportRebuildBundleTool = defineTool<ExportRebuildBundleParams>({
  name: 'export_rebuild_bundle',
  description: 'Export a minimal local Node rebuild bundle from collected top-priority code.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => ({
    bundle: await context.runtime.getRebuildBundleExporter().export(params)
  })
});
