"use client"

import { useTableController } from "@/lib/demo/use-table-controller"

import {
  METRIC_OPTIONS,
  useAgentAnalyticsFilters,
  useWorkflowAnalyticsFilters,
} from "./filters"

type FilterResult = {
  filters: { page: number; size: number; search: string; orderBy: string; metric: string | null }
  setFilters: (v: Record<string, unknown>) => void
  reset: () => void
}

function useAnalyticsController(resource: string, scopeId: string, fr: FilterResult) {
  return useTableController({
    resource,
    scopeId,
    categories: METRIC_OPTIONS,
    categoryKey: "metric",
    category: fr.filters.metric ?? "",
    filters: fr.filters,
    setFilters: fr.setFilters,
    reset: fr.reset,
  })
}

export function useAgentAnalyticsTable(scopeId: string) {
  const fr = useAgentAnalyticsFilters()
  const controller = useAnalyticsController("agent-analytics", scopeId, {
    ...fr,
    setFilters: fr.setFilters as (v: Record<string, unknown>) => void,
  })
  return { ...controller, filters: fr.filters, metricOptions: METRIC_OPTIONS }
}

export function useWorkflowAnalyticsTable(scopeId: string) {
  const fr = useWorkflowAnalyticsFilters()
  const controller = useAnalyticsController("workflow-analytics", scopeId, {
    ...fr,
    setFilters: fr.setFilters as (v: Record<string, unknown>) => void,
  })
  return { ...controller, filters: fr.filters, metricOptions: METRIC_OPTIONS }
}
