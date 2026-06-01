import { parseAsStringEnum } from "nuqs"

import { createModuleFilters, FILTER_PREFIXES, tableFilters } from "@/lib/filters"

export const STATUS_OPTIONS = ["open", "pending", "escalated"]

const base = createModuleFilters({
  prefix: FILTER_PREFIXES.supOpenCases,
  persist: "session",
  parsers: {
    ...tableFilters,
    status: parseAsStringEnum(STATUS_OPTIONS),
  },
})

/** Supervisor app, top-level page — no entity scope. */
export const useOpenCasesFilters = () => base.useFilters()
