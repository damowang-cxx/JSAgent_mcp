# JS Reverser MCP

Phase 2 minimal TypeScript MCP server for JavaScript reverse-engineering workflows.

## Current Scope

This repository currently includes:

- TypeScript + ESM project structure
- stdio MCP server based on `@modelcontextprotocol/sdk`
- shared `defineTool` / `ToolRegistry` infrastructure
- structured JSON tool responses
- reusable `BrowserSessionManager`
- minimal anti-detection preload injection
- minimal navigation tools

Phase 2 focuses on a stable browser session layer and does not yet include reverse-analysis runtime features.

## Added In Phase 2

- Browser connection via `BROWSER_URL`
- Browser connection via `BROWSER_WS_ENDPOINT`
- Auto-detect remote debugging targets on `127.0.0.1:9222` to `127.0.0.1:9225`
- Local browser launch fallback through Puppeteer
- Shared page context management with persistent selected page state
- Minimal preload patching for:
  - `navigator.webdriver`
  - `window.chrome.runtime`
  - `navigator.languages`
- Navigation tools:
  - `check_browser_health`
  - `list_pages`
  - `select_page`
  - `new_page`
  - `navigate_page`

## Not Implemented Yet

Phase 2 does not implement:

- Runtime assembly layer
- `CodeCollector`
- Hook management
- LLM / Analyzer workflows
- Task artifacts
- Network / Console / WebSocket collectors
- DevTools debugger breakpoint tools

## Install And Run

```bash
npm install
npm run build
npm start
```

Development mode:

```bash
npm run dev
```

Type check:

```bash
npm run typecheck
```

## Browser Connection Options

The MCP server reads browser session options from environment variables:

- `BROWSER_URL`
  - Example: `http://127.0.0.1:9222`
- `BROWSER_WS_ENDPOINT`
  - Example: `ws://127.0.0.1:9222/devtools/browser/...`
- `BROWSER_AUTO_CONNECT=true`
  - Probes `127.0.0.1:9222` to `127.0.0.1:9225`
- `BROWSER_HEADLESS`
  - Used when launching a local browser
- `BROWSER_EXECUTABLE_PATH`
  - Optional local Chrome / Chromium executable path

Connection priority:

1. `BROWSER_WS_ENDPOINT`
2. `BROWSER_URL`
3. `BROWSER_AUTO_CONNECT=true`
4. launch local browser

## Minimal Validation Flow

1. Start Chrome with remote debugging enabled.

```bash
chrome.exe --remote-debugging-port=9222
```

2. Set one of the browser connection environment variables.

PowerShell example:

```powershell
$env:BROWSER_URL="http://127.0.0.1:9222"
```

Or:

```powershell
$env:BROWSER_AUTO_CONNECT="true"
```

3. Start the MCP server.

```bash
npm start
```

4. Call tools in order:

- `check_browser_health`
- `list_pages`
- `new_page`
- `navigate_page`
- `select_page`

Example expectations:

- `check_browser_health` returns connection state and selected page summary
- `list_pages` returns structured page summaries
- `new_page` creates a new page and makes it selected
- `navigate_page` keeps the selected page alive across later tool calls

## Tool Summary

### Phase 1 Core Tools

- `ping`
- `get_server_info`
- `list_tools_summary`

### Phase 2 Navigation Tools

- `check_browser_health`
- `list_pages`
- `select_page`
- `new_page`
- `navigate_page`

## Next Direction

The current browser session layer is intentionally small so it can be extended naturally in the next phase toward:

- runtime composition
- page controller abstractions
- collectors
- hook systems
- reverse-analysis workflows
