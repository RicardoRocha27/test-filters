"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { DateRangeBar } from "@/components/demo/date-range-bar"
import { ModuleView } from "@/components/demo/module-view"
import {
  analyticsDate,
  useAnalyticsDateRange,
} from "@/modules/analytics/shared-date-filters"
import { useAgentAnalyticsTable } from "@/modules/analytics/use-analytics-table"

export default function AgentAnalyticsPage() {
  const { id } = useParams<{ id: string }>()
  const t = useAgentAnalyticsTable(id)

  // For link-carry: bake the SHARED date range into the child link so it arrives
  // instantly (no first-frame empty fetch). The page-specific search/sort are NOT
  // carried — serialize only emits this module's `adr_*` keys.
  const { filters: dateFilters } = useAnalyticsDateRange()
  const childHref = analyticsDate.serialize(
    `/platform/agents/${id}/analytics/cases/case-1`,
    dateFilters
  )

  return (
    <div className="flex flex-col gap-4">
      <DateRangeBar />
      <ModuleView
        title="Agent · Analytics"
        scope={{ label: "agent", value: id }}
        filters={t.filters}
        search={t.search}
        onSearch={t.onSearch}
        orderBy={t.orderBy}
        orderByOptions={[
          { value: "name", label: "Name" },
          { value: "createdAt", label: "Created" },
          { value: "category", label: "Metric" },
        ]}
        onOrderBy={t.onOrderBy}
        category={{
          label: "Metric",
          value: t.category,
          options: t.metricOptions.map((m) => ({ value: m, label: m })),
          onChange: t.onCategory,
        }}
        page={t.page}
        size={t.size}
        total={t.total}
        onPrev={t.onPrev}
        onNext={t.onNext}
        isFetching={t.isFetching}
        rows={t.rows}
        onClear={t.reset}
        footer={
          <div className="flex flex-col gap-1 text-sm">
            <p className="text-muted-foreground">
              The date range above is <b>shared</b> — the link carries it to the
              child. The table&apos;s search/sort are page-specific and are NOT carried.
            </p>
            <Link href={childHref} className="text-primary underline">
              Open case detail (carries shared date) →
            </Link>
          </div>
        }
      />
    </div>
  )
}
