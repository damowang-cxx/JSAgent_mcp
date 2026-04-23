# JSAgent_mcp

TypeScript MCP server for observe-first JavaScript reverse-engineering, static analysis, rebuild/patch, pure extraction, and port validation workflows.

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
- deterministic static analysis layer
- session report exporter
- deterministic deobfuscation pipeline
- request-chain correlator
- enhanced analyze workflow runner
- reverse-focused report exporter
- rebuild bundle exporter and Node probe runner
- fixture extraction, first-divergence comparison, and deterministic patch advisor
- rebuild/patch workflow runner and report exporter
- patch plan manager, single-patch applier, patch iteration runner, and acceptance recorder
- fixture stabilization and patch workflow report exporter
- PureExtraction gate, frozen sample manager, runtime trace sampler, Node pure scaffold, verifier, and pure report exporter
- Python pure scaffold exporter, cross-language verifier/diff, port workflow, and upgrade-diff runner
- canonical task manifest, stage gates, regression baseline registry, regression runner, SDK packager, and delivery workflow
- scenario-oriented reverse capability layer for signature chains, token families, request sinks, and crypto helpers
- replay-oriented capture recipes and helper-boundary extraction hints
- minimal dependency window export and scenario-guided probe planning
- boundary-driven fixture candidates and scenario-specific patch hints
- debugger foundation for breakpoint-last selected-page debugging
- debugger inspection layer for stepping, paused frame inspection, bounded scope summaries, and debugger reports
- compare anchor integration for first explainable divergence selection
- patch preflight integration for first explainable patch focus selection
- rebuild integration for reverse-to-rebuild context provenance
- Flow Reasoning Lite for helper consumers, request field binders, and sink-adjacent bindings
- Pure Preflight Integration for reverse-to-pure context provenance
- AI Augmentation for optional semantic explanations over deterministic artifacts
- Delivery / Regression Consumption for downstream provenance handoff
- Browser Field Operations for selected-page DOM, console, storage, session, and stealth helpers
- Script Intelligence & Source Precision for live selected-page script enumeration, exact source reads, and bounded source search
- Debugger Finishing Pack for exception breakpoints, watch expressions, and lite debug target orchestration
- Function Scalpel Pack for quick selected-page function hooks, traces, bounded object inspection, and event monitoring

## Design Principles

- Observe-first
  - collect first, then narrow results
- Hook-preferred
  - prefer runtime sampling over debugger-first workflows
- Breakpoint-last
  - use debugger state as enhancer context after hook/replay/code evidence
- Evidence-first
  - important observations should be writable into task artifacts
- Rebuild-oriented
  - move from observe/capture/analyze into local probeable bundles
- Target-chain-first
  - reason around the selected reverse chain before broad project exploration
- Script-first precision before broad code collection fallback
  - inspect live selected-page scripts directly before falling back to collected-code analysis
- Function-scalpel-first before broad workflow escalation
  - use quick function/object/event probes before escalating into broader structured workflows
- Smallest useful reasoning first
  - produce bounded, explainable chains instead of full static-analysis graphs
- Patch around first divergence
  - patch suggestions should address the first explainable mismatch, not a broad env template
- Re-test immediately
  - every applied patch must be followed by a rebuild probe and divergence comparison
- Boundary-before-rewrite
  - define inputs, environment state, intermediates, and outputs before generating a pure scaffold
- First explainable divergence first
  - compare and pure expected outputs should start from the smallest explainable mismatch
- AI as semantic enhancer, not truth source
  - AI can explain artifacts, but deterministic evidence keeps authority
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

## Added In Phase 6

Phase 6 adds a structured understanding layer on top of the existing observe/capture runtime:

- `summarize_code`
  - deterministic single / batch / project summaries
  - request, storage, crypto, DOM, and suspicious string highlights
- `understand_code`
  - static structure / business / security / metrics analysis
  - file type hints, candidate functions, exported symbols, quality score
- `detect_crypto`
  - deterministic crypto algorithm, library, and security issue detection
  - recognizes md5, sha1, sha256, hmac, aes, rsa, base64, crypto.subtle, pbkdf2
- `risk_panel`
  - combines static risks, crypto issues, hook records, and network request signals
  - returns an explainable 0-100 score with recommendations
- `export_session_report`
  - exports collector, hook, network, evidence, and optional risk state
  - supports `json` and `markdown`
- `analyze_target`
  - lite workflow: collect, summarize, understand, detect crypto, score risk, correlate hooks/network, recommend next steps
  - can write key summaries into task artifacts when `writeEvidence=true`

Phase 6 is static-first:

- no external AI provider is required
- all default analysis works offline with deterministic rules and heuristics
- `useAI` is only a future placeholder in this phase
- no deobfuscation, debugger stepping, SSA, taint engine, or full request-chain graph is implemented

## Added In Next Stage

This stage follows the JSReverser-MCP design direction without copying its full complexity:

- `deobfuscate_code`
  - independent deterministic deobfuscation pipeline
  - fixed phases: detect, unpack-like decode, simplify, string-array/accessor cleanup, rename/readability cleanup, optional local explain
  - single step failures are recorded in `transformations` and do not abort the whole pipeline
- `correlate_request_flows`
  - correlates hook records, network records, and request initiator matches
  - returns hook/network timeline, correlated flows, suspicious flows, request fingerprints, and priority targets
- enhanced `analyze_target`
  - supports `includeCorrelation`, `runDeobfuscation`, `includeExplain`, `exportReportFormat`
  - returns correlation-aware priority targets, action plan, optional deobfuscation summary, and optional report preview
  - writes `correlation-summary` and `deobfuscation-summary` snapshots when `writeEvidence=true`
- `export_reverse_report`
  - exports reverse-focused JSON or Markdown from the current session or the latest `analyze_target` result

Design boundaries:

- deobfuscation is separate from static analysis
- correlation is approximate, not an absolute call-stack truth
- all conclusions are derived from observed hook/network/initiator/code signals where available
- no external AI provider is connected
- no VM-level restore, debugger platform, CFG/SSA/taint engine, or deep WebSocket protocol analysis is implemented

## Added In Phase 8

Phase 8 moves the workflow into rebuild/patch infrastructure:

- `export_rebuild_bundle`
  - exports collected top-priority code into a minimal local Node bundle
  - supports `single-file` and `top-priority-merged` strategies
  - can include `fixture.json`, `env-shim.js`, `env-access-logger.js`, `metadata.json`, and `entry.js`
- `run_rebuild_probe`
  - runs the generated `entry.js` with Node
  - captures structured result/error payloads, stdout/stderr, timeout, and env access logs
- `compare_rebuild_result`
  - compares a rebuild run against expected output or fixture context
  - reports only the first explainable divergence
- `diff_env_requirements`
  - emits deterministic patch suggestions around first divergence or the first env access miss
  - does not apply patches automatically
- `save_pure_fixture`
  - extracts a compact runtime fixture from the current page or latest `analyze_target`
  - can write it into task snapshots
- `run_rebuild_workflow`
  - chains fixture extraction, bundle export, probe run, first-divergence compare, and patch plan
  - writes rebuild artifacts when `writeEvidence=true`
- `prepare_rebuild_context`
  - resolves boundary fixture, compare anchor, patch preflight, dependency window, and patch hints into a rebuild input context
- `run_rebuild_from_context`
  - runs the rebuild workflow with rebuild context provenance attached
- `export_rebuild_report`
  - exports the latest rebuild workflow result as JSON or Markdown
- `export_rebuild_context_report`
  - exports the reverse-to-rebuild context as JSON or Markdown

Phase 8 boundaries:

- this is a Node rebuild probe, not full browser emulation
- patch suggestions are deterministic hints, not automatic fixes
- the fixture format is intentionally compact and prepares for later pure extraction
- no Python port, service-side verifier, external AI patching, or full DOM shim is implemented

