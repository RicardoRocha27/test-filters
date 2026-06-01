"use client"

import { useTableController } from "@/lib/demo/use-table-controller"

import { STATUS_OPTIONS, useOpenCasesFilters } from "./filters"

export function useOpenCasesTable() {
  const { filters, setFilters, reset } = useOpenCasesFilters()

  const controller = useTableController({
    resource: "open-cases",
    categories: STATUS_OPTIONS,
    categoryKey: "status",
    category: filters.status ?? "",
    filters,
    setFilters: setFilters as (v: Record<string, unknown>) => void,
    reset,
  })

  return { ...controller, filters, statusOptions: STATUS_OPTIONS }
}
