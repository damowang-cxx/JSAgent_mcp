import { z } from 'zod';

import type { CodeFile } from '../../collector/types.js';
import { AppError } from '../../core/errors.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

const fileSchema = z.object({
  content: z.string(),
  size: z.number().int().nonnegative(),
  type: z.enum(['inline', 'external']),
  url: z.string()
});

const schema = z.object({
  code: z.string().optional(),
  files: z.array(fileSchema).optional(),
  mode: z.enum(['single', 'batch', 'project']).optional(),
  url: z.string().optional()
});

type SummarizeCodeParams = z.infer<typeof schema>;

function normalizeFile(input: z.infer<typeof fileSchema>): CodeFile {
  return {
    content: input.content,
    size: input.size,
    type: input.type,
    url: input.url
  };
}

function createInlineFile(code: string, url?: string): CodeFile {
  return {
    content: code,
    size: code.length,
    type: 'inline',
    url: url?.trim() || 'inline://summarize-code'
  };
}

export const summarizeCodeTool = defineTool<SummarizeCodeParams>({
  name: 'summarize_code',
  description: 'Summarize JavaScript code with deterministic single-file, batch, or project heuristics.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true
  },
  schema,
  handler: async ({ params }, context) => {
    const summarizer = context.runtime.getCodeSummarizer();
    const collector = context.runtime.getCodeCollector();
    const requestedMode = params.mode;
    const mode = requestedMode ?? (params.files && params.files.length > 1 ? 'batch' : 'single');

    if (mode === 'single') {
      const file =
        params.code !== undefined
          ? createInlineFile(params.code, params.url)
          : params.files?.[0]
            ? normalizeFile(params.files[0])
            : params.url
              ? collector.getFileByUrl(params.url)
              : collector.getTopPriorityFiles(1).files[0] ?? null;

      if (!file) {
        throw new AppError('NO_CODE_AVAILABLE', 'summarize_code single mode requires code, files[0], url in collector cache, or collected top-priority code.');
      }

      return {
        input: {
          fileCount: 1,
          mode,
          source: file.url
        },
        summary: await summarizer.summarizeFile(file)
      };
    }

    const files =
      params.files?.map(normalizeFile) ??
      (params.code !== undefined
        ? [createInlineFile(params.code, params.url)]
        : collector.getTopPriorityFiles(10).files.map((file) => ({ ...file })));

    if (files.length === 0) {
      throw new AppError('NO_CODE_AVAILABLE', `summarize_code ${mode} mode requires files, code, or collected top-priority code.`);
    }

    const summary =
      mode === 'project'
        ? await summarizer.summarizeProject(files)
        : await summarizer.summarizeBatch(files);

    return {
      input: {
        fileCount: files.length,
        mode,
        sources: files.map((file) => file.url)
      },
      summary
    };
  }
});
