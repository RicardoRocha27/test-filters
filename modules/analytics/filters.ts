import { useParams } from "next/navigation"
import { parseAsStringEnum } from "nuqs"

import { createModuleFilters, dateRange, FILTER_PREFIXES, tableFilters } from "@/lib/filters"

export const METRIC_OPTIONS = ["latency", "tokens", "cost"]

// One shared filter shape, reused by two modules — same parsers, ZERO shared
// state, isolated URLs (different prefixes) and different reset scopes.
const analyticsParsers = {
  ...tableFilters,
  ...dateRange,
  metric: parseAsStringEnum(METRIC_OPTIONS),
}

const agent = createModuleFilters({
  prefix: FILTER_PREFIXES.agentAnalytics,
  persist: "session",
  parsers: analyticsParsers,
})

const workflow = createModuleFilters({
  prefix: FILTER_PREFIXES.workflowAnalytics,
  persist: "session",
  parsers: analyticsParsers,
})

/**
 * Entity-scoped to the agent id in the route — rescopes when `[id]` changes.
 * `id ?? null` => if params are still resolving, pass `null` ("scoped, pending")
 * rather than `undefined` ("unscoped"), so a flicker can't trigger a stray reset.
 */
export function useAgentAnalyticsFilters() {
  const { id } = useParams<{ id: string }>()
  return agent.useFilters({ scopeId: id ?? null })
}

/** Same shape, scoped to the workflow id — fully isolated from agent analytics. */
export function useWorkflowAnalyticsFilters() {
  const { id } = useParams<{ id: string }>()
  return workflow.useFilters({ scopeId: id ?? null })
}