## Added In Phase 9

Phase 9 closes the patch loop around first divergence and acceptance evidence:

- `plan_patch`
  - turns a rebuild run result into a managed `PatchPlan`
  - stores first-divergence-centered suggestions as patch history
- `list_patch_history`
  - lists cached patch plans, applied patches, and acceptance records for the current runtime
- `apply_patch`
  - applies exactly one minimal `PatchSuggestion` to the rebuild bundle patch region
  - defaults to `env-shim.js`; no AST rewrite or bulk patch set is attempted
- `run_patch_iteration`
  - runs one patch iteration: probe, compare, plan, optional single patch apply, immediate reprobe, progress check
  - returns `divergenceProgress` with `movedForward`, `resolved`, `worsened`, and `unchanged`
- `mark_acceptance`
  - records manual or external acceptance evidence in task artifacts
  - this is a recorder, not a service-side validator platform
- `stabilize_fixture`
  - extracts multiple compact fixtures and reports coarse stability/mismatches
- `export_patch_report`
  - exports the latest patch workflow or patch iteration as JSON or Markdown

Phase 9 follows these boundaries:

- patches are centered on the current first divergence
- default behavior applies at most one patch per iteration
- each patch is immediately retested with `run_rebuild_probe`
- fixture stabilization is a coarse consistency check, not a mathematical proof
- acceptance is manually or externally supplied evidence, not an integrated server protocol
- no AI patching, Python port, full DOM/browser emulation, or automatic repair system is implemented

## Added In Phase 10

Phase 10 adds the first PureExtraction infrastructure:

- `freeze_runtime_sample`
  - freezes an accepted sample after the pure gate passes
  - writes `run/frozen-sample.json` when a task is provided
- `export_runtime_trace`
  - samples the local rebuild runtime rather than returning to browser-first sampling
  - records call / return / error / intermediate trace records
- `define_pure_boundary`
  - deterministically defines explicit inputs, derived inputs, environment state, intermediates, outputs, and excluded runtime noise
- `build_pure_fixture`
  - builds a fixture from the frozen sample, boundary, and optional runtime trace
- `extract_node_pure`
  - generates a Node-only pure scaffold under task `run/node-pure/` or a temporary pure artifact directory
  - creates `pure-entry.js`, `pure-impl.js`, `fixtures.json`, `pure-readme.md`, and `metadata.json`
- `verify_node_pure`
  - runs the Node pure scaffold and compares structured output against the fixture expected output
- `run_pure_workflow`
  - chains gate check, freeze, local trace, boundary, fixture, Node scaffold, and verification
- `export_pure_report`
  - exports the latest PureExtraction workflow as JSON or Markdown

Phase 10 follows these design rules:

- Gate before extraction: acceptance must be passed and rebuild/patch gate must be matched or resolved
- Freeze-first: the frozen sample is the truth source for fixture and verification
- Hook-local-runtime: runtime trace is collected from local rebuild runtime first
- Boundary-before-rewrite: no pure scaffold is generated before boundary definition
- Fixture-before-port: verification must use stable fixture output
- Node-before-Python: no Python or other language port is generated in this phase
- Evidence-first: `run/*.json` snapshots and `run/node-pure/` files are task-local artifacts

Phase 10 boundaries:

- Node pure output is a scaffold, not a guaranteed complete automatic pure implementation
- verification is deterministic comparison, not symbolic proof
- no Python port, external AI provider, full AST/CFG/SSA/taint engine, full debugger, or second browser manager is implemented

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
- rebuild bundles are written only by explicit rebuild tools/workflows
- environment scaffolding is limited to minimal shim/probe files

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
- `get_collected_code_file`
- `summarize_code`
- `understand_code`
- `detect_crypto`
- `risk_panel`
- `deobfuscate_code`
- `correlate_request_flows`
- `analyze_target`
- `save_pure_fixture`
- `export_rebuild_bundle`
- `run_rebuild_probe`
- `compare_rebuild_result`
- `diff_env_requirements`
- `run_rebuild_workflow`
- `export_rebuild_report`
- `stabilize_fixture`
- `plan_patch`
- `apply_patch`
- `run_patch_iteration`
- `mark_acceptance`
- `export_patch_report`
- `freeze_runtime_sample`
- `export_runtime_trace`
- `define_pure_boundary`
- `build_pure_fixture`
- `extract_node_pure`
- `verify_node_pure`
- `run_pure_workflow`
- `export_pure_report`
- `export_reverse_report`
- `export_session_report`
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

Analyze a target with the enhanced workflow:

```json
{
  "url": "https://example.com",
  "topN": 6,
  "hookPreset": "api-signature",
  "autoInjectHooks": true,
  "waitAfterHookMs": 500,
  "includeCorrelation": true,
  "runDeobfuscation": true,
  "includeExplain": true,
  "exportReportFormat": "markdown",
  "taskId": "analyze-demo",
  "writeEvidence": true,
  "collect": {
    "includeInline": true,
    "includeExternal": true,
    "includeDynamic": true,
    "dynamicWaitMs": 1000
  }
}
```

Run deterministic deobfuscation:

```json
{
  "code": "eval(String.fromCharCode(99,111,110,115,116,32,120,61,49,59))",
  "renameVariables": true,
  "explain": true
}
```

Correlate current request flows:

```json
{
  "correlationWindowMs": 1500,
  "maxFlows": 20,
  "maxFingerprints": 12,
  "candidateFunctions": ["signToken", "buildSignature"],
  "cryptoAlgorithms": ["hmac", "sha256"]
}
```

Export a session report:

```json
{
  "format": "markdown",
  "includeHookData": true,
  "includeRecentRequests": true
}
```

Export a reverse-focused report from the latest analyze run:

```json
{
  "source": "analyze-target-last",
  "format": "markdown",
  "taskId": "report-demo",
  "writeSnapshot": true
}
```

Run the rebuild-oriented workflow:

```json
{
  "taskId": "rebuild-demo",
  "fixtureSource": "analyze-target-last",
  "writeEvidence": true,
  "export": {
    "entryStrategy": "single-file",
    "includeFixture": true,
    "includeEnvShim": true,
    "includeAccessLogger": true,
    "overwrite": true
  },
  "run": {
    "timeoutMs": 5000
  }
}
```

Export a rebuild report:

```json
{
  "format": "markdown",
  "taskId": "rebuild-demo",
  "writeSnapshot": true
}
```

Run a patch convergence iteration:

```json
{
  "taskId": "patch-demo",
  "autoApplyFirstSuggestion": true,
  "writeEvidence": true,
  "run": {
    "timeoutMs": 5000
  }
}
```

Record acceptance evidence:

```json
{
  "taskId": "patch-demo",
  "status": "passed",
  "notes": ["Manual acceptance matched the observed target behavior."]
}
```

Export a patch report:

```json
{
  "format": "markdown",
  "taskId": "patch-demo",
  "writeSnapshot": true
}
```

Run the PureExtraction workflow:

```json
{
  "taskId": "pure-demo",
  "source": "patch-last",
  "targetFunctionName": "__target_sign",
  "probeExpressions": ["globalThis.location?.href"],
  "traceTimeoutMs": 5000,
  "verifyTimeoutMs": 5000,
  "overwrite": true,
  "writeEvidence": true
}
```

Export a pure report:

```json
{
  "format": "markdown",
  "taskId": "pure-demo",
  "writeSnapshot": true
}
```

## Phase 11: Port / Cross-Language Validation / Upgrade-Diff

