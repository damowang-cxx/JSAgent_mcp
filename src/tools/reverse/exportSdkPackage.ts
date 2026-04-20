import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { sdkTargetSchema } from './taskToolHelpers.js';

const schema = z.object({
  overwrite: z.boolean().optional(),
  target: sdkTargetSchema.optional(),
  taskId: z.string().optional()
});

type ExportSdkPackageParams = z.infer<typeof schema>;

export const exportSdkPackageTool = defineTool<ExportSdkPackageParams>({
  name: 'export_sdk_package',
  description: 'Export a minimal SDK package after pure/port gate and regression baseline are available.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const sdk = await context.runtime.getSdkPackager().export(params);
    const report = await context.runtime.getSdkReportBuilder().build(sdk, 'markdown');
    if (params.taskId) {
      await context.runtime.getEvidenceStore().writeSnapshot(params.taskId, 'delivery/sdk-report-markdown', report);
    }
    return {
      report,
      sdk
    };
  }
});
