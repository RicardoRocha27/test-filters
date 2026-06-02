"use client"

import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"

import { fakeList, type ListParams } from "./fake-api"
import { useDebounce } from "./use-debounce"

type CommonFilters = {
  page: number
  size: number
  search: string
  orderBy: string
}

/**
 * Turns a module's filter state into a React Query result + ready-made handlers.
 * `filters` is the query key. We debounce only the value that feeds the query
 * (search) — never the URL write, which nuqs already batches.
 *
 * Layer 2 validation lives here: `page` is shape-valid (Layer 1 guarantees a
 * positive int) but might exceed the real page count, which we only learn from
 * the response `total`. Once data lands, we clamp `page` to the last page.
 */
export function useTableController(args: {
  resource: string
  scopeId?: string | null
  categories: string[]
  filters: CommonFilters
  setFilters: (v: Record<string, unknown>) => void
  reset: () => void
  /** Single-select category filter (status / metric). */
  categoryKey?: string
  category?: string
  /** Multi-select category filter (roles[]). */
  multi?: { key: string; values: string[] }
}) {
  const {
    resource,
    scopeId,
    categories,
    categoryKey,
    category,
    multi,
    filters,
    setFilters,
    reset,
  } = args

  const debouncedSearch = useDebounce(filters.search, 300)

  const params: ListParams = {
    page: filters.page,
    size: filters.size,
    orderBy: filters.orderBy,
    search: debouncedSearch,
    category: category || undefined,
    categoryIn: multi?.values.length ? multi.values : undefined,
  }

  const { data, isFetching } = useQuery({
    queryKey: [resource, scopeId ?? null, params],
    queryFn: () => fakeList({ resource, scopeId, categories, params }),
  })

  const total = data?.total ?? 0
  const maxPage = Math.max(1, Math.ceil(total / filters.size))

  // Layer 2: reconcile an out-of-range page (e.g. ?page=999) once we know the
  // real total. Guard on `data` so we only clamp against a settled response for
  // the current query, never against the empty initial state.
  useEffect(() => {
    if (data && filters.page > maxPage) {
      setFilters({ page: maxPage })
    }
  }, [data, maxPage, filters.page, setFilters])

  return {
    rows: data?.items ?? [],
    total,
    maxPage,
    isFetching,
    page: filters.page,
    size: filters.size,
    search: filters.search,
    orderBy: filters.orderBy,
    category: category ?? "",
    // Changing a filter resets pagination (page: null -> default 1).
    onSearch: (v: string) => setFilters({ search: v || null, page: null }),
    onOrderBy: (v: string) => setFilters({ orderBy: v || null, page: null }),
    onCategory: (v: string) =>
      categoryKey && setFilters({ [categoryKey]: v || null, page: null }),
    // Toggle a value in the multi-select array; empty -> null (clearOnDefault drops it).
    onToggleMulti: (v: string) => {
      if (!multi) return
      const next = multi.values.includes(v)
        ? multi.values.filter((x) => x !== v)
        : [...multi.values, v]
      setFilters({ [multi.key]: next.length ? next : null, page: null })
    },
    onPrev: () => setFilters({ page: Math.max(1, filters.page - 1) }),
    onNext: () => setFilters({ page: filters.page + 1 }),
    reset,
  }
}
