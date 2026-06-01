"use client"

import { ModuleView } from "@/components/demo/module-view"
import { useOpenCasesTable } from "@/modules/supervisor-cases/use-open-cases-table"

export default function OpenCasesPage() {
  const t = useOpenCasesTable()

  return (
    <ModuleView
      title="Supervisor · Open cases"
      filters={t.filters}
      search={t.search}
      onSearch={t.onSearch}
      orderBy={t.orderBy}
      orderByOptions={[
        { value: "name", label: "Name" },
        { value: "createdAt", label: "Created" },
      ]}
      onOrderBy={t.onOrderBy}
      category={{
        label: "Status",
        value: t.category,
        options: t.statusOptions.map((s) => ({ value: s, label: s })),
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
