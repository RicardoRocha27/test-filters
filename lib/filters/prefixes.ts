/**
 * Central registry of every module's URL namespace.
 *
 * Each module passes one of these as its `prefix`, which namespaces every URL key
 * (e.g. `orderBy` -> `agentAnalytics_orderBy`). Keeping them in one place is the
 * guardrail against two modules accidentally sharing the same URL keys.
 */
export const FILTER_PREFIXES = {
  adminUsers: "adminUsers",
  agentAnalytics: "agentAnalytics",
  workflowAnalytics: "workflowAnalytics",
  supOpenCases: "supOpenCases",
  // Shared dimension: one date range read/written by every page in an agent's
  // analytics section (parent + child) — same prefix => shared state.
  analyticsDateRange: "adr",
  // The case-detail child's OWN search — same key name ("search") as the parent
  // table, but a different prefix => fully isolated state.
  caseDetail: "cad",
} as const

export type FilterPrefix = (typeof FILTER_PREFIXES)[keyof typeof FILTER_PREFIXES]
