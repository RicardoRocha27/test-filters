# Filters Architecture

A clean, scalable architecture for URL-persisted filters across a multi-module,
multi-route app, built on [nuqs](https://nuqs.dev) + React Query.

This document is the design reference. It explains the principles, the contract,
the folder structure, and how every route shape maps onto it.

> **This repo is a verified reference, not a drop-in app.** The part that
> transfers to a real codebase is the core in **`lib/filters/`**
> (`create-module-filters`, `use-filter-snapshot`, `parsers`, `prefixes`).
> Everything under `lib/demo/`, `components/demo/`,
> `components/query-provider.tsx`, and `app/**` is illustrative scaffolding — a fake
> API, a generic table view, and one page per route shape — meant to be read and
> copied, not shipped. `scripts/e2e.mjs` is a Playwright harness worth keeping as a
> testing pattern. See §14 for the incremental migration path.

---

## 1. Goals & context

The app is **highly filter-dependent**. Many modules expose tables, charts, and
lists with their own filters (page, size, search, orderBy, date ranges, status,
and module-specific "advanced" filters). Requirements:

- Filters persist in the **URL** (shareable, bookmarkable, survive reload).
- Filters of **different modules never interfere** with each other.
- Navigating from a parent page into a child/detail page and back **keeps the
  parent's filters**.
- Filters **rescope** when the active entity (agent / workflow / …) changes.
- Adding a new filter or a new module is **cheap and local** — no central file to
  edit, no cross-module coupling.

### Non-goals / explicit decisions

| Decision                | Choice                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| Sort (`orderBy`)        | **Shareable** — lives in the URL like `page`/`search`.             |
| Entity rescoping        | **Yes** — filters reset/reseed when the active entity changes.     |
| Navigational stickiness | **`sessionStorage`** — remembered for the session, not forever.    |
| Data fetching           | **React Query** (client-side). The filter object is the query key. |

---

## 2. Core principle: the URL is the store

The previous approach used a single `FiltersProvider` that merged **four sources
of truth** every render:

```
defaultValues  →  localState (React)  →  localStorageState  →  urlState
```

Everything painful (init races, reset effects, pathname module-detection, a UUID
regex to avoid wiping filters on detail pages) existed only to keep those four in
sync. That is the root cause of the conflicts and rigidity.

**This architecture collapses four sources into one:**

- **URL** = the single live source of truth (via nuqs `useQueryStates`).
- **`sessionStorage`** = a _seed_ on mount + a write-through mirror. Never merged
  live into render.
- **Defaults** = expressed in the parser (`.withDefault(...)`), not a separate object.
- **Local component state** = gone. nuqs _is_ the state.

Two structural rules then eliminate entire categories of bug:

1. **Namespace every module by an explicit `prefix`.** `a_page`, `b_page`,
   `exec_status`. Modules cannot collide because they never share URL keys — even
   when rendered on the same page (e.g. a dashboard with a table + a chart).
   This deletes all pathname-based module detection.

2. **Scope is an explicit function, not a parsed path.** Each module returns its
   own reset boundary (an entity id, a composite key, or nothing). Route depth,
   app segments, and nesting become irrelevant to the core.

---

## 3. Two primitives

Most past complexity came from one primitive trying to be **both** shareable URL
state **and** sticky personal preference, with live merging. Split them:

|            | **Navigational filters**                     | **Personal preferences**                          |
| ---------- | -------------------------------------------- | ------------------------------------------------- |
| Examples   | page, size, search, status, date range, sort | column visibility, density, personal default sort |
| Stored in  | **URL** (nuqs), namespaced                   | **`localStorage`** only — never the URL           |
| Stickiness | **`sessionStorage`** seed (per scope)        | `localStorage` (across sessions/tabs)             |
| Lifetime   | this browsing session                        | forever, across tabs                              |
| Primitive  | `createModuleFilters()`                      | a small `localStorage` hook (not shipped here)    |

- **`createModuleFilters`** → namespaced, typed nuqs hook + optional
  entity-scoped `sessionStorage` seed. **This is the only primitive in this reference.**
- **Personal preferences** are a documented *concept*, not a deliverable: when you
  need them, add a tiny `localStorage`-only hook, deliberately kept out of the URL.
  The split matters mainly as guidance for what does **not** belong in a filter.

Rule of thumb: _"Would I want this in a link I send a teammate?"_ Yes → URL filter.
No → preference.

---

## 4. The unified persistence + scope mechanism

The three product decisions (shareable sort, rescope on entity change,
sessionStorage stickiness) are **one mechanism**: an **entity-scoped session
snapshot** keyed by `filters:{prefix}:{scopeId}`.

- **Stickiness** — write-through to that key on every filter change; seed it back
  into the URL when landing on a _bare_ parent URL (in-app "back", reload).
- **Rescope on entity change** — when `scopeId` changes, the key changes, so you
  load _that entity's_ last view (or empty). No `previousEntityRef` + reset effect.
- **Shareable** — the snapshot only ever _seeds the URL_, never merges live, so the
  URL stays the single source of truth and React Query reads one place.

Rules the factory encapsulates (callers never see them):

| Trigger               | URL has params?               | Action                                           |
| --------------------- | ----------------------------- | ------------------------------------------------ |
| Initial mount         | yes (deep link / back button) | **URL wins** — do nothing                        |
| Initial mount         | no (bare URL)                 | seed from `filters:{prefix}:{scopeId}`           |
| Scope changed         | —                             | replace URL with new scope's snapshot (or clear) |
| User clicks **Clear** | —                             | clear URL **and** delete the snapshot            |

> The last row is the subtle one: if `reset()` does not also delete the snapshot,
> the next mount silently resurrects the filters. The factory handles it.

`clearOnDefault` (nuqs v2 default) keeps default values _out_ of the URL, so
"no filters" == empty query string — which is what makes the "is the URL bare?"
seed check meaningful.

### 4.1 Implementation gotchas (verified the hard way)

Three non-obvious things make or break this in practice — all handled in
`lib/filters/use-filter-snapshot.ts`:

1. **Defer the restore to a microtask.** Calling nuqs's `setFilters` _synchronously_
   inside the mount effect races with nuqs's own initial URL read: the URL updates
   but the hook's returned `filters` silently stays at defaults (URL says `page=2`,
   the table renders page 1). Wrapping the restore in `queueMicrotask(...)` lets
   nuqs finish initializing first, so URL and state stay in sync. This only
   reproduces in `next dev` (React Strict Mode); production masked it.

