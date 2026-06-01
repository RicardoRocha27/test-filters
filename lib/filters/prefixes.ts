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
} as const

export type FilterPrefix = (typeof FILTER_PREFIXES)[keyof typeof FILTER_PREFIXES]
