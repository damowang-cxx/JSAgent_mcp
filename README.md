# JS Reverser MCP

Phase 5 TypeScript MCP server for observe-first JavaScript reverse-engineering workflows.

## Current Scope

The project currently includes:

- TypeScript + ESM MCP server based on `@modelcontextprotocol/sdk`
- shared `defineTool` / `ToolRegistry` infrastructure
- structured JSON tool responses
- shared `BrowserSessionManager`
- app-scoped `AppRuntime`
- thin `PageController`
- enhanced `CodeCollector`
- `HookManager`
- `NetworkCollector`
- `RequestInitiatorTracker`
- `XhrWatchpointManager`
- minimal `EvidenceStore`
- observe-first reverse workflow runner

## Design Principles

- Observe-first
  - collect first, then narrow results
- Hook-preferred
  - prefer runtime sampling over debugger-first workflows
- Evidence-first
  - important observations should be writable into task artifacts
- single browser session owner
  - `BrowserSessionManager` remains the only owner of browser + selected page state
- app-scoped runtime
  - `AppRuntime` is composed in `main.ts`, not a global singleton

## Browser Foundation

Browser connection modes:

- `BROWSER_WS_ENDPOINT`
- `BROWSER_URL`
- `BROWSER_AUTO_CONNECT=true`
- local Puppeteer launch fallback

Connection priority:

1. `BROWSER_WS_ENDPOINT`
2. `BROWSER_URL`
3. `BROWSER_AUTO_CONNECT=true`
4. local launch

## Added In Phase 5

- enhanced `collect_code`
  - `returnMode='full' | 'summary' | 'pattern' | 'top-priority'`
  - inline + external collection
  - optional dynamic wait
  - temporary CDP-based script body capture during collection
- collection utilities
  - `collection_diff`
  - `get_collected_code_file`
- request initiator tracing
  - `get_request_initiator`
  - method/url/timestamp nearest-match correlation
- XHR / fetch watchpoints
  - `break_on_xhr`
  - `remove_xhr_breakpoint`
  - `list_xhr_breakpoints`
- observe-first workflow entry
  - `probe_reverse_target`

## Code Collection Boundary

Current `CodeCollector` supports:

- inline scripts
- external scripts
- current-page loaded script URLs
- summary / pattern / top-priority retrieval
- simple in-memory cache + diff
- temporary CDP response-body capture only for JavaScript collection

It still does not implement:

- workers / service workers
- source maps
- AST analysis
- full dependency graphs
- generic response-body platform for every request type

## Request Initiator Boundary

`get_request_initiator` is intentionally approximate:

- page-side tracking wraps `fetch` and `XMLHttpRequest`
- it records stack, URL, method, timestamp, and safe summaries
- correlation is done by:
  - method + URL + nearest timestamp
  - or URL + nearest timestamp

It is not a full CDP initiator-stack fidelity system.

Browser-side stores:

- `window.JSAGENT_PENDING_INITIATORS`
- `window.JSAGENT_INITIATOR_HISTORY`

## XHR Watchpoint Boundary

`break_on_xhr` is a watchpoint, not a full debugger breakpoint.

- default mode is `record`
- optional mode is `debugger-statement`
- matching supports plain substring or regex
- rules can be limited by HTTP method

Browser-side stores:

- `window.JSAGENT_XHR_WATCH_RULES`
- `window.JSAGENT_XHR_WATCH_EVENTS`

## Evidence / Task Artifact Boundary

Current task artifacts use:

- `artifacts/tasks/<taskId>/task.json`
- `timeline.jsonl`
- `runtime-evidence.jsonl`
- `network.jsonl`
- `hooks.jsonl`
- `snapshots/`

The evidence layer stays minimal:

- no report templating
- no rebuild bundles
- no environment scaffolding

## Existing Core Tooling

Still available from earlier phases:

- `check_browser_health`
- `list_pages`
- `select_page`
- `new_page`
- `navigate_page`
- `evaluate_script`
- `create_hook`
- `inject_hook`
- `get_hook_data`
- `list_network_requests`
- `get_network_request`
- `open_reverse_task`
- `record_reverse_evidence`

`evaluate_script` still expects an expression string. If you need multiple statements, wrap them in an IIFE.

Examples:

- `document.title`
- `window.location.href`
- `(() => ({ title: document.title, url: location.href }))()`

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
- `list_network_requests`
- `break_on_xhr`
- reproduce a request in the page
- `get_request_initiator`
- `collect_code` with `returnMode='summary'`
- `collect_code` with `returnMode='top-priority'`
- `collection_diff`
- `probe_reverse_target`

## Example Tool Flow

Add a watchpoint:

```json
{
  "url": "api",
  "mode": "record"
}
```

Collect code summary:

```json
{
  "returnMode": "summary",
  "includeInline": true,
  "includeExternal": true
}
```

Collect top-priority files:

```json
{
  "returnMode": "top-priority",
  "topN": 5,
  "includeInline": true,
  "includeExternal": true
}
```

Get request initiator:

```json
{
  "requestId": "page-1:3",
  "includeSnapshot": true,
  "taskId": "demo-task"
}
```

Probe a target:

```json
{
  "url": "https://example.com",
  "taskId": "probe-demo",
  "autoInjectHooks": true,
  "writeEvidence": true,
  "collect": {
    "returnMode": "top-priority",
    "topN": 5,
    "includeInline": true,
    "includeExternal": true
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
- `collection_diff`
- `get_collected_code_file`
- `list_collected_code`
- `search_collected_code`
- `create_hook`
- `list_hooks`
- `inject_hook`
- `get_hook_data`
- `clear_hook_data`
- `get_request_initiator`
- `break_on_xhr`
- `remove_xhr_breakpoint`
- `list_xhr_breakpoints`
- `open_reverse_task`
- `record_reverse_evidence`
- `probe_reverse_target`

## Still Not Implemented

Phase 5 still does not implement:

- full debugger workflows
- pause / resume / stepInto / callframe tools
- AI analyzer flows
- crypto / deobfuscation pipelines
- full `analyze_target`
- full response-body capture platform
- worker hook ecosystems
- global runtime singleton patterns