Phase 11 moves from Node pure into scaffold-first host port infrastructure. The gate is intentionally strict: Python port tools require a passing PureExtraction baseline, including `readyForPort=true` and `verify_node_pure` success. If that gate is missing, the workflow returns `PORT_GATE_NOT_SATISFIED` instead of continuing.

New capabilities:

- `extract_python_pure`: export a Python scaffold from the Node pure baseline and the same pure fixture.
- `verify_python_pure`: run Node pure and Python pure against the same fixture and compare structured JSON output.
- `diff_cross_language`: summarize the cross-language first divergence and the smallest next action.
- `run_port_workflow`: gate check, Python scaffold generation, verification, diff, and artifact snapshots.
- `export_port_report`: export JSON or markdown reports for the latest port workflow.
- `analyze_upgrade_diff`: compare old/new runtime, Node, and Python samples to locate the likely drift layer.

Design boundaries:

- Node remains the baseline. Python is downstream of the Node pure scaffold.
- The Python fixture uses the same explicit input boundary; page dumps are not passed as Python input.
- This is not an automatic Node-to-Python translator and does not produce an SDK wrapper.
- Cross-language mismatch reports first divergence first; it does not auto-fix Python.

Recommended Phase 11 validation flow:

1. `run_pure_workflow` with `writeEvidence=true` until `readyForPort=true`.
2. `extract_python_pure` with the same `taskId`.
3. `verify_python_pure` using the returned Node entry, Python entry, and fixture file.
4. `diff_cross_language` with the verification payload.
5. `run_port_workflow` with `writeEvidence=true`.
6. `export_port_report` as JSON and markdown.
7. `analyze_upgrade_diff` with old/new runtime, Node, and Python sample outputs.

Run the Port workflow:

```json
{
  "taskId": "port-demo",
  "overwrite": true,
  "verifyTimeoutMs": 5000,
  "writeEvidence": true
}
```

Export a port report:

```json
{
  "format": "markdown",
  "taskId": "port-demo",
  "writeSnapshot": true
}
```

## Phase 12: Artifact/Gate Closure + SDK Packaging / Regression Baseline

Phase 12 turns task artifacts into the canonical state source. A stage is not considered done just because its tools exist; `evaluate_stage_gate` checks concrete artifacts and explains missing evidence.

New capabilities:

- `get_task_manifest`: reads or creates the canonical task manifest, latest pointers, stage state, and artifact index.
- `evaluate_stage_gate`: evaluates one stage or all stages with reasons, missing artifacts, and next actions.
- `register_regression_baseline`: registers a fixture-based baseline only after the pure or port gate passes.
- `list_regression_baselines`: lists artifact-backed baselines for a task.
- `run_regression_baseline`: reruns Node/Python pure outputs against the registered baseline and reports first divergence.
- `export_sdk_package`: exports a minimal Node/Python/dual SDK package only after the required verification gate passes and the latest regression run matches the current baseline.
- `export_task_state_report`: exports current stage, gates, latest pointers, missing artifacts, and next actions.
- `export_regression_report`: exports the latest regression run report.
- `run_delivery_workflow`: chains gates, baseline, regression, and SDK packaging into a delivery readiness result.

Design rules:

- Artifact-first: task snapshots and jsonl logs are the truth source; runtime cache is only a shortcut.
- Stage-completion-first: Observe / Capture / Rebuild / Patch / PureExtraction / Port / Delivery have explicit gate checks.
- Baseline-before-regression: baselines can only be registered after pure or port gate passes.
- SDK-after-verification: Node SDK requires pure gate; Python/dual SDK requires port gate; every SDK export also requires a matched regression artifact.
- Evidence-first: manifests, baselines, regression runs, reports, and SDK exports are written back into task artifacts.

Boundaries:

- SDK packages are minimal delivery artifacts, not npm/PyPI publishing pipelines.
- SDK packages now include thin callable wrappers around the verified Node/Python pure implementations instead of contract-only metadata.
- Regression is fixture-based deterministic comparison, not full CI integration.
- Upgrade/regression mismatch reports first divergence and the smallest next action; it does not auto-fix code.

Recommended Phase 12 validation flow:

1. `run_port_workflow` with `writeEvidence=true`.
2. `evaluate_stage_gate` with `{ "all": true }`.
3. `register_regression_baseline`.
4. `run_regression_baseline`.
5. `export_sdk_package`.
6. `export_task_state_report` as JSON and markdown.
7. `export_regression_report` as JSON and markdown.
8. `run_delivery_workflow`.

Evaluate all gates:

```json
{
  "taskId": "delivery-demo",
  "all": true
}
```

Register and run a baseline:

```json
{
  "taskId": "delivery-demo",
  "source": "port",
  "notes": ["First delivery baseline after port gate."]
}
```

Export a dual SDK package:

```json
{
  "taskId": "delivery-demo",
  "target": "dual",
  "overwrite": true
}
```

## Phase 13: Intermediate Alignment / Upgrade Regression / SDK Hardening

Phase 13 strengthens long-term maintenance after a delivery baseline exists. The focus is not more discovery; it is intermediate-first regression, versioned upgrade baselines, and delivery bundles that contain verified implementation files plus smoke tests.

New capabilities:

- `register_intermediate_baseline`: freezes available fixture intermediates and registered probes as an artifact-backed intermediate baseline.
- `list_intermediate_baselines`: lists intermediate baselines and probes for a task.
- `run_intermediate_regression`: compares intermediate data before falling back to final-output divergence, and reports honest notes when no intermediate data exists.
- `register_upgrade_baseline`: registers a versioned upgrade baseline only after regression or delivery gate evidence exists.
- `run_upgrade_workflow`: runs artifact-backed upgrade regression with final and intermediate divergence signals.
- `export_upgrade_report`: exports JSON or markdown for the latest upgrade workflow.
- `export_delivery_bundle`: assembles a stronger delivery bundle with verified implementation files, contract, fixtures, provenance, and smoke entries.
- `smoke_test_delivery_bundle`: runs the minimal Node/Python smoke test for the delivery bundle.
- `export_delivery_report`: exports JSON or markdown for the latest delivery hardening result.

Design rules:

- First divergence before final-output-only compare: intermediate probes are preferred; missing intermediate data is reported explicitly.
- Artifact-first: baselines, probes, upgrade workflow results, delivery bundles, and smoke results are task artifacts.
- Baseline-before-upgrade: upgrade workflow starts from a registered regression/versioned baseline.
- Delivery-after-regression: stronger delivery bundles require matched regression and verified implementation artifacts.

Boundaries:

- No npm/PyPI publishing is performed.
- Intermediate alignment depends on available probes or fixture intermediates; it does not invent missing values.
- Delivery bundle is a stronger artifact for distribution review, not a full SDK platform.

Recommended Phase 13 validation flow:

1. `evaluate_stage_gate` with `{ "all": true }`.
2. `register_regression_baseline`.
3. `run_regression_baseline`.
4. `register_intermediate_baseline`.
5. `run_intermediate_regression`.
6. `register_upgrade_baseline`.
7. `run_upgrade_workflow`.
8. `export_delivery_bundle`.
9. `smoke_test_delivery_bundle`.
10. `export_delivery_report`.

## 第十四期说明: Scenario-Oriented Reverse Capability Layer

Phase 14 adds a task-type scenario layer above the existing observe/capture/analyze/rebuild platform. It is scenario-oriented, not site-oriented: the presets target common reverse tasks instead of any specific website or vendor.

New tools:

