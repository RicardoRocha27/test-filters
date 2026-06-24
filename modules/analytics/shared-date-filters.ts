"use client"

import { useParams } from "next/navigation"

import { createModuleFilters, dateRange, FILTER_PREFIXES } from "@/lib/filters"

/**
 * SHARED dimension: one analytics date range, read/written by every page in an
 * agent's analytics section. Both the parent analytics page and the child case
 * page call this same hook (same `prefix`) → they share state by construction.
 *
 * Scoped to the agent id + `persist: "session"` so it survives navigation through
 * a bare <Link> (the snapshot reseeds it on the destination). `analyticsDate.serialize`
 * is also exported for optional link-carry (instant, no first-frame flash).
 */
export const analyticsDate = createModuleFilters({
  prefix: FILTER_PREFIXES.analyticsDateRange,
  persist: "session",
  parsers: { ...dateRange },
})

export function useAnalyticsDateRange() {
  const { id } = useParams<{ id: string }>()
  return analyticsDate.useFilters({ scopeId: id ?? null })
}
