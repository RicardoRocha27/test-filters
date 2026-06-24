"use client"

import { useParams } from "next/navigation"
import { parseAsString } from "nuqs"

import { createModuleFilters, FILTER_PREFIXES } from "@/lib/filters"

/**
 * The case-detail child's OWN filters. It has a `search` — the SAME key name as
 * the parent analytics table — but under a different prefix (`cad`), so the two
 * never share state. Scoped to the case id, so each case remembers its own search.
 */
const base = createModuleFilters({
  prefix: FILTER_PREFIXES.caseDetail,
  persist: "session",
  parsers: {
    search: parseAsString.withDefault(""),
  },
})

export function useCaseDetailFilters() {
  const { caseId } = useParams<{ caseId: string }>()
  return base.useFilters({ scopeId: caseId ?? null })
}
