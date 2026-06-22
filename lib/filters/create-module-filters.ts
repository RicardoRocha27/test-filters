"use client"

import { useCallback } from "react"
import {
  createLoader,
  createSerializer,
  useQueryStates,
  type inferParserType,
  type ParserMap,
  type UrlKeys,
  type UseQueryStatesOptions,
} from "nuqs"

import { useFilterSnapshot } from "./use-filter-snapshot"

export type ModuleFiltersConfig<P extends ParserMap> = {
  /** Unique URL namespace. Maps `orderBy` -> `${prefix}_orderBy`. Use FILTER_PREFIXES. */
  prefix: string
  /** Typed nuqs parsers. Defaults live here via `.withDefault()`. */
  parsers: P
  /** "session" enables the entity-scoped sessionStorage seed + write-through. */
  persist?: false | "session"
  /** Passed through to useQueryStates (history, shallow, throttleMs, scroll…). */
  options?: Partial<UseQueryStatesOptions<P>>
}

/**
 * Builds a typed, namespaced filter hook for one module.
 *
 * The returned `useFilters(scopeId?)` is the single source of truth for that
 * module's filters: state lives in the URL, optionally seeded from an
 * entity-scoped session snapshot. Pass the reset boundary (entity id) as
 * `scopeId`; omit it for unscoped/top-level pages.
 *
 * See filters-architecture.md §6.
 */
export function createModuleFilters<P extends ParserMap>(
  config: ModuleFiltersConfig<P>
) {
  const { prefix, parsers, persist = false, options } = config

  // orderBy -> agentAnalytics_orderBy, etc.
  const urlKeys = Object.fromEntries(
    Object.keys(parsers).map((k) => [k, `${prefix}_${k}`])
  ) as UrlKeys<P>

  // Built once per module (module scope) — stable identities for the hooks below.
  const serialize = createSerializer(parsers, { urlKeys })
  const load = createLoader(parsers, { urlKeys })

  type Values = inferParserType<P>

  function useFilters(scopeId?: string | null) {
    const [filters, setFilters] = useQueryStates(parsers, {
      urlKeys,
      ...options,
    })

    useFilterSnapshot({
      enabled: persist === "session",
      prefix,
      scopeId,
      // The actual namespaced URL keys — used to detect a deep link from the
      // real URL, independent of when nuqs parses it into `filters`.
      namespacedKeys: Object.values(urlKeys) as string[],
      filters: filters as Record<string, unknown>,
      setFilters: setFilters as unknown as (v: Record<string, unknown>) => void,
      serialize: serialize as unknown as (v: Record<string, unknown>) => string,
      load: load as unknown as (input: string) => Record<string, unknown>,
    })

    const reset = useCallback(() => {
      // null resets each key to its default; clearOnDefault then empties the URL.
      const cleared = Object.fromEntries(Object.keys(parsers).map((k) => [k, null]))
      setFilters(cleared as Partial<Values>)
      // "Clear forgets": explicitly drop the snapshot so a later bare visit can't
      // resurrect these filters. (The write-through also clears on empty, but doing
      // it here makes the semantics guaranteed, independent of snapshot-hook timing.)
      // Navigating to a bare URL does NOT call this — that path still restores.
      if (persist === "session") {
        try {
          sessionStorage.removeItem(`filters:${prefix}:${scopeId ?? "_"}`)
        } catch {
          // sessionStorage unavailable — degrade silently.
        }
      }
    }, [setFilters, scopeId])

    return { filters: filters as Values, setFilters, reset }
  }

  return { useFilters, urlKeys, parsers, serialize, load }
}