- `analyze_signature_chain`: scores suspicious requests and sign/token/auth/nonce indicators, then returns priority targets and action steps.
- `trace_token_family`: tracks token/auth/nonce/verify/challenge/sign family members across request fields, hook records, and collected code.
- `locate_request_sink`: locates likely final request sinks such as `fetch`, `XMLHttpRequest`, `axios`, `$.ajax`, and `sendBeacon`.
- `locate_crypto_helpers`: ranks hash/HMAC/AES/RSA/base64/encode helpers that are worth auditing.
- `list_scenario_presets`: lists generic task-type presets.
- `run_scenario_recipe`: runs a preset, combines analysis/trace/sink/helper evidence, and writes artifacts when requested.
- `export_scenario_report`: exports the latest or artifact-backed scenario workflow as JSON or markdown.

Design principles referenced from JSReverser-MCP:

- Observe-first: runtime and request evidence come before rebuild assumptions.
- Hook-preferred: recipes prefer fetch/xhr capture and function hooks before debugger escalation.
- Target-chain-first: analysis prioritizes the likely target request, parameter family, final sink, and helper functions.
- Evidence-first: `taskId` workflows write `scenario/*` snapshots and `runtime-evidence` entries.
- Actionable output: results include priority targets, why those targets matter, next actions, and stop conditions.

Current boundaries:

- Presets are task-type presets, not site-specific templates or vendor adapters.
- Token family tracing is heuristic; it is not a complete data-flow or taint engine.
- Request sink location focuses on the last hop near network dispatch; it is not a full callgraph.
- No external AI provider, full debugger, second browser manager, or global runtime singleton is introduced.

Recommended Phase 14 validation flow:

1. `list_scenario_presets`.
2. `run_scenario_recipe` with `{ "presetId": "api-signature-basic" }`.
3. `analyze_signature_chain`.
4. `locate_request_sink`.
5. `locate_crypto_helpers`.
6. `trace_token_family`.
7. `export_scenario_report` with `format='json'` and `format='markdown'`.

## Phase 15: Replay-Oriented Capture Recipes + Helper-Boundary Extraction Layer

Phase 15 connects scenario findings to action-level replay and helper-boundary evidence. It keeps the JSReverser-MCP design direction while staying task-type oriented rather than site-template oriented.

New tools:

- `list_capture_presets`: lists generic capture presets for API signature, token refresh, anti-bot challenge, and crypto-helper probing.
- `replay_target_action`: runs one replay action through the capture pipeline using the built-in single-action preset.
- `run_capture_recipe`: runs a capture preset with supplied actions, records replay-window evidence, and refreshes scenario analysis.
- `extract_helper_boundary`: turns a helper candidate into boundary-level inputs, outputs, related requests, hooks, rebuild hints, and pure hints.
- `list_helper_boundaries`: lists the latest runtime boundary or task artifact-backed helper boundaries.
- `export_capture_report`: exports the latest or artifact-backed replay capture result as JSON or markdown.

Design principles referenced from JSReverser-MCP:

- Observe-first: replay is used to create cleaner runtime evidence before extraction.
- Hook-preferred: capture presets install fetch/xhr hooks before escalating to heavier techniques.
- Replay-oriented: actions reproduce target requests and parameter chains instead of automating a whole site.
- Evidence-first: task runs write `scenario/capture/*`, `helper-boundary/*`, and `runtime-evidence` artifacts.
- Rebuild-oriented: boundary results produce `rebuildHints` for later local probes.
- Boundary-before-extraction: helper extraction starts by defining likely inputs, outputs, and request bindings.

Current boundaries:

- Replay actions are generic action-level primitives, not site-specific automation scripts.
- Helper-boundary extraction is heuristic; it is not a complete data-flow, SSA, or taint engine.
- `rebuildHints` and `pureHints` are pre-extraction guidance, not automatic PureExtraction output.
- No external AI provider, full debugger, second browser manager, or global runtime singleton is introduced.

Recommended Phase 15 validation flow:

1. `list_capture_presets`.
2. `run_capture_recipe` with `{ "presetId": "api-signature-replay-basic", "actions": [...] }`.
3. `analyze_signature_chain`.
4. `extract_helper_boundary`.
5. `list_helper_boundaries`.
6. `export_capture_report` with `format='json'` and `format='markdown'`.

## Phase 16: Minimal Dependency Window Export + Scenario-Guided Probe Planning Layer

Phase 16 narrows scenario and replay evidence into a smallest useful helper/function window and a probe plan that can feed rebuild and later pure extraction work. It is scenario-guided and evidence-backed, not a generic slicing compiler.

New tools:

- `extract_dependency_window`: exports a minimal, probe-ready dependency window around a target helper/function.
- `list_dependency_windows`: lists the latest runtime window or task artifact-backed dependency windows.
- `plan_scenario_probe`: creates a scenario-guided probe plan from dependency window, helper boundary, scenario, capture, or task artifacts.
- `list_scenario_probe_plans`: lists runtime or task artifact-backed probe plans.
- `export_window_report`: exports dependency window JSON or markdown.
- `export_probe_plan_report`: exports scenario probe plan JSON or markdown.

Design principles referenced from JSReverser-MCP:

- Observe-first: window and probe planning start from observed scenario/capture/helper evidence.
- Hook-preferred: plans prefer function and fetch/xhr hooks before debugger workflows.
- Target-chain-first: the selected helper/function, request anchor, sink, and token binding drive the plan.
- Evidence-first: task runs write `dependency-window/*`, `scenario-probe/*`, and `runtime-evidence` artifacts.
- Rebuild-oriented: outputs include `rebuildPreflightHints` for the next probe.
- Boundary-before-extraction: helper boundaries inform window inputs and outputs before pure extraction.
- Smallest useful window first: export only the first probeable dependency window, then expand after evidence fails.

Current boundaries:

- Dependency windows are heuristic minimal windows, not an AST slicing, SSA, or taint engine.
- Scenario probe plans are evidence-driven plans, not an automatic execution platform.
- `rebuildPreflightHints` and `purePreflightHints` are preflight guidance, not automatic pure implementation export.
- No site adapter, external AI provider, full debugger, second browser manager, or global runtime singleton is introduced.

Recommended Phase 16 validation flow:

1. `run_capture_recipe`.
2. `extract_helper_boundary`.
3. `extract_dependency_window`.
4. `plan_scenario_probe`.
5. `export_window_report` with `format='json'` and `format='markdown'`.
6. `export_probe_plan_report` with `format='json'` and `format='markdown'`.

## Phase 17: Boundary-Driven Fixture Generation + Scenario-Specific Patch Hint Layer

Phase 17 turns boundary, dependency-window, and probe-plan evidence into smaller fixture candidates and first explainable scenario patch hints. It prepares rebuild/patch/pure workflows without rewriting those workflows or applying patches automatically.

New tools:

- `generate_boundary_fixture`: generates a smallest useful fixture candidate from window, probe, helper-boundary, or task artifacts.
- `list_boundary_fixtures`: lists runtime or task artifact-backed fixture candidates.
- `generate_scenario_patch_hints`: generates scenario-specific patch hints without applying patches.
- `list_scenario_patch_hints`: lists runtime or task artifact-backed patch hint sets.
- `export_boundary_fixture_report`: exports fixture candidate JSON or markdown.
- `export_scenario_patch_hint_report`: exports scenario patch hint JSON or markdown.

Design principles referenced from JSReverser-MCP:

- Observe-first: fixture and patch hints start from observed boundary/window/probe/capture/scenario evidence.
- Hook-preferred: hints prefer focused helper and fetch/xhr observations before debugger workflows.
- Target-chain-first: target helper, preserved inputs, expected outputs, request anchors, and sinks drive decisions.
- Evidence-first: task runs write `boundary-fixture/*`, `scenario-patch-hints/*`, and `runtime-evidence` artifacts.
- Rebuild-oriented: fixture candidates and patch hints are shaped for rebuild probe and first-divergence comparison.
- Boundary-before-extraction: fixture candidates respect helper boundary and dependency window inputs/outputs.
- Smallest useful fixture first: fixtures start with the minimal inputs and expected outputs needed to validate behavior.
- First explainable patch first: patch hints prioritize the first supported patch direction, not broad repair lists.

