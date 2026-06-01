"use client"

import { useParams } from "next/navigation"

import { ModuleView } from "@/components/demo/module-view"
import { useWorkflowAnalyticsTable } from "@/modules/analytics/use-analytics-table"

export default function WorkflowAnalyticsPage() {
  const { id } = useParams<{ id: string }>()
  const t = useWorkflowAnalyticsTable(id)

  return (
    <ModuleView
      title="Workflow · Analytics"
      scope={{ label: "workflow", value: id }}
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
    />
  )
}
