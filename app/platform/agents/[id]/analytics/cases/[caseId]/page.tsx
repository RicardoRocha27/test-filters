"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { DateRangeBar } from "@/components/demo/date-range-bar"
import {
  analyticsDate,
  useAnalyticsDateRange,
} from "@/modules/analytics/shared-date-filters"
import { useCaseDetailFilters } from "@/modules/case-detail/filters"

/**
 * Child / detail page. Demonstrates the two cross-page behaviours:
 *  - SHARED: the DateRangeBar uses the same `useAnalyticsDateRange` hook as the
 *    parent — so the date range is shared (arrives via the carried link, and is
 *    reseeded from the snapshot on a bare visit / browser back).
 *  - ISOLATED: this page has its OWN `search` (prefix `cad`), a different URL key
 *    from the parent's `agentAnalytics_search` — so the two never share state.
 */
export default function CaseDetailPage() {
  const { id, caseId } = useParams<{ id: string; caseId: string }>()
  const { filters: dateFilters } = useAnalyticsDateRange()
  const { filters, setFilters } = useCaseDetailFilters()

  const backHref = analyticsDate.serialize(
    `/platform/agents/${id}/analytics`,
    dateFilters
  )

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Case detail</h1>
      <p className="text-sm text-muted-foreground">
        agent <b>{id}</b> · case <b>{caseId}</b>
      </p>

      <DateRangeBar />

      <div className="rounded border p-3">
        <label className="flex flex-col gap-1 text-sm">
          Search (this case only — isolated from the parent table)
          <input
            data-testid="case-search"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value || null })}
            placeholder="search this case"
            className="rounded border bg-background p-2"
          />
        </label>
        <pre className="mt-2 text-xs" data-testid="case-filters">
          {JSON.stringify(filters, null, 2)}
        </pre>
      </div>

      <Link href={backHref} className="text-primary underline">
        ← Back to analytics (carries shared date, not this search)
      </Link>
    </div>
  )
}
