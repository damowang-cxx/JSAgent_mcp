import type { AutoConnectResult } from './types.js';

const DEFAULT_REMOTE_DEBUGGING_PORTS = [9222, 9223, 9224, 9225] as const;

export const DEFAULT_AUTO_CONNECT_CANDIDATES = DEFAULT_REMOTE_DEBUGGING_PORTS.map(
  (port) => `http://127.0.0.1:${port}`
);

export async function autoConnectBrowser(
  candidates: readonly string[] = DEFAULT_AUTO_CONNECT_CANDIDATES
): Promise<AutoConnectResult | null> {
  for (const browserURL of candidates) {
    try {
      const response = await fetch(`${browserURL}/json/version`);
      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as { webSocketDebuggerUrl?: unknown };
      if (typeof payload.webSocketDebuggerUrl !== 'string' || payload.webSocketDebuggerUrl.length === 0) {
        continue;
      }

      return {
        browserURL,
        wsEndpoint: payload.webSocketDebuggerUrl
      };
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}
