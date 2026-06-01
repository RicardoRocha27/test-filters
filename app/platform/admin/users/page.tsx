"use client"

import { ModuleView } from "@/components/demo/module-view"
import { useAdminUsersTable } from "@/modules/admin-users/use-admin-users-table"

export default function AdminUsersPage() {
  const t = useAdminUsersTable()

  return (
    <ModuleView
      title="Admin · Users"
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
        label: "Role",
        value: t.category,
        options: t.roleOptions.map((r) => ({ value: r, label: r })),
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
