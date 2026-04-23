import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const schema = z.object({
  query: z.string(),
  caseSensitive: z.boolean().optional(),
  isRegex: z.boolean().optional(),
  maxResults: z.number().int().min(1).optional(),
  maxLineLength: z.number().int().min(40).optional(),
  excludeMinified: z.boolean().optional(),
  urlFilter: z.string().optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type SearchInSourcesParams = z.infer<typeof schema>;

export const searchInSourcesTool = defineTool<SearchInSourcesParams>({
  name: 'search_in_sources',
  description: 'Bounded cross-script live source search for selected-page scripts; script-first precision comes before broad collected-code fallback, hooks are preferred, breakpoints are last.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const items = await context.runtime.getSourceSearchEngine().searchInSources(params);
    const snapshot = {
      lastSearchResult: items,
      notes: ['Cross-script search used live selected-page script sources and bounded line previews.']
    };
    context.runtime.getSourcePrecisionRegistry().setLast(snapshot);

    let evidenceWritten = false;
    if (params.taskId && params.writeEvidence) {
      const evidenceStore = context.runtime.getEvidenceStore();
      await evidenceStore.openTask({ taskId: params.taskId });
      await evidenceStore.appendLog(params.taskId, 'runtime-evidence', {
        caseSensitive: Boolean(params.caseSensitive),
        count: items.length,
        excludeMinified: Boolean(params.excludeMinified),
        isRegex: Boolean(params.isRegex),
        kind: 'source_search_in_sources',
        maxResults: params.maxResults ?? null,
        query: params.query,
        urlFilter: params.urlFilter ?? null
      });
      await context.runtime.getSourcePrecisionRegistry().storeToTask(params.taskId, snapshot);
      evidenceWritten = true;
    }

    return {
      evidenceWritten,
      items
    };
  }
});