2. **Guard the write-through against the transient bare state.** While a restore is
   in flight the URL is momentarily empty, and a naive write-through would delete
   the snapshot before the restore lands (Strict Mode double-fires effects, making
   it worse). A `pendingRestore` ref holds the query string we expect once the
   restore applies; until `qs` matches it, the write-through pauses instead of
   clobbering. A one-shot "suppress next write" flag is _not_ enough — Strict Mode
   fires a second write that slips through.

3. **Decide "is the URL bare?" from the real URL, not parsed state.** The
   seed-vs-deep-link decision reads `window.location.search` for the module's
   namespaced keys — never `qs`/`filters`. Deriving it from parsed state couples a
   correctness decision to nuqs's parse _timing_: if a future upgrade deferred
   hydration a tick, `filters` would be defaults at effect time, a deep link would
   read as "bare", and the snapshot would silently overwrite the link you were
   sent — a shareability regression that no test catches until the upgrade. Reading
   the URL removes the coupling entirely.

> Regression coverage: `scripts/e2e.mjs` drives a real browser (Playwright) through
> in-app back, browser back, entity rescope, cross-module isolation, shared vs
> isolated filters, the validation layers, and a **rich multi-namespace deep link
> that must beat primed snapshots** (scenario 13 — the shareability tripwire),
> asserting URL and rendered state always agree. Run it against `next dev` (Strict
> Mode) — that's where these bugs surface.

---

## 5. Folder structure

```
lib/
  filters/
    parsers.ts                 # typed, reusable parser groups (tableFilters, dateRange, …)
    prefixes.ts                # central FILTER_PREFIXES registry (uniqueness guardrail)
    create-module-filters.ts   # the factory: namespaced nuqs hook + scope + session seed
    use-filter-snapshot.ts     # internal: seed-on-mount / rescope / write-through helper
    types.ts                   # shared types (Config, etc.)

modules/
  <module>/
    filters.ts                 # createModuleFilters({ prefix, parsers, persist, scope })
    use-<module>-table.ts      # consumes the filter hook + React Query + columns
    components/                # filter UI, table, chart, …
```

