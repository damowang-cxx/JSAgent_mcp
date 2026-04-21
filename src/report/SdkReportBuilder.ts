import type { SDKPackageExport } from '../sdk/types.js';

export class SdkReportBuilder {
  async build(
    result: SDKPackageExport,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return { json: result as unknown as Record<string, unknown> };
    }

    return {
      markdown: `${[
        '# JSAgent_mcp SDK Package Report',
        '',
        '## Package Target',
        '',
        `- ${result.target}`,
        '',
        '## Contract',
        '',
        `- ${result.contractFile}`,
        '',
        '## Provenance',
        '',
        `- Task: ${result.taskId ?? '(none)'}`,
        `- Package: ${result.packageId}`,
        '',
        '## Verification Gate',
        '',
        '- SDK export is allowed only after the required pure/port gate passes and the latest regression run matches baseline.',
        '',
        '## Files',
        '',
        ...result.files.map((file) => `- ${file}`)
      ].join('\n')}\n`
    };
  }
}
