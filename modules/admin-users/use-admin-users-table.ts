"use client"

import { useTableController } from "@/lib/demo/use-table-controller"

import { ROLE_OPTIONS, useAdminUsersFilters } from "./filters"

export function useAdminUsersTable() {
  const { filters, setFilters, reset } = useAdminUsersFilters()

  const controller = useTableController({
    resource: "users",
    categories: ROLE_OPTIONS,
    categoryKey: "role",
    category: filters.role ?? "",
    filters,
    setFilters: setFilters as (v: Record<string, unknown>) => void,
    reset,
  })

  return { ...controller, filters, roleOptions: ROLE_OPTIONS }
}