**Colocation rule:** a module's `filters.ts` is the single source of truth for
that module's filter shape. No module imports another module's `filters.ts`.

---

## 6. The factory contract

```ts
// lib/filters/create-module-filters.ts
"use client"
import { useQueryStates, type ParserBuilder, type UseQueryStatesOptions } from "nuqs"

type Config<P> = {
  /** Unique URL namespace. Maps orderBy -> `${prefix}_orderBy`. See FILTER_PREFIXES. */
  prefix: string
  /** Typed nuqs parsers. Defaults live here via `.withDefault()`. */
  parsers: P
  /** "session" = entity-scoped sessionStorage seed + write-through. */
  persist?: false | "session"
  /** Reset boundary. Return an entity id, a composite key, or null/undefined. */
  scope?: () => string | null | undefined
  /** Passed through to useQueryStates (history, shallow, throttleMs, …). */
  options?: Partial<UseQueryStatesOptions>
}

export function createModuleFilters<P extends Record<string, ParserBuilder<any>>>(
  config: Config<P>,
) {
  const urlKeys = Object.fromEntries(
    Object.keys(config.parsers).map((k) => [k, `${config.prefix}_${k}`]),
  )

  function useFilters() {
    const scopeId = config.scope?.() ?? null
    const [filters, setFilters] = useQueryStates(config.parsers, {
      urlKeys,
      ...config.options,
    })

    // seed-on-mount + rescope-on-scope-change + write-through, all encapsulated.
    useFilterSnapshot({
      prefix: config.prefix,
      scopeId,
      filters,
      setFilters,
      keys: Object.keys(config.parsers),
      enabled: config.persist === "session",
    })

    const reset = () => {
      setFilters(
        Object.fromEntries(Object.keys(config.parsers).map((k) => [k, null])),
      )
      clearSnapshot(config.prefix, scopeId) // "Clear means clear"
    }

    return { filters, setFilters, reset }
  }

  return { useFilters, urlKeys, parsers: config.parsers }
}
```

> **Call the same hook wherever you need it.** Many co-mounted components can call
> the same module hook — no "owner" to designate. nuqs syncs every `useQueryStates`
> instance on the same keys, so `filters` is identical across them, and the snapshot
> effect is idempotent (all instances read/write the same snapshot and converge).
> The only cost is a little redundant work. If a page ever has *many* consumers and
> you want to skip the extra writes, hoist the hook and pass values down — but avoid
> an owner/read-only split: forgetting the owner silently disables persistence.

### Reusable parsers

```ts
// lib/filters/parsers.ts
import { parseAsInteger, parseAsString, parseAsIsoDateTime } from "nuqs"

export const tableFilters = {
  page: parseAsInteger.withDefault(1),
  size: parseAsInteger.withDefault(20),   // shareable; movable to preferences later
  search: parseAsString.withDefault(""),
  orderBy: parseAsString.withDefault(""), // shareable, per decision
}

export const dateRange = {
  startDate: parseAsIsoDateTime,
  endDate: parseAsIsoDateTime,
}
```

### Prefix registry (uniqueness guardrail)

```ts
// lib/filters/prefixes.ts
export const FILTER_PREFIXES = {
  adminUsers: "adminUsers",
  agentAnalytics: "agentAnalytics",
  workflowAnalytics: "workflowAnalytics",
  supOpenCases: "supOpenCases",
  executions: "exec",
  // …one entry per module. Importing from here prevents accidental clashes.
} as const
```

---

## 7. Route topology → config

The architecture is **path-agnostic**. Every route level maps onto the two knobs
(`prefix`, `scope`). Nothing reads the pathname.

| Route type        | Example                             | `prefix`            | `scope`                              |
| ----------------- | ----------------------------------- | ------------------- | ------------------------------------ |
| Top-level page    | `platform/admin/users`              | `adminUsers`        | `undefined` (never rescopes)         |
| Entity — agent    | `platform/agents/[id]/analytics`    | `agentAnalytics`    | `() => agentId`                      |
| Entity — workflow | `platform/workflows/[id]/analytics` | `workflowAnalytics` | `() => workflowId`                   |
| Supervisor page   | `supervisor/open-cases`             | `supOpenCases`      | `undefined` (or a supervisor ctx id) |

