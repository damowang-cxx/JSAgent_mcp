# JS Reverser MCP

Phase 3 minimal TypeScript MCP server for JavaScript reverse-engineering workflows.

## Current Scope

The project currently includes:

- TypeScript + ESM project structure
- stdio MCP server based on `@modelcontextprotocol/sdk`
- shared `defineTool` / `ToolRegistry` infrastructure
- structured JSON tool responses
- shared `BrowserSessionManager`
- shared `AppRuntime`
- thin `PageController`
- minimal in-memory `CodeCollector`
- navigation, debugging, and basic reverse-engineering entry tools

## Phase 2 Foundation

The browser session layer from phase 2 is still the single source of truth for:

- browser lifecycle
- page list
- selected page state
- minimal preload injection

Browser connection modes:

- `BROWSER_WS_ENDPOINT`
- `BROWSER_URL`
- `BROWSER_AUTO_CONNECT=true`
- local Puppeteer launch fallback

## Added In Phase 3

- `AppRuntime`
  - combines `browserSession`, `pageController`, and `codeCollector`
- `PageController`
  - thin wrapper around the current selected page
- minimal code collection entry point
  - inline scripts
  - external script URLs
  - external script content fetch attempts
  - in-memory cache
  - summary + regex search
- new tools:
  - `evaluate_script`
  - `collect_code`
  - `list_collected_code`
  - `search_collected_code`

## Not Implemented Yet

Phase 3 still does not implement:

- Hook systems
- DevTools debugger / breakpoints
- network collectors
- console collectors
- websocket collectors
- LLM analyzer workflows
- crypto / deobfuscation layers
- task artifacts
- `analyze_target`
- advanced stealth systems

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

## Browser Configuration

The server reads browser options from environment variables:

- `BROWSER_URL`
  - example: `http://127.0.0.1:9222`
- `BROWSER_WS_ENDPOINT`
  - example: `ws://127.0.0.1:9222/devtools/browser/...`
- `BROWSER_AUTO_CONNECT=true`
  - probes `127.0.0.1:9222` to `127.0.0.1:9225`
- `BROWSER_HEADLESS`
  - used only when launching a local browser
- `BROWSER_EXECUTABLE_PATH`
  - optional custom Chrome / Chromium path

Connection priority:

1. `BROWSER_WS_ENDPOINT`
2. `BROWSER_URL`
3. `BROWSER_AUTO_CONNECT=true`
4. local launch

## Evaluate Script Behavior

`evaluate_script` currently supports JavaScript expression strings evaluated inside the selected page.

Recommended examples:

- `document.title`
- `window.location.href`
- `Array.from(document.scripts).length`
- `(() => ({ title: document.title, url: location.href }))()`

If you need multiple statements, wrap them in an IIFE expression.

## collect_code Capability Boundary

Current `collect_code` behavior:

- collects inline scripts from `document.querySelectorAll('script')`
- collects external `script[src]` URLs
- tries to fetch external script content from inside the page context
- keeps the latest collected result set in an in-memory cache
- supports summary and regex search over cached files

Current `collect_code` limitations:

- no worker / service worker collection
- no dynamic script listener
- no CDP response interception
- no smart prioritization
- no compression pipeline
- no dependency graph
- no analysis layer

## Minimal Validation Flow

1. Start Chrome with remote debugging enabled.

```bash
chrome.exe --remote-debugging-port=9222
```

2. Configure one of the browser connection environment variables.

PowerShell example:

```powershell
$env:BROWSER_URL="http://127.0.0.1:9222"
```

3. Start the MCP server.

```bash
npm start
```

4. Run tools in this order:

- `check_browser_health`
- `list_pages`
- `select_page`
- `evaluate_script`
- `collect_code`
- `list_collected_code`
- `search_collected_code`

## Example Tool Flow

Check browser state:

```json
{}
```

List pages:

```json
{}
```

Evaluate a page expression:

```json
{
  "expression": "document.title"
}
```

Collect code from the current selected page:

```json
{
  "includeInline": true,
  "includeExternal": true,
  "returnMode": "summary"
}
```

Collect code after navigating the selected page:

```json
{
  "url": "https://example.com",
  "includeInline": true,
  "includeExternal": true,
  "returnMode": "full",
  "timeout": 10000
}
```

Search cached code:

```json
{
  "pattern": "fetch\\(",
  "limit": 10
}
```

## Tool Summary

### Core Tools

- `ping`
- `get_server_info`
- `list_tools_summary`

### Navigation Tools

- `check_browser_health`
- `list_pages`
- `select_page`
- `new_page`
- `navigate_page`

### Debugging Tools

- `evaluate_script`

### Reverse Engineering Entry Tools

- `collect_code`
- `list_collected_code`
- `search_collected_code`

## Design Constraints

The current implementation intentionally keeps these boundaries:

- `BrowserSessionManager` remains the only owner of browser + selected page state
- `AppRuntime` is app-scoped, not a global singleton
- `PageController` is a thin wrapper around the selected page
- `CodeCollector` is only a code collection entry point, not a full reverse-engineering platform

This keeps the codebase ready for future phases such as:

- Hook systems
- network collection
- debugger tooling
- analyzer workflows