Current boundaries:

- Boundary fixtures are candidate rebuild fixtures, not final pure fixtures.
- Scenario patch hints are evidence-driven hints, not an automatic patch engine.
- This phase does not implement automatic pure extraction, automatic patch application, full AST slicing, SSA, taint analysis, external AI, or a second browser manager.

Recommended Phase 17 validation flow:

1. `run_capture_recipe`.
2. `extract_helper_boundary`.
3. `extract_dependency_window`.
4. `plan_scenario_probe`.
5. `generate_boundary_fixture`.
6. `generate_scenario_patch_hints`.
7. `export_boundary_fixture_report` with `format='json'` and `format='markdown'`.
8. `export_scenario_patch_hint_report` with `format='json'` and `format='markdown'`.

## Phase 18: Debugger Foundation

Phase 18 adds a minimal CDP Debugger foundation for the currently selected page. It is a breakpoint-last fallback for cases where hooks, replay, scenario analysis, helper boundaries, and dependency windows are not enough to inspect helper or request-sink local state.

New tools:

- `set_breakpoint`: attaches lazily to the selected page and sets a URL + 1-based line breakpoint.
- `set_breakpoint_on_text`: searches live CDP script sources and sets a breakpoint on matching text.
- `list_breakpoints`: lists runtime or task artifact-backed debugger breakpoints.
- `remove_breakpoint`: removes a managed debugger breakpoint.
- `pause`: requests `Debugger.pause` and returns only minimal paused state if the page actually pauses.
- `resume`: resumes execution when the selected page is paused.
- `get_paused_info`: returns minimal paused information without scopes or call-frame evaluation.

Design principles referenced from JSReverser-MCP:

- Observe-first: use collected hook/network/scenario evidence before debugger breakpoints.
- Hook-preferred: `create_hook`, `inject_hook`, `break_on_xhr`, `run_capture_recipe`, and boundary tools remain the default path.
- Breakpoint-last: set breakpoints only when local helper/sink state must be inspected.
- Evidence-first: task runs write `debugger/breakpoints-latest`, `debugger/paused-last`, and `runtime-evidence` entries.
- Rebuild-oriented: debugger evidence should refine boundary/window/fixture inputs for rebuild probes, not replace them.

Current boundaries:

- This is debugger foundation, not a full DevTools replacement.
- No scope variable explorer is implemented.
- No `evaluate_on_call_frame` is implemented.
- No `step_over`, `step_into`, or `step_out` tools are implemented.
- No exception breakpoint family, watch expressions, worker debugger, or multi-page debugger orchestration is implemented.

Recommended Phase 18 validation flow:

1. `list_pages`.
2. `select_page`.
3. `set_breakpoint_on_text`.
4. Reproduce the target action in the page.
5. `get_paused_info`.
6. `resume`.
7. `list_breakpoints`.
8. `remove_breakpoint`.

## Phase 19: Debugger Inspection Layer

Phase 19 extends the Phase 18 debugger foundation with a bounded inspection layer for paused helper/sink context. It remains a breakpoint-last fallback: use hook, replay, scenario, helper-boundary, dependency-window, and probe-plan evidence first, then inspect paused call frames only when local runtime state is needed.

New tools:

- `step_over`: steps over from the current paused frame and updates paused evidence when execution pauses again.
- `step_into`: steps into from the current paused frame.
- `step_out`: steps out from the current paused frame.
- `get_call_frames`: returns structured paused call frame details and minimal correlation hints.
- `get_scope_variables`: reads bounded non-global scope variable summaries for a paused frame.
- `evaluate_on_call_frame`: evaluates one expression on a paused call frame and returns a safe serialized result.
- `export_debugger_report`: exports debugger breakpoints, paused state, call frames, scope summaries, and correlation hints as JSON or markdown.

Design principles referenced from JSReverser-MCP:

- Observe-first: debugger inspection consumes existing hook/network/scenario/replay evidence before adding new claims.
- Hook-preferred: `create_hook`, `inject_hook`, `break_on_xhr`, `run_capture_recipe`, `extract_helper_boundary`, `extract_dependency_window`, and `plan_scenario_probe` remain the default path.
- Breakpoint-last: inspect paused call frames only when hook/capture evidence is not enough to explain helper or request-sink state.
- Evidence-first: task runs can write `debugger/inspection-last`, `debugger/paused-last`, and `runtime-evidence` entries.
- Rebuild-oriented: paused variables and evaluation output are meant to refine fixtures, compare anchors, patch preflight, and rebuild probes.

Current boundaries:

- This is an inspection layer, not a full debugger platform.
- No exception breakpoint family is implemented.
- No watch expression platform is implemented.
- No worker or service-worker debugger is implemented.
- No multi-page concurrent debugger orchestration is implemented.
- No patch-preflight, AST/data-flow/SSA/taint integration is implemented in this phase.

Recommended Phase 19 validation flow:

1. `list_pages`.
2. `select_page`.
3. `set_breakpoint_on_text`.
4. Reproduce the target action in the page.
5. `get_paused_info`.
6. `get_call_frames`.
7. `get_scope_variables`.
8. `evaluate_on_call_frame`.
9. `step_over`, `step_into`, or `step_out`.
10. `resume`.
11. `export_debugger_report` with `format='json'` and `format='markdown'`.

## Phase 20: Compare Anchor Integration

Phase 20 introduces a focused compare anchor layer that answers what should be compared first. It consumes scenario, capture, helper-boundary, dependency-window, probe-plan, boundary-fixture, patch-hint, debugger, and rebuild evidence to choose the smallest explainable anchor before whole-request or whole-object comparison.

New tools:

- `select_compare_anchor`: selects the current first useful compare anchor and candidate set.
- `list_compare_anchors`: lists the latest runtime or task artifact-backed anchor selection.
- `export_compare_anchor_report`: exports compare anchor selection JSON or markdown.

Design principles referenced from JSReverser-MCP:

- Observe-first: anchor selection is based on existing reverse evidence instead of speculative full diffs.
- Hook-preferred: scenario, capture, helper-boundary, window, probe, and fixture evidence outrank debugger-only hints.
- Breakpoint-last: debugger inspection/correlation can strengthen an anchor but should not be the default source.
- Evidence-first: task runs can write `compare-anchor/latest` and `runtime-evidence` entries.
- Rebuild-oriented: selected anchors are shaped for future `compare_rebuild_result`, rebuild workflow, and patch iteration consumption.
- First explainable divergence first: prefer helper return, sign/token/challenge/fingerprint field, header, or body-field before broad request/object comparison.

Current boundaries:

- Compare anchor is a first-divergence preflight layer, not a full diff engine.
- It does not implement semantic full-response diffing or automatic multi-anchor orchestration.
- It does not implement rebuild integration in this phase.
- It does not add AST/data-flow/SSA/taint analysis.

Recommended Phase 20 validation flow:

1. `run_capture_recipe`.
2. `extract_helper_boundary`.
3. `extract_dependency_window`.
4. `plan_scenario_probe`.
5. `generate_boundary_fixture`.
6. `generate_scenario_patch_hints`.
7. Optionally use `set_breakpoint_on_text`, `get_call_frames`, or `evaluate_on_call_frame` for paused evidence.
8. `select_compare_anchor`.
9. `export_compare_anchor_report` with `format='json'` and `format='markdown'`.

## Phase 21: Patch Preflight Integration

Phase 21 adds a patch-preflight layer that decides where the first patch attempt should focus before entering the generic patch loop. It consumes compare anchors, scenario patch hints, boundary fixtures, dependency windows, probe plans, helper boundaries, replay/scenario evidence, debugger hints, rebuild divergence, and patch history to choose the smallest explainable patchable surface.

