import type { BattlefieldActionPlan, BattlefieldContext } from './types.js';

export class BattlefieldActionPlanner {
  plan(context: BattlefieldContext): BattlefieldActionPlan {
    const browserOps = context.browserOps;
    const sourcePrecision = context.sourcePrecision;
    const debuggerFinishing = context.debuggerFinishing;
    const functionScalpel = context.functionScalpel;
    const structured = context.structuredWorkflow;

    if (
      !context.selectedPage ||
      !browserOps ||
      !browserOps.storageSnapshotAvailable ||
      !browserOps.preloadActive
    ) {
      return makePlan({
        basedOn: [
          `selected-page:${context.selectedPage ?? 'missing'}`,
          `browser-ops:storage=${browserOps?.storageSnapshotAvailable ?? false}`,
          `browser-ops:preload=${browserOps?.preloadActive ?? false}`
        ],
        nextActions: [
          'Stabilize the selected page, storage, preload, and stealth state before script-level escalation.',
          'Capture a bounded browser-ops snapshot so later workflow stages inherit the live battlefield state.'
        ],
        phase: 'browser-ops',
        recommendedTools: [
          'list_pages',
          'select_page',
          'query_dom',
          'get_storage',
          'list_session_states',
          'list_stealth_runtime_state'
        ],
        stopIf: [
          'selected page is still unset',
          'storage snapshot is still missing',
          'preload / stealth coordination is still unclear'
        ],
        why: 'Browser field state is not stable enough yet; selected-page control should come before source inspection or debugger escalation.'
      });
    }

    if (!sourcePrecision || sourcePrecision.scriptCount === 0 || (!sourcePrecision.lastFindAvailable && !sourcePrecision.lastSearchAvailable)) {
      return makePlan({
        basedOn: [
          `scripts:${sourcePrecision?.scriptCount ?? 0}`,
          `find:${sourcePrecision?.lastFindAvailable ?? false}`,
          `search:${sourcePrecision?.lastSearchAvailable ?? false}`
        ],
        nextActions: [
          'Enumerate live scripts and search them before falling back to broad collected-code inspection.',
          'Read bounded source excerpts around the suspected function or request builder.'
        ],
        phase: 'source-precision',
        recommendedTools: [
          'list_scripts',
          'search_in_sources',
          'find_in_script',
          'get_script_source'
        ],
        stopIf: [
          'script/source still unclear',
          'the target script is still unresolved',
          'bounded source reads still do not isolate the target chain'
        ],
        why: 'Live source precision is still too weak; exact script enumeration and bounded source search should happen before debugger or rebuild work.'
      });
    }

    if (!functionScalpel || (functionScalpel.hookCount === 0 && functionScalpel.traceCount === 0 && functionScalpel.monitorCount === 0)) {
      return makePlan({
        basedOn: [
          `hooks:${functionScalpel?.hookCount ?? 0}`,
          `traces:${functionScalpel?.traceCount ?? 0}`,
          `monitors:${functionScalpel?.monitorCount ?? 0}`
        ],
        nextActions: [
          'Use function/object/event scalpels to confirm the narrow target function or object before escalating into broader structured workflows.',
          'Keep records bounded and tied to the selected page.'
        ],
        phase: 'function-scalpel',
        recommendedTools: [
          'hook_function',
          'trace_function',
          'inspect_object',
          'monitor_events'
        ],
        stopIf: [
          'target function unresolved',
          'runtime object still not inspectable',
          'event / trace evidence is still too noisy'
        ],
        why: 'Source precision exists, but there is no focused function-level runtime evidence yet. Hook-preferred scalpels should narrow the target first.'
      });
    }

    if (
      !debuggerFinishing ||
      ((debuggerFinishing.exceptionMode === undefined || debuggerFinishing.exceptionMode === 'none') && debuggerFinishing.watchCount === 0)
    ) {
      return makePlan({
        basedOn: [
          `exception-mode:${debuggerFinishing?.exceptionMode ?? 'none'}`,
          `watch-count:${debuggerFinishing?.watchCount ?? 0}`,
          `target-count:${debuggerFinishing?.targetCount ?? 0}`
        ],
        nextActions: [
          'Add the smallest useful watch expressions or exception pause mode only after source and function evidence are already narrowed.',
          'Keep debugger work targeted at precise live-state validation.'
        ],
        phase: 'debugger',
        recommendedTools: [
          'set_exception_breakpoints',
          'add_watch_expression',
          'evaluate_watch_expressions',
          'list_debug_targets'
        ],
        stopIf: [
          'precise live-state validation is still unnecessary',
          'breakpoint / watch intent is still unclear',
          'debug target ownership is still ambiguous'
        ],
        why: 'Function-level runtime evidence exists, but debugger finishing helpers are not configured yet for precise paused-state confirmation.'
      });
    }

    if (
      !structured ||
      !structured.helperBoundaryAvailable ||
      !structured.dependencyWindowAvailable ||
      !structured.compareAnchorAvailable
    ) {
      return makePlan({
        basedOn: [
          `scenario:${structured?.scenarioAvailable ?? false}`,
          `capture:${structured?.captureAvailable ?? false}`,
          `helper-boundary:${structured?.helperBoundaryAvailable ?? false}`,
          `dependency-window:${structured?.dependencyWindowAvailable ?? false}`,
          `compare-anchor:${structured?.compareAnchorAvailable ?? false}`
        ],
        nextActions: [
          'Move from battlefield evidence into helper boundary, dependency window, probe planning, and compare anchor narrowing.',
          'Keep structured reverse bounded to the first explainable chain.'
        ],
        phase: 'structured-reverse',
        recommendedTools: [
          'run_scenario_recipe',
          'run_capture_recipe',
          'extract_helper_boundary',
          'extract_dependency_window',
          'plan_scenario_probe',
          'select_compare_anchor'
        ],
        stopIf: [
          'helper boundary still too broad',
          'dependency window still too wide',
          'compare anchor unavailable'
        ],
        why: 'Battlefield evidence exists, but structured reverse artifacts are not complete enough yet to drive deterministic compare or rebuild work.'
      });
    }

    if (!structured.rebuildContextAvailable || !structured.patchPreflightAvailable || !structured.purePreflightAvailable) {
      return makePlan({
        basedOn: [
          `compare-anchor:${structured.compareAnchorAvailable}`,
          `patch-preflight:${structured.patchPreflightAvailable}`,
          `rebuild-context:${structured.rebuildContextAvailable}`,
          `pure-preflight:${structured.purePreflightAvailable}`,
          `flow-reasoning:${structured.flowReasoningAvailable}`
        ],
        nextActions: [
          'Prepare rebuild and pure context from the smallest deterministic reverse artifacts already in hand.',
          'Use compare anchor and patch preflight to keep rebuild/pure scope narrow.'
        ],
        phase: 'rebuild-pure',
        recommendedTools: [
          'plan_patch_preflight',
          'prepare_rebuild_context',
          'analyze_flow_reasoning',
          'plan_pure_preflight',
          'run_rebuild_from_context',
          'run_pure_from_preflight'
        ],
        stopIf: [
          'compare anchor unavailable',
          'rebuild context missing',
          'pure preflight not ready'
        ],
        why: 'Structured reverse artifacts are present, but rebuild/pure provenance is not yet fully assembled.'
      });
    }

    return makePlan({
      basedOn: [
        `regression-context:${structured.regressionContextAvailable ?? false}`,
        `delivery-context:${structured.deliveryContextAvailable ?? false}`,
        `rebuild-context:${structured.rebuildContextAvailable}`,
        `pure-preflight:${structured.purePreflightAvailable}`
      ],
      nextActions: [
        'Close regression and delivery provenance so battlefield lineage is visible in downstream gate and handoff artifacts.',
        'Run deterministic regression and delivery flows only after context preparation.'
      ],
      phase: 'regression-delivery',
      recommendedTools: [
        'prepare_regression_context',
        'prepare_delivery_context',
        'run_delivery_from_context'
      ],
      stopIf: [
        'regression provenance not prepared',
        'delivery provenance not prepared',
        'deterministic regression / delivery gates are still blocked'
      ],
      why: 'Reverse, rebuild, and pure provenance are already assembled; the remaining work is to harden regression and delivery lineage.'
    });
  }
}

function makePlan(input: Omit<BattlefieldActionPlan, 'planId'>): BattlefieldActionPlan {
  return {
    ...input,
    planId: `battlefield-plan-${Date.now().toString(36)}`
  };
}