Notes:

- **Scope can be composite or null.** `() => undefined`, `() => agentId`,
  `() => \`${agentId}:${setId}\`. The factory calls `scope()`during render, so
  it may use`useParams()`/`useEntity()` directly.
- **App level (platform vs supervisor)** only matters if a module is shared across
  apps — then give them distinct prefixes. Otherwise the app segment is irrelevant.
- **Nesting works in your favour.** On `agents/[id]/analytics`, `scope` returns
  `agentId`, which stays constant across that agent's sub-pages — so filters stick
  per agent and rescope only when you switch agents.
- **Scope readiness (`undefined` vs `null`).** The snapshot reads `scopeId` as a
  three-state value: `undefined` = unscoped (top-level page, one stable bucket),
  `null` = scoped but not ready yet, `string` = scoped and ready. Scoped wrappers
  pass `useParams().id ?? null` so that if params are momentarily unresolved (e.g.
  under a `loading.tsx`/parallel-route boundary) the snapshot **waits** instead of
  treating the flicker as a real scope change and clearing filters.

---

## 8. Shared filter shapes across modules

When two modules share a filter shape (e.g. agent-analytics and workflow-analytics),
define the parsers once and instantiate twice — same shape, **zero shared state**,
isolated URLs:

```ts
// modules/analytics/filters.ts
import { createModuleFilters } from "@/lib/filters"
import { tableFilters, dateRange } from "@/lib/filters/parsers"
import { FILTER_PREFIXES } from "@/lib/filters/prefixes"
import { useParams } from "next/navigation"

const analyticsParsers = { ...tableFilters, ...dateRange }

export const { useFilters: useAgentAnalyticsFilters } = createModuleFilters({
  prefix: FILTER_PREFIXES.agentAnalytics,
  parsers: analyticsParsers,
  persist: "session",
  scope: () => useParams().agentId as string,
})

export const { useFilters: useWorkflowAnalyticsFilters } = createModuleFilters({
  prefix: FILTER_PREFIXES.workflowAnalytics,
  parsers: analyticsParsers,
  persist: "session",
  scope: () => useParams().workflowId as string,
})
```

---

## 9. Worked example: an executions table

**Definition** — replaces the old `defaultValues` object + `config` booleans +
the hand-written filter type. All three collapse into one typed source:

```ts
// modules/workflow-executions/filters.ts
import { parseAsArrayOf, parseAsStringEnum } from "nuqs"
import { createModuleFilters } from "@/lib/filters"
import { tableFilters, dateRange } from "@/lib/filters/parsers"
import { FILTER_PREFIXES } from "@/lib/filters/prefixes"
import { useEntity } from "@/modules/agents/hooks/useEntity"
import { WorkflowExecutionStatus } from "./api/workflow-executions.schemas"

export const { useFilters: useExecutionsFilters } = createModuleFilters({
  prefix: FILTER_PREFIXES.executions,
  persist: "session",
  scope: () => useEntity().currentEntity?.id,
  parsers: {
    ...tableFilters,
    ...dateRange,
    status: parseAsArrayOf(
      parseAsStringEnum(Object.values(WorkflowExecutionStatus)),
    ).withDefault([]),
  },
})
```

**Consumer** — `status` is now a real `string[]` (no comma-splitting), and the
table hook _consumes_ the state hook instead of being fused with it:

```ts
// modules/workflow-executions/use-executions-table.ts
const { filters, setFilters, reset } = useExecutionsFilters()
const [search] = useDebounce(filters.search, 300) // debounce the query, not the URL write

