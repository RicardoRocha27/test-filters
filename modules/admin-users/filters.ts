import { parseAsArrayOf, parseAsStringEnum } from "nuqs"

import {
  createModuleFilters,
  FILTER_PREFIXES,
  tableFilters,
} from "@/lib/filters"

export const ROLE_OPTIONS = ["admin", "editor", "viewer"]

const base = createModuleFilters({
  prefix: FILTER_PREFIXES.adminUsers,
  persist: "session",
  parsers: {
    ...tableFilters,
    // Multi-select. Invalid members (`roles=admin,wizard`) are dropped at parse
    // time => ["admin"]; `?roles=` / all-invalid => [] (Layer 1 for arrays).
    roles: parseAsArrayOf(parseAsStringEnum(ROLE_OPTIONS)).withDefault([]),
  },
})

/** Top-level page (`platform/admin/users`) — no entity scope. */
export const useAdminUsersFilters = () => base.useFilters()
