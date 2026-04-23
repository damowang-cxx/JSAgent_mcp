import type { BrowserOpsSnapshot } from '../browser-ops/types.js';

export class BrowserOpsReportBuilder {
  async build(
    snapshot: BrowserOpsSnapshot,
    format: 'json' | 'markdown'
  ): Promise<{ json?: Record<string, unknown>; markdown?: string }> {
    if (format === 'json') {
      return {
        json: snapshot as unknown as Record<string, unknown>
      };
    }

    const storage = snapshot.lastStorageSnapshot;
    return {
      markdown: `${[
        '# JSAgent_mcp Browser Ops Report',
        '',
        '## DOM Query Summary',
        '',
        snapshot.lastDomQuery
          ? `- ${snapshot.lastDomQuery.selector}: ${snapshot.lastDomQuery.count} match(es), ${snapshot.lastDomQuery.items.length} item(s) returned.`
          : '- none',
        '',
        '## Recent Console Messages',
        '',
        ...(snapshot.lastConsoleMessages?.slice(0, 50).map((message) => `- ${message.timestamp} [${message.type}] ${message.text}`) ?? ['- none']),
        '',
        '## Storage Snapshot Summary',
        '',
        `- Cookies: ${storage?.cookies?.length ?? 0}`,
        `- localStorage: ${storage?.localStorage?.length ?? 0}`,
        `- sessionStorage: ${storage?.sessionStorage?.length ?? 0}`,
        '',
        '## Preload Scripts',
        '',
        ...(snapshot.activePreloadScripts?.map((script) => `- ${script.scriptId} (${script.createdAt})`) ?? ['- none']),
        '',
        '## Session States',
        '',
        ...(snapshot.activeSessionStates?.map((state) => `- ${state.sessionId} (${state.createdAt}) ${state.url ?? ''}`) ?? ['- none']),
        '',
        '## Stealth Preset',
        '',
        `- ${snapshot.lastStealthPreset ?? '(none)'}`,
        '',
        '## Current User-Agent',
        '',
        `- ${snapshot.currentUserAgent ?? '(default)'}`,
        '',
        '## Notes',
        '',
        ...(snapshot.notes?.map((note) => `- ${note}`) ?? ['- Browser field operations are observe-first helpers and not a site automation platform.'])
      ].join('\n')}\n`
    };
  }
}