const { data } = useGetWorkflowExecutionsQuery({
  queryParams: { ...filters, search }, // `filters` IS the query key
})
```

> Debounce only the value that feeds React Query — never throttle the URL write
> itself (nuqs already batches). The URL stays in sync instantly; the network
> request is what waits.

---

## 10. Child-navigation persistence (parent keeps filters)

Layered, from "free" to "explicit":

1. **Browser back — zero code.** Parent → detail is a `router.push`, so the parent
   URL (with namespaced filters) is in history. Back restores it, and React Query
   serves the cached list under that filter key → instant.
2. **In-app "Back to list" links** (which don't carry params): the `sessionStorage`
   seed restores the last view on a bare parent mount. Covers in-app links,
   reloads, and bookmarks of the bare parent URL — _within the session_.
3. **Deliberate fresh visit** (new tab, next day): starts clean, because it's
   `sessionStorage`, not `localStorage`. This is the "not stuck" behaviour.

No detail-page reset trap: there is no module-change reset to trap, so the old
UUID-regex workaround is unnecessary.

### Sharing vs isolating filter state across pages

Whether a filter is shared or isolated across pages is decided by **which hook a
page calls** — there is no separate mechanism:

- **Shared dimension** (e.g. a global date range across an analytics section):
  the related pages call the **same** module hook (same `prefix`) → they read/write
  the same URL keys. Give it `persist: "session"` + a `scope` spanning the pages,
  and the snapshot reseeds it across a bare `<Link>`. Optional, to avoid a
  first-frame empty fetch: carry it explicitly in the link with the module's
  `serialize(path, filters)` (the two-arg overload amends the target's query) — it
  emits only that module's keys, so nothing page-specific tags along.
- **Isolated, even with the same key name** (e.g. a parent table and a child page
  that both have `search`): give each its **own** hook/`prefix`. `aan_search` and
  `cad_search` are different URL keys, so they never bleed. Switching between
  entities of the *same* module (same hook, different `scope`) is isolated too —
  the rescope loads that entity's snapshot.

**Rule of thumb: same hook = shared, different hook = isolated.** The reference's
`scripts/e2e.mjs` asserts both (scenarios 7 and 8: a date range carried parent→child,
and a same-named `search` that stays independent).

---

## 11. Handling invalid or out-of-range URL values

URLs are user-editable and shareable, so they **will** contain garbage:
`?role=wizard`, `?orderBy=hax`, `?page=-5`, `?page=abc`, or `?page=999` on a
two-page table. The guiding rule:

> **Invalid URL values must never corrupt your state or reach your API.**
> `filters` is always valid, no matter what the URL says.

There are three layers, split by _when_ you can know a value is invalid.

### Layer 1 — Parse-time validation (the value's shape/domain is knowable up front)

Handled by choosing the right **parser**. A failed parse returns `null`, so the
filter falls back to its default (or "absent"). This is the most important layer:
it guarantees `filters` is type-safe regardless of the URL.

| Filter kind | Use | `?x=garbage` becomes |
| ----------- | --- | -------------------- |
| One of a fixed set (role, status, metric) | `parseAsStringEnum(OPTIONS)` | `null` → treated as "all" |
| Sortable column | `parseAsStringLiteral(COLUMNS)` | `null` → no sort |
| Page number | `parseAsPageNumber` (custom: int ≥ 1) | `1` |
| Multi-select | `parseAsArrayOf(parseAsStringEnum(OPTIONS))` | invalid members dropped |
| Number in a range | custom `createParser` that clamps | the clamped value |

```ts
// lib/filters/parsers.ts — a page that is ALWAYS a positive integer
export const parseAsPageNumber = createParser({
  parse: (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 ? n : null },
  serialize: (v) => String(v),
}).withDefault(1)

// modules/admin-users/filters.ts — an enum, not a free string
role: parseAsStringEnum(ROLE_OPTIONS), // ?role=wizard -> null -> "all"
```

Prefer enums/literals over `parseAsString` for any filter with a known domain —
including `orderBy`, which should be `parseAsStringLiteral(sortableColumns)`.

### Layer 2 — Dynamic reconciliation (validity depends on data you fetch)

`?page=999` is shape-valid, but whether it's _out of range_ depends on the
response `total`, which you don't have until the query resolves. So reconcile in
the **table controller**, after data lands:

```ts
const maxPage = Math.max(1, Math.ceil(total / filters.size))
useEffect(() => {
  if (data && filters.page > maxPage) setFilters({ page: maxPage }) // clamp to last page
}, [data, maxPage, filters.page, setFilters])
```

Guard on `data` so you only clamp against a settled response, never against the
empty initial state (which would yank the user to page 1 mid-load). The same
pattern covers other data-dependent cases — a filter referencing a deleted
entity, a date outside an allowed window, etc.: detect after fetch, then `setFilters`
to a valid value.

### Layer 1.5 — Multi-field validation (synchronous, but spans two filters)

Some rules aren't about one value or about server data — they're about two
filters being consistent with each other. The classic case is an **inverted date
range** (`startDate > endDate`), which a hand-edited or pasted URL can produce.
Normalize when building the query (and optionally write back to canonicalize):

```ts
// On read — covers ?startDate=…&endDate=… typed by hand:
const [from, to] =
  startDate && endDate && startDate > endDate ? [endDate, startDate] : [startDate, endDate]
