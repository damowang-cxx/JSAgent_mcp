# JS Reverser MCP

Phase 4 minimal TypeScript MCP server for JavaScript reverse-engineering workflows.

## Current Scope

The project currently includes:

- TypeScript + ESM project structure
- stdio MCP server based on `@modelcontextprotocol/sdk`
- shared `defineTool` / `ToolRegistry` infrastructure
- structured JSON tool responses
- shared `BrowserSessionManager`
- app-scoped `AppRuntime`
- thin `PageController`
- minimal in-memory `CodeCollector`
- minimal `HookManager`
- minimal `NetworkCollector`
- minimal `EvidenceStore`

## Design Principles

The current implementation intentionally keeps these boundaries:

- `BrowserSessionManager` remains the only owner of browser + selected page state
- `AppRuntime` is app-scoped, not a global singleton
- `PageController` stays thin and page-oriented
- `CodeCollector` is only a collection entry point, not an analyzer
- `HookManager` works as a facade over hook metadata, script generation, and data reading
- evidence flows are artifact-first

## Hook-First / Evidence-First

Phase 4 follows these rules:

- Hook-first
  - prefer runtime sampling instead of breakpoint workflows
- Evidence-first
  - important observations can be written into task artifacts
- no breakpoint workflow
  - no pause / resume / step controls
  - no full CDP Debugger implementation

## Browser Foundation

The browser session layer from earlier phases is still the single source of truth for:

- browser lifecycle
- page list
- selected page state
- minimal preload injection

Browser connection modes:

- `BROWSER_WS_ENDPOINT`
- `BROWSER_URL`
- `BROWSER_AUTO_CONNECT=true`
- local Puppeteer launch fallback

## Added In Phase 4

- Hook management
  - `create_hook`
  - `list_hooks`
  - `inject_hook`
  - `get_hook_data`
  - `clear_hook_data`
- network request observation
  - `list_network_requests`
  - `get_network_request`
  - `clear_network_requests`
- reverse task artifacts
  - `open_reverse_task`
  - `record_reverse_evidence`

## Hook Capability Boundary

Current hook support is intentionally small:

- `function`
  - wraps a global function or object method by `targetPath`
- `fetch`
  - wraps `window.fetch`
- `xhr`
  - wraps `XMLHttpRequest.prototype.open/send`

Browser-side hook storage uses:

- `window.JSAGENT_HOOK_STORE`
- `window.JSAGENT_HOOK_META`
- `window.JSAGENT_HOOKS_INSTALLED`

Current hook limitations:

- no plugin registry
- no block / modify strategies
- no worker / service worker hooks
- no advanced serialization pipeline
- no anti-debug bypass

## Network Observation Boundary

Current network support is also minimal:

- attaches Puppeteer page listeners lazily
- records request summaries only
- supports:
  - `request`
  - `response`
  - `requestfinished`
  - `requestfailed`

What it does not do:

- no response body capture
- no HAR export
- no initiator stack tracing
- no `break_on_xhr`
- no WebSocket tracking

## Evidence / Task Artifact Boundary

Current task artifacts use this minimal structure:

- `artifacts/tasks/<taskId>/task.json`
- `timeline.jsonl`
- `runtime-evidence.jsonl`
- `network.jsonl`
- `hooks.jsonl`
- `snapshots/`

The evidence layer does not yet implement:

- rebuild bundles
- env templates
- report templates
- algorithm workflows

## Existing Phase 3 Features

Still available:

- `evaluate_script`
- `collect_code`
- `list_collected_code`
- `search_collected_code`

`evaluate_script` supports expression strings evaluated inside the selected page.

Recommended examples:

- `document.title`
- `window.location.href`
- `(() => ({ title: document.title, url: location.href }))()`

If you need multiple statements, wrap them in an IIFE expression.

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

## Suggested Validation Flow

1. Start Chrome with remote debugging enabled.

```bash
chrome.exe --remote-debugging-port=9222
```

2. Configure one browser connection environment variable.

PowerShell example:

```powershell
$env:BROWSER_URL="http://127.0.0.1:9222"
```

3. Start the MCP server.

```bash
npm start
```

4. Validate in this order:

- `list_pages`
- `select_page`
- `create_hook`
- `inject_hook`
- manually trigger a fetch or xhr request
- `get_hook_data`
- `list_network_requests`
- `open_reverse_task`
- `record_reverse_evidence`

## Example Tool Flow

Create a fetch hook:

```json
{
  "type": "fetch",
  "description": "Observe fetch calls"
}
```

Inject it into the selected page:

```json
{
  "hookId": "fetch-example",
  "currentDocument": true,
  "futureDocuments": true
}
```

Read hook data:

```json
{
  "hookId": "fetch-example"
}
```

List network requests:

```json
{
  "limit": 20
}
```

Open a reverse task:

```json
{
  "taskId": "demo-task",
  "slug": "demo",
  "targetUrl": "https://example.com",
  "goal": "Observe hooks and requests"
}
```

Record evidence:

```json
{
  "taskId": "demo-task",
  "type": "runtime-evidence",
  "value": {
    "note": "fetch hook fired"
  },
  "timelineEvent": {
    "kind": "hook-fired"
  },
  "snapshotName": "hook-state",
  "snapshotValue": {
    "hookId": "fetch-example"
  }
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

### Network Tools

- `list_network_requests`
- `get_network_request`
- `clear_network_requests`

### Reverse Engineering Entry Tools

- `collect_code`
- `list_collected_code`
- `search_collected_code`
- `create_hook`
- `list_hooks`
- `inject_hook`
- `get_hook_data`
- `clear_hook_data`
- `open_reverse_task`
- `record_reverse_evidence`

## Still Not Implemented

Phase 4 still does not implement:

- breakpoint workflows
- debugger stepping
- full CDP response body capture
- LLM analysis
- crypto / deobfuscation
- `analyze_target`
- worker hook systems
- full reverse-analysis orchestration
