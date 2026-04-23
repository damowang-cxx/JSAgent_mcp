import { z } from 'zod';

import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';
import { recordAstSubstrate } from './astSubstrateToolHelpers.js';

const schema = z.object({
  query: z.string(),
  scriptId: z.string().optional(),
  urlFilter: z.string().optional(),
  maxResults: z.number().int().min(1).optional(),
  taskId: z.string().optional(),
  writeEvidence: z.boolean().optional()
});

type FindAstReferencesParams = z.infer<typeof schema>;

export const findAstReferencesTool = defineTool<FindAstReferencesParams>({
  name: 'find_ast_references',
  description: 'AST-assisted, bounded reference finder over live selected-page sources; observe-first, hook-preferred, breakpoint-last, and not a full callgraph or taint engine.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false
  },
  schema,
  handler: async ({ params }, context) => {
    const items = await context.runtime.getAstReferenceFinder().findReferences(params);
    const locatedFunctions = await context.runtime.getAstLocator().locateFunction({
      maxResults: 20,
      name: /^[A-Za-z_$][\w$]*$/.test(params.query) ? params.query : undefined,
      scriptId: params.scriptId,
      urlFilter: params.urlFilter
    });
    const snapshot = {
      foundReferences: items,
      locatedFunctions,
      notes: [
        'AST reference finder ran over live source precision excerpts and returned bounded explainable matches.',
        'Results assist source precision, function scalpel, and flow reasoning; they are not full data-flow truth.'
      ]
    };
    const evidenceWritten = await recordAstSubstrate(context, {
      evidence: {
        count: items.length,
        kind: 'ast_substrate',
        query: params.query,
        scriptId: params.scriptId ?? null,
        urlFilter: params.urlFilter ?? null
      },
      snapshot,
      taskId: params.taskId,
      writeEvidence: params.writeEvidence
    });

    return {
      evidenceWritten,
      items
    };
  }
});