// build queryParams from { from, to }, never from the raw pair

// On set — keep the inverted state from ever entering the URL via the UI:
onDateRange: ({ start, end }) =>
  setFilters(start && end && start > end
    ? { startDate: end, endDate: start }
    : { startDate: start, endDate: end })
```

> Note on array filters: `parseAsArrayOf(parseAsStringEnum(...))` already **drops
> invalid members** at parse time (`?status=open,bogus` → `["open"]`), so Layer 1
> covers arrays for free. It does **not** dedupe (`open,open` → `["open","open"]`);
> wrap the parser in a small `parseAsEnumSet` only if duplicates actually matter.

### Layer 3 — URL canonicalization (optional, cosmetic)

After Layers 1–2 your _state_ is always valid, but the URL **string** may still
read `?role=wizard` until the next write (nuqs leaves unknown/invalid raw values
in place; it just parses them to `null`). Layer 2's clamp already rewrites `page`.
If you also want the address bar itself cleaned on load, canonicalize on mount:

- Compare the module's namespaced params in `window.location` to
  `serialize(filters)` (which is always clean).
- If they differ, `setFilters(filters)` to rewrite the URL to the canonical form,
  dropping invalid values and defaults (`clearOnDefault`).

This is opt-in because it costs one extra `replace` on deep-link loads and only
affects appearance, not correctness. Most apps don't need it — a `?role=wizard`
that simply behaves as "all" is usually fine.

### What this means in practice

- A shared link with a stale/invalid filter **degrades gracefully** (falls back to
  default) instead of erroring or sending bad params to the API.
- You never write defensive `if (!VALID.includes(role))` checks in components —
  the parser already guarantees validity.

---

## 12. What this removes from the old design

Adopting this lets us **delete**, not add:

- `getCurrentModulePath`, the UUID regex, `includeUrlPaths`,
  `shouldIncludeUrlPersistence` → namespacing makes path-detection unnecessary.
- Module-change reset effect, `previousEntityRef` / `previousModuleRef`,
  `onResetFiltersForChange` → replaced by the `scope` key.
- `createJSONParser`, `getFilteredUrlState`, `syncLocalStateWithUrlState`,
  `getInitial*StateFrom*`, the `isInitialized` flag, `localState`, the 4-way merge
  → replaced by typed parsers + one snapshot mechanism.
- `useDateRange`'s manual `format`/`parse` → `parseAsIsoDateTime`.

The whole `filters-provider/` folder shrinks to a small factory + a snapshot helper.

---

## 13. Conventions checklist

- [ ] One `filters.ts` per module; never import another module's filters.
- [ ] Register every `prefix` in `FILTER_PREFIXES`; keep them unique.
- [ ] Use typed parsers from `lib/filters/parsers.ts`; never a generic JSON parser.
- [ ] Validate at the edge: enums/literals over `parseAsString` for known domains;
      clamp out-of-range values after data loads (Layers 1–2, §11).
- [ ] Navigational state → URL. Keep personal preferences (column visibility,
      density) out of the URL — a localStorage concern, not a filter.
- [ ] `scope` returns the reset boundary explicitly; never parse the pathname.
- [ ] Debounce the value feeding React Query, not the URL write.
- [ ] The filter hook is pure state — keep React Query, columns, and filter UI in
      separate composables that consume it.

---

## 14. Migration path (incremental)

1. Add `lib/filters/` (factory, parsers, prefixes, snapshot helper).
   No behaviour change yet.
2. Migrate **one** module (e.g. executions) to `createModuleFilters`. Verify URL
   namespacing, back-nav persistence, and entity rescoping.
3. Migrate remaining modules one at a time. Each migration deletes its
   `FiltersProvider` layout wiring.
4. Once no module imports `filters-provider/`, delete the old provider folder.
