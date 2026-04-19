import { z } from 'zod';

import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  snapshotName: z.string().optional(),
  snapshotValue: z.unknown().optional(),
  taskId: z.string(),
  timelineEvent: z.record(z.string(), z.unknown()).optional(),
  type: z.enum(['runtime-evidence', 'network', 'hooks']),
  value: z.record(z.string(), z.unknown())
});

type RecordReverseEvidenceParams = z.infer<typeof schema>;

export const recordReverseEvidenceTool = defineTool<RecordReverseEvidenceParams>({
  name: 'record_reverse_evidence',
  description: 'Append evidence to a reverse task artifact and optionally write timeline/snapshot data.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const evidenceStore = context.runtime.getEvidenceStore();
    const shouldWriteSnapshot = params.snapshotName !== undefined || params.snapshotValue !== undefined;

    if (shouldWriteSnapshot && (params.snapshotName === undefined || params.snapshotValue === undefined)) {
      throw new AppError(
        'SNAPSHOT_ARGUMENTS_INVALID',
        'snapshotName and snapshotValue must be provided together when writing a snapshot.'
      );
    }

    await evidenceStore.appendLog(params.taskId, params.type, params.value);

    if (params.timelineEvent) {
      await evidenceStore.appendTimeline(params.taskId, params.timelineEvent);
    }

    if (params.snapshotName !== undefined && params.snapshotValue !== undefined) {
      await evidenceStore.writeSnapshot(params.taskId, params.snapshotName, params.snapshotValue);
    }

    return {
      recorded: true,
      ...(params.snapshotName !== undefined && params.snapshotValue !== undefined ? { snapshotWritten: true } : {}),
      taskId: params.taskId,
      type: params.type
    };
  }
});