New tools:

- `plan_patch_preflight`: selects the current first patch focus and patchable-surface candidates.
- `list_patch_preflights`: lists the latest runtime or task artifact-backed patch preflight result.
- `export_patch_preflight_report`: exports patch preflight JSON or markdown.

Design principles referenced from JSReverser-MCP:

- Observe-first: patch focus is selected from existing reverse/rebuild evidence.
- Hook-preferred: replay, scenario, boundary, window, fixture, and compare-anchor evidence outrank debugger-only hints.
- Breakpoint-last: debugger inspection can refine the focus but should not become the only truth source.
- Evidence-first: task runs can write `patch-preflight/latest` and `runtime-evidence` entries.
- Rebuild-oriented: preflight output is shaped for future patch workflow and rebuild integration.
- First explainable divergence first: prefer compare-anchor, fixture-input, request-validation, or helper-window before broad env-shim patching.

Current boundaries:

- Patch preflight is a patch-before-planning layer, not a patch engine.
- It does not apply patches, synthesize AST patches, or manage a patch search tree.
- It does not implement rebuild integration in this phase.
- It does not add full AST/data-flow/SSA/taint analysis.

Recommended Phase 21 validation flow:

1. `run_capture_recipe`.
2. `extract_helper_boundary`.
3. `extract_dependency_window`.
4. `plan_scenario_probe`.
5. `generate_boundary_fixture`.
6. `generate_scenario_patch_hints`.
7. `select_compare_anchor`.
8. `plan_patch_preflight`.
9. `export_patch_preflight_report` with `format='json'` and `format='markdown'`.

## Phase 22: Rebuild Integration

Phase 22 connects reverse artifacts to rebuild as formal inputs. It resolves boundary fixtures, dependency windows, compare anchors, patch preflight, scenario patch hints, and debugger enhancer evidence into a `RebuildContext`, then runs the rebuild workflow with context provenance attached.

New tools:

- `prepare_rebuild_context`: resolves the current reverse evidence into rebuild-ready context.
- `list_rebuild_contexts`: lists the latest runtime or task artifact-backed rebuild context.
- `run_rebuild_from_context`: resolves context and runs the context-aware rebuild workflow.
- `export_rebuild_context_report`: exports rebuild context JSON or markdown.

Design principles referenced from JSReverser-MCP:

- Observe-first
- Hook-preferred
- Breakpoint-last
- Evidence-first
- Rebuild-oriented
- First explainable divergence first

Current boundaries:

- Rebuild integration is the reverse-to-rebuild input layer.
- It is not browser-perfect emulation.
- It is not an automatic bundle slicing compiler.
- It is not patch workflow integration; patch execution still stays in the existing patch tools.
- Debugger evidence is an enhancer, not the sole truth source.

Recommended Phase 22 validation flow:

1. `generate_boundary_fixture`.
2. `select_compare_anchor`.
3. `plan_patch_preflight`.
4. `prepare_rebuild_context`.
5. `run_rebuild_from_context`.
6. `export_rebuild_context_report` with `format='json'` and `format='markdown'`.

## Phase 23: Flow Reasoning Lite

Phase 23 adds a lightweight, target-chain-first flow reasoning layer. It builds a bounded AST index over the current top-priority collected files and fuses helper boundary, dependency window, compare anchor, patch preflight, rebuild context, scenario/capture, and debugger enhancer evidence to explain helper return consumers, request field binders, and sink-adjacent bindings.

New tools:

- `analyze_flow_reasoning`: produces a bounded flow reasoning result for the current target chain.
- `trace_helper_consumers`: focuses the reasoning result on where a helper return flows next.
- `trace_request_field_binding`: focuses the reasoning result on sign/token/auth/challenge-like field binding.
- `list_flow_reasoning_results`: reads the latest runtime or task artifact-backed flow reasoning result.
- `export_flow_reasoning_report`: exports flow reasoning JSON or markdown.

Design principles referenced from JSReverser-MCP:

- Observe-first
- Hook-preferred
- Breakpoint-last
- Evidence-first
- Rebuild-oriented
- Target-chain-first
- Smallest useful reasoning first

Current boundaries:

- This is a lightweight flow reasoning layer.
- It is not a full AST/data-flow/SSA/taint engine.
- It is not a full-project callgraph platform.
- It is not a site adapter.
- Debugger state is enhancer evidence only; hook/replay/boundary evidence remains primary.
- Reasoning output is intended to feed helper boundary, dependency window, compare anchor, patch preflight, and rebuild context as supplemental evidence without rewriting their main flows.

Recommended Phase 23 validation flow:

1. `extract_helper_boundary`.
2. `extract_dependency_window`.
3. `select_compare_anchor`.
4. `plan_patch_preflight`.
5. `prepare_rebuild_context`.
6. `analyze_flow_reasoning`.
7. `trace_helper_consumers`.
8. `trace_request_field_binding`.
9. `export_flow_reasoning_report` with `format='json'` and `format='markdown'`.

## Phase 24: Pure Preflight Integration

Phase 24 adds a reverse-to-pure preflight layer. It resolves boundary fixture, compare anchor, patch preflight, rebuild context, flow reasoning, dependency window, and helper boundary evidence into a `PurePreflightContext`, then lets PureExtraction run with explicit provenance for expected outputs, preserved inputs, and excluded runtime noise.

New tools:

- `plan_pure_preflight`: resolves current reverse/rebuild/flow artifacts into pure-ready context.
- `list_pure_preflights`: reads the latest runtime or task artifact-backed pure preflight context.
- `run_pure_from_preflight`: resolves pure preflight, then runs preflight-aware PureExtraction.
- `export_pure_preflight_report`: exports pure preflight JSON or markdown.

Design principles referenced from JSReverser-MCP:

- Observe-first
- Hook-preferred
- Breakpoint-last
- Evidence-first
- Rebuild-oriented
- Boundary-before-rewrite
- First explainable divergence first

Current boundaries:

- Pure preflight is the reverse-to-pure input layer.
- It is not automatic pure implementation synthesis.
- It is not a new AST/data-flow/SSA/taint platform.
- It is not AI augmentation.
- Flow reasoning is enhancer evidence, not the sole truth source.
- Debugger state is enhancer evidence only; hooks/replay/scenario/boundary/window remain primary.

Recommended Phase 24 validation flow:

1. `generate_boundary_fixture`.
2. `select_compare_anchor`.
3. `plan_patch_preflight`.
4. `prepare_rebuild_context`.
5. `analyze_flow_reasoning`.
6. `plan_pure_preflight`.
7. `run_pure_from_preflight`.
8. `export_pure_preflight_report` with `format='json'` and `format='markdown'`.

## Phase 25: AI Augmentation

Phase 25 adds an optional AI semantic explanation layer over deterministic reverse, rebuild, flow, compare, patch, and pure artifacts. AI output is stored and reported as augmentation only; compare anchors, patch preflight, rebuild divergence, and pure ready-for-port decisions still come from deterministic evidence.

New tools:

- `explain_reverse_context_with_ai`: generates an AI or deterministic fallback explanation for a selected artifact mode.
- `list_ai_augmentations`: reads the latest runtime or task artifact-backed AI augmentation.
- `export_ai_augmentation_report`: exports AI augmentation JSON or markdown.

Provider configuration:

- `AI_PROVIDER`
- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `AI_TIMEOUT_MS`

Design principles referenced from JSReverser-MCP:

- Observe-first
- Hook-preferred
- Breakpoint-last
- Evidence-first
- Rebuild-oriented
- AI as semantic enhancer, not truth source

Current boundaries:

