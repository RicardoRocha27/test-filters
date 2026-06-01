import { parseAsStringEnum } from "nuqs"

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
    // Invalid values (`role=wizard`) parse to null => treated as "all".
    role: parseAsStringEnum(ROLE_OPTIONS),
  },
})

/** Top-level page (`platform/admin/users`) — no entity scope. */
export const useAdminUsersFilters = () => base.useFilters()
