"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { ModuleView } from "@/components/demo/module-view"
import { useAgentAnalyticsTable } from "@/modules/analytics/use-analytics-table"

export default function AgentAnalyticsPage() {
  const { id } = useParams<{ id: string }>()
  const t = useAgentAnalyticsTable(id)

  return (
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
            Set filters, open a case, then use the in-app back link — the session
            snapshot restores them even though the child URL carries no params.
          </p>
          <Link
            href={`/platform/agents/${id}/analytics/cases/case-1`}
            className="text-primary underline"
          >
            Open case detail (child page) →
          </Link>
        </div>
      }
    />
  )
}