- AI augmentation is an explanation and semantic-readability layer.
- It is not a truth engine.
- It is not AI auto patching.
- It is not automatic pure synthesis.
- It is not agentic orchestration.
- Provider unavailable mode is stable; deterministic reverse/rebuild/patch/pure workflows continue without AI.

Recommended Phase 25 validation flow:

1. `analyze_flow_reasoning`.
2. `select_compare_anchor`.
3. `plan_patch_preflight`.
4. `prepare_rebuild_context`.
5. `plan_pure_preflight`.
6. `explain_reverse_context_with_ai`.
7. `export_ai_augmentation_report` with `format='json'` and `format='markdown'`.

## Phase 26: Delivery / Regression Consumption

Phase 26 makes regression and delivery consume the reverse-to-rebuild-to-pure provenance produced in Phases 20-25. It adds lightweight `RegressionContext` and `DeliveryContext` artifacts so delivery handoff can explain which compare anchor, patch preflight, rebuild context, pure preflight, flow reasoning, and optional AI augmentation were consumed. Deterministic gates, matched baseline, and ready-for-delivery decisions remain the truth path.

New tools:

- `prepare_regression_context`: resolves compare anchor, patch preflight, rebuild context, pure preflight, flow reasoning, baseline, and latest regression into regression provenance.
- `export_regression_context_report`: exports the regression context as JSON or markdown.
- `prepare_delivery_context`: assembles delivery handoff context from regression context, reverse provenance, pure/rebuild context, and optional AI augmentation.
- `export_delivery_context_report`: exports delivery handoff provenance as JSON or markdown.
- `run_delivery_from_context`: resolves delivery context, then runs context-aware delivery workflow while preserving deterministic gate behavior.

Design principles referenced from JSReverser-MCP:

- Observe-first
- Hook-preferred
- Breakpoint-last
- Evidence-first
- Rebuild-oriented
- First explainable divergence first
- AI as semantic enhancer, not truth source

Current boundaries:

- Delivery/regression consumption is a provenance consumption layer.
- It is not a CI platform.
- It is not npm/PyPI publishing automation.
- It is not a release orchestration system.
- It is not an AI truth engine.
- AI augmentation can improve handoff readability, but cannot decide matchedBaseline, readyForDelivery, or stage gates.

Recommended Phase 26 validation flow:

1. `select_compare_anchor`.
2. `plan_patch_preflight`.
3. `prepare_rebuild_context`.
4. `plan_pure_preflight`.
5. `explain_reverse_context_with_ai`.
6. `prepare_regression_context`.
7. `prepare_delivery_context`.
8. `run_delivery_from_context`.
9. `export_regression_context_report` with `format='json'` and `format='markdown'`.
10. `export_delivery_context_report` with `format='json'` and `format='markdown'`.

## Phase 27: Browser Field Operations Pack

Phase 27 adds a browser field operations layer for selected-page work before heavier reverse workflows. It provides bounded DOM interaction, screenshots, console observation, preload injection, storage/session-state control, and minimal preset-based stealth/User-Agent helpers while keeping `BrowserSessionManager` as the only browser/page owner.

New tools:

- `query_dom`
- `click_element`
- `type_text`
- `wait_for_element`
- `take_screenshot`
- `list_console_messages`
- `get_console_message`
- `inject_preload_script`
- `get_storage`
- `save_session_state`
- `restore_session_state`
- `dump_session_state`
- `load_session_state`
- `delete_session_state`
- `list_session_states`
- `inject_stealth`
- `list_stealth_presets`
- `list_stealth_features`
- `set_user_agent`
- `export_browser_ops_report`

Design principles referenced from JSReverser-MCP:

- Observe-first
- Hook-preferred
- Breakpoint-last
- Evidence-first
- Target-chain-first
- Field-operations-first before heavy workflow escalation

Current boundaries:

- This is a browser field operations layer.
- It is not a site automation platform.
- It is not a full anti-detection platform.
- It is not a second browser manager.
- It is not a session or browser VM restore platform.
- Session state is bounded to cookies, localStorage, and sessionStorage.

Recommended Phase 27 validation flow:

1. `list_pages`.
2. `select_page`.
3. `query_dom`.
4. `click_element`.
5. `type_text`.
6. `wait_for_element`.
7. `take_screenshot`.
8. `list_console_messages`.
9. `inject_preload_script`.
10. `get_storage`.
11. `save_session_state`.
12. `restore_session_state`.
13. `inject_stealth`.
14. `set_user_agent`.
15. `export_browser_ops_report` with `format='json'` and `format='markdown'`.

## Phase 28: Script Intelligence & Source Precision Pack

Phase 28 adds a live script/source precision layer for the currently selected page. It complements the collected-code analysis path with script-first source inspection: enumerate loaded scripts, read bounded source excerpts by `scriptId`, search exactly inside one live script, search across live scripts, and export source precision artifacts that debugger and flow reasoning workflows can consume.

New tools:

- `list_scripts`
- `get_script_source`
- `find_in_script`
- `search_in_sources`
- `export_source_precision_report`

Design principles referenced from JSReverser-MCP:

- Observe-first
- Hook-preferred
- Breakpoint-last
- Evidence-first
- Target-chain-first
- Script-first precision before broad code collection fallback

Current boundaries:

- This is a source precision layer over selected-page live scripts.
- It is not a source map platform.
- It is not a worker or service worker source ecosystem.
- It is not a full dependency graph.
- It is not a full AST/data-flow/SSA/taint engine.
- It is not a site adapter, function scalpel pack, debugger finishing pack, or second browser manager.
- `collect_code`, `get_collected_code_file`, and `search_collected_code` remain the collected-code analysis path; Phase 28 uses live `Debugger.getScriptSource` content first.

Recommended Phase 28 validation flow:

1. `list_pages`.
2. `select_page`.
3. `list_scripts`.
4. `search_in_sources`.
5. `find_in_script`.
6. `get_script_source`.
7. `set_breakpoint_on_text`.
8. Reproduce the target action.
9. `get_call_frames`.
10. `export_source_precision_report` with `format='json'` and `format='markdown'`.

## Phase 29: Debugger Finishing Pack

Phase 29 completes the current debugger layer with high-reliability reverse-debugging helpers. It adds exception breakpoint modes, bounded watch expressions, debuggable target listing, basic worker/page target selection, and debugger finishing reports while keeping debugger use as a precise fallback after hooks, replay, scenario, boundary, and source precision evidence.

New tools:

- `set_exception_breakpoints`
- `get_exception_breakpoints`
- `clear_exception_breakpoints`
- `add_watch_expression`
- `list_watch_expressions`
- `remove_watch_expression`
- `evaluate_watch_expressions`
- `list_debug_targets`
- `select_debug_target`
- `export_debugger_finishing_report`

Design principles referenced from JSReverser-MCP:

- Observe-first
- Hook-preferred
- Breakpoint-last
- Evidence-first
- Target-chain-first
- Debugger as precise fallback, not default entry

Current boundaries:

- This is a debugger finishing layer.
- It is not a full DevTools frontend.
- It is not a full conditional breakpoint manager.
- It is not a full timeline/profiler platform.
- It is not a full worker/service-worker debugger platform.
- It is not a full target graph visualizer.
- It is not a second browser manager or global runtime singleton.
- `select_debug_target` changes only debugger attachment and does not change the BrowserSessionManager selected page.

Recommended Phase 29 validation flow:

1. `list_scripts`.
2. `find_in_script`.
3. `set_breakpoint_on_text`.
4. `set_exception_breakpoints`.
5. `add_watch_expression`.
6. `pause`.
7. `get_paused_info`.
8. `get_call_frames`.
9. `evaluate_watch_expressions`.
10. `list_debug_targets`.
11. `select_debug_target`.
12. `export_debugger_finishing_report` with `format='json'` and `format='markdown'`.

