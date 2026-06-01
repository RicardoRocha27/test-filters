"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { Row } from "@/lib/demo/fake-api"

type Option = { value: string; label: string }

export type ModuleViewProps = {
  title: string
  /** Where this module's state resets — shown so the scope mechanism is visible. */
  scope?: { label: string; value: string } | null
  /** The live filters object (rendered as JSON so URL <-> state is observable). */
  filters: Record<string, unknown>
  search: string
  onSearch: (v: string) => void
  orderBy: string
  orderByOptions: Option[]
  onOrderBy: (v: string) => void
  /** Optional module-specific filter (role / status / metric). */
  category?: { label: string; value: string; options: Option[]; onChange: (v: string) => void }
  page: number
  total: number
  size: number
  onPrev: () => void
  onNext: () => void
  isFetching: boolean
  rows: Row[]
  onClear: () => void
  /** Child links, scope switchers, etc. */
  footer?: ReactNode
}

export function ModuleView(props: ModuleViewProps) {
  const {
    title, scope, filters, search, onSearch, orderBy, orderByOptions, onOrderBy,
    category, page, total, size, onPrev, onNext, isFetching, rows, onClear, footer,
  } = props

  const maxPage = Math.max(1, Math.ceil(total / size))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">{title}</h1>
        {scope && (
          <span className="rounded bg-muted px-2 py-0.5 text-xs">
            {scope.label}: <b>{scope.value}</b>
          </span>
        )}
        {isFetching && <span className="text-xs text-muted-foreground">fetching…</span>}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Search
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="filter by name"
            className="rounded border bg-background p-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Order by
          <select
            value={orderBy}
            onChange={(e) => onOrderBy(e.target.value)}
            className="rounded border bg-background p-2"
          >
            <option value="">—</option>
            {orderByOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        {category && (
          <label className="flex flex-col gap-1 text-sm">
            {category.label}
            <select
              value={category.value}
              onChange={(e) => category.onChange(e.target.value)}
              className="rounded border bg-background p-2"
            >
              <option value="">all</option>
              {category.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        )}

        <Button variant="outline" onClick={onClear}>Clear filters</Button>
      </div>

      <div className="rounded border p-3">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">
          Live filters (mirrors the URL)
        </p>
        <pre className="text-xs">{JSON.stringify(filters, null, 2)}</pre>
      </div>

      <div className="rounded border">
        <div className="grid grid-cols-[1fr_8rem_12rem] gap-2 border-b p-2 text-xs font-semibold">
          <span>Name</span><span>Category</span><span>Created</span>
        </div>
        {rows.length === 0 && (
          <div className="p-3 text-sm text-muted-foreground">No results</div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[1fr_8rem_12rem] gap-2 border-b p-2 text-sm last:border-b-0">
            <span>{r.name}</span>
            <span>{r.category}</span>
            <span>{new Date(r.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Button variant="outline" onClick={onPrev} disabled={page <= 1}>Prev</Button>
        <span>Page {page} / {maxPage} · {total} rows</span>
        <Button variant="outline" onClick={onNext} disabled={page >= maxPage}>Next</Button>
      </div>

      {footer && <div className="border-t pt-3">{footer}</div>}
    </div>
  )
}