## Phase 30: Function Scalpel Pack

Phase 30 adds a lightweight function-level scalpel layer for the currently selected page. It gives operators a fast path to hook one function, trace calls, inspect a runtime object, monitor DOM/window events, and export bounded artifacts without replacing the structured scenario/capture/boundary/probe workflow.

New tools:

- `hook_function`
- `trace_function`
- `inspect_object`
- `monitor_events`
- `list_function_hooks`
- `unhook_function`
- `list_function_traces`
- `clear_function_traces`
- `list_monitored_events`
- `clear_monitored_events`
- `export_function_scalpel_report`

Design principles referenced from JSReverser-MCP:

- Observe-first
- Hook-preferred
- Breakpoint-last
- Evidence-first
- Target-chain-first
- Function-scalpel-first before broad workflow escalation

Current boundaries:

- This is a function-level scalpel layer for selected-page runtime probes.
- It is not a full instrumentation platform.
- It is not a full trace profiler.
- It is not a full event recorder.
- It is not a site automation platform.
- It is not AST patch synthesis, a site adapter, a second browser manager, or a global runtime singleton.
- `create_hook` / `inject_hook`, scenario/capture, source precision, and debugger finishing remain separate structured paths; Phase 30 is a quicker micro-operation path.

Recommended Phase 30 validation flow:

1. `list_scripts`.
2. `search_in_sources`.
3. `find_in_script`.
4. `hook_function`.
5. `trace_function`.
6. `inspect_object`.
7. `monitor_events`.
8. Reproduce the target action.
9. `list_function_traces`.
10. `list_monitored_events`.
11. `unhook_function`.
12. `export_function_scalpel_report` with `format='json'` and `format='markdown'`.

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
- `list_scripts`
- `get_script_source`
- `find_in_script`
- `search_in_sources`
- `export_source_precision_report`
- `hook_function`
- `trace_function`
- `inspect_object`
- `monitor_events`
- `list_function_hooks`
- `unhook_function`
- `list_function_traces`
- `clear_function_traces`
- `list_monitored_events`
- `clear_monitored_events`
- `export_function_scalpel_report`
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
- `summarize_code`
- `understand_code`
- `detect_crypto`
- `risk_panel`
- `export_session_report`
- `deobfuscate_code`
- `correlate_request_flows`
- `list_scenario_presets`
- `run_scenario_recipe`
- `analyze_signature_chain`
- `trace_token_family`
- `locate_request_sink`
- `locate_crypto_helpers`
- `export_scenario_report`
- `list_capture_presets`
- `run_capture_recipe`
- `replay_target_action`
- `extract_helper_boundary`
- `list_helper_boundaries`
- `export_capture_report`
- `extract_dependency_window`
- `list_dependency_windows`
- `plan_scenario_probe`
- `list_scenario_probe_plans`
- `export_window_report`
- `export_probe_plan_report`
- `generate_boundary_fixture`
- `list_boundary_fixtures`
- `generate_scenario_patch_hints`
- `list_scenario_patch_hints`
- `export_boundary_fixture_report`
- `export_scenario_patch_hint_report`
- `set_breakpoint`
- `set_breakpoint_on_text`
- `list_breakpoints`
- `remove_breakpoint`
- `pause`
- `resume`
- `get_paused_info`
- `step_over`
- `step_into`
- `step_out`
- `get_call_frames`
- `get_scope_variables`
- `evaluate_on_call_frame`
- `export_debugger_report`
- `set_exception_breakpoints`
- `get_exception_breakpoints`
- `clear_exception_breakpoints`
- `add_watch_expression`
- `list_watch_expressions`
- `remove_watch_expression`
- `evaluate_watch_expressions`
- `list_debug_targets`
- `select_debug_target`
- `export_debugger_finishing_report`
- `select_compare_anchor`
- `list_compare_anchors`
- `export_compare_anchor_report`
- `plan_patch_preflight`
- `list_patch_preflights`
- `export_patch_preflight_report`
- `prepare_rebuild_context`
- `list_rebuild_contexts`
- `run_rebuild_from_context`
- `export_rebuild_context_report`
- `analyze_flow_reasoning`
- `trace_helper_consumers`
- `trace_request_field_binding`
- `list_flow_reasoning_results`
- `export_flow_reasoning_report`
- `plan_pure_preflight`
- `list_pure_preflights`
- `run_pure_from_preflight`
- `export_pure_preflight_report`
- `explain_reverse_context_with_ai`
- `list_ai_augmentations`
- `export_ai_augmentation_report`
- `prepare_regression_context`
- `export_regression_context_report`
- `prepare_delivery_context`
- `export_delivery_context_report`
- `run_delivery_from_context`
- `query_dom`
- `click_element`
- `type_text`
- `wait_for_element`
- `take_screenshot`
- `list_console_messages`
- `get_console_message`
- `inject_preload_script`
- `get_storage`
- `save_session_state`
- `restore_session_state`
- `dump_session_state`
- `load_session_state`
- `delete_session_state`
- `list_session_states`
- `inject_stealth`
- `list_stealth_presets`
- `list_stealth_features`
- `set_user_agent`
- `export_browser_ops_report`
- `export_reverse_report`
- `export_rebuild_bundle`
- `run_rebuild_probe`
- `compare_rebuild_result`
- `diff_env_requirements`
- `save_pure_fixture`
- `run_rebuild_workflow`
- `export_rebuild_report`
- `plan_patch`
- `list_patch_history`
- `apply_patch`
- `run_patch_iteration`
- `mark_acceptance`
- `stabilize_fixture`
- `export_patch_report`
- `freeze_runtime_sample`
- `export_runtime_trace`
- `define_pure_boundary`
- `build_pure_fixture`
- `extract_node_pure`
- `verify_node_pure`
- `run_pure_workflow`
- `export_pure_report`
- `extract_python_pure`
- `verify_python_pure`
- `diff_cross_language`
- `run_port_workflow`
- `export_port_report`
- `analyze_upgrade_diff`
- `get_task_manifest`
- `evaluate_stage_gate`
- `register_regression_baseline`
- `list_regression_baselines`
- `run_regression_baseline`
- `export_sdk_package`
- `export_task_state_report`
- `export_regression_report`
- `run_delivery_workflow`
- `register_intermediate_baseline`
- `list_intermediate_baselines`
- `run_intermediate_regression`
- `register_upgrade_baseline`
- `run_upgrade_workflow`
- `export_upgrade_report`
- `export_delivery_bundle`
- `smoke_test_delivery_bundle`
- `export_delivery_report`
- `analyze_target`

## Still Not Implemented

The current stage still does not implement:

- full DevTools-style debugger workflows
- source map platform
- worker / service worker source ecosystem
- full conditional breakpoint manager, full worker/service-worker debugger platform, and full multi-target graph orchestration
- full instrumentation platform, full trace profiler, full event recorder, and site automation platform
- full diff engine and semantic full-response diff platform
- patch workflow consuming rebuild context and patch preflight context
- browser-perfect rebuild emulation and automatic bundle slicing compiler
- automatic patch apply strategy tree and AST patch synthesis
- full multi-provider AI platform
- AI-driven truth or auto-patching engine
- complete VM-level deobfuscation
- full response-body capture platform
- worker hook ecosystems
- full AST taint / callgraph / SSA framework
- deep WebSocket protocol analysis
- absolute request-chain truth graph
- auto replay
- full browser/DOM rebuild emulation
- complete external-language port/transpiler
- service-side verification
- AI automatic patching
- bulk automatic environment repair
- completed automatic pure implementation
- completed Python or other host-language implementation
- npm / PyPI automatic publishing
- CI platform integration
- complex multi-package SDK generation
- global runtime singleton patterns
