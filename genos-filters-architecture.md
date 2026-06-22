# Filters Architecture (GenOS Platform)

Target architecture for URL-persisted filters across the platform's modules and
routes, built on **nuqs** + **React Query** (`useAppQuery`) + **React Table**.

This **supersedes** `src/providers/filters-provider/` (the generic `FiltersProvider`
+ `useFilters` + `utils.ts`). It is written against this codebase's real modules,
routes, entity scoping, and conventions (see `AGENTS.md`).

> A standalone, browser-tested reference implementation of the core (factory +
> snapshot + parsers + validation layers) lives in the `test-filters-2` sandbox.
> This document adapts it to GenOS: `useEntity` scoping, `useAppQuery`, React
> Table, `next-intl`, and `date-fns-tz`.

---

## 1. Why we're replacing the current provider

`src/providers/filters-provider/useFilters.tsx` merges **four sources of truth**
every render:

```
defaultValues → localState (React) → localStorageState → urlState
```

Everything painful grows out of keeping those in sync:

- **No URL namespacing** → every module writes the same global keys (`page`,
  `orderBy`, `search`, `status`, `startDate`, `endDate`), so providers collide.
  We patched around it with `getCurrentModulePath` + `includeUrlPaths` + a
  module-change reset — including a **UUID regex** whose only job is to stop that
  reset from wiping filters on `[id]`/detail routes.
- **`createJSONParser` for every key** → we threw away nuqs's typed parsers,
  defaults, `clearOnDefault`, and array handling, and hand-roll `status.split(',')`
  and `useDateRange`'s manual `format`/`parse`.
- **Derived state synced via effects** (`isInitialized`, the localStorage↔URL↔local
  chains) → the classic anti-pattern React warns about; the source of init flicker.
- **Types declared three times** (`WorkflowExecutionsFilter`, `defaultValues`,
  `config.persistUrl` booleans) that must be hand-kept in sync.

The fix is mostly **deletion**. The URL is already a global, persistent,
shareable store — we stop rebuilding one on top of it.

---

## 2. Principles

1. **The URL is the store.** `useQueryStates` is the single live source of truth.
   No `localState`, no live-merged `localStorageState`. Defaults live in the
   parser via `.withDefault()`.
2. **Namespace every module by an explicit `prefix`.** `exe_page`,
   `aan_status` (3-letter codes; see §6). Modules can't collide — even when a table, a quick
   filter, and an export button share a page. This deletes all path-based module
   detection.
3. **Colocate.** Each module owns `modules/<m>/filters.ts`. No module imports
   another's filters.
4. **One factory.** A new module's filter definition is ~10 lines.
5. **Scope is explicit**, derived from `useEntity()` — never parsed from the
   pathname.

---

## 3. Two primitives

| | **Navigational filters** | **Personal preferences** |
| --- | --- | --- |
| Examples | page, search, status, date range, sort | column visibility, density |
| Stored in | **URL** (nuqs), namespaced | `localStorage` (out of the URL) |
| Stickiness | entity-scoped `sessionStorage` seed | `localStorage` |
| Primitive | `createModuleFilters()` | (a small `localStorage` hook, later) |

Rule of thumb: _"Would I put it in a link I send a teammate?"_ Yes → URL. No →
preference. **Only the URL primitive (`createModuleFilters`) is in scope.**
Preferences (e.g. the per-table `localStorageKey` we already pass) stay where they
are for now; the split matters mainly as guidance for what does **not** belong in
the filter layer.

---

## 4. Persistence + scope: one mechanism

The product behaviour — "remember my filters within a session" + "reset when the
active agent/workflow changes" — is a single **entity-scoped session snapshot**
keyed `filters:{prefix}:{entityId}`:

- **Stickiness** — write-through to that key on every change; seed it back into the
  URL when landing on a bare module URL (in-app "back to list", reload).
- **Rescope** — when `entityId` changes, the key changes, so you load *that
  entity's* last view (or empty). This replaces `previousAgentIdRef` +
  `onResetFiltersForChange`.
- **Shareable** — the snapshot only ever *seeds* the URL, never merges live, so the
  URL stays the single source of truth and React Query reads one place.

Rules the factory encapsulates:

| Trigger | URL has params? | Action |
| --- | --- | --- |
| Initial mount | yes (deep link / browser back) | URL wins — do nothing |
| Initial mount | no (bare URL) | seed from `filters:{prefix}:{entityId}` |
| Entity changed | — | replace URL with new entity's snapshot (or clear) |
| Reset / "clear all" | — | clear URL **and** drop the snapshot |

### Clear-forgets vs. navigate-restores (the load-bearing distinction)

"I cleared everything" and "I navigated to the bare page" both produce the same
empty URL — they're told apart by **whether a snapshot still exists**:

- **Clear** → `reset()` empties the filters **and explicitly drops the snapshot**.
  There's nothing left to restore, so the page stays empty even after you navigate
  away and back. (Verified: e2e scenario 14.)
- **Navigate back** to the bare page (nav link, in-app back) → the snapshot was
  kept, so filters **restore**. (Verified: e2e scenario 1.)

**The one rule this depends on:** a "Clear" affordance must empty state **through
the hook** (`reset()` / `setFilters`), **never** by navigating to a bare URL.
Navigating *to* a bare URL means "I'm arriving" → restore; only a state mutation
means "forget this" → drop. Same destination, opposite intent.

We use **`sessionStorage`** (not `localStorage`) for navigational stickiness, so a
fresh tab/visit starts clean — fixing the "filters feel stuck" behaviour the
current per-entity `localStorage` causes.

### Implementation gotchas (verified in the reference)

1. **Defer the restore to a microtask.** Calling `setFilters` synchronously inside
   the mount effect races nuqs's own URL read: the URL updates but `filters` stays
   at defaults (URL says `page=2`, the table renders page 1). `queueMicrotask`
   fixes it. Only reproduces under React Strict Mode (`next dev`).
2. **Guard the write-through with a `pendingRestore` ref** so the transient bare
   state during a restore can't delete the snapshot (Strict Mode double-fires
   effects; a one-shot "suppress" flag is not enough).
3. **Three-state `scopeId`:** `undefined` = unscoped page, `null` = scoped but not
   ready (entity still loading), `string` = ready. While `null`, the snapshot
   *waits* — so `useEntity().isLoading` flicker can't trigger a stray reset.
4. **Decide "is the URL bare?" from the actual URL, not `filters`.** The seed-vs-
   deep-link choice reads `window.location.search` for this module's namespaced
   keys — *not* `qs`/`filters`. Deriving it from parsed state would couple
   correctness to nuqs's parse *timing*: if an upgrade deferred hydration a tick,
   a shared deep link would momentarily look "bare" and get overwritten by stale
   session state — a silent shareability regression. Reading the URL removes the
   coupling. Guarded by e2e scenario 13 (a rich multi-namespace deep link must beat
   primed snapshots).

---

## 5. Folder structure

```
src/lib/filters/
  create-module-filters.ts   # the factory: namespaced nuqs hook + scope + session seed
  use-filter-snapshot.ts      # internal: seed / rescope / write-through
  parsers.ts                  # tableFilters, dateRange, parseAsPageNumber
  prefixes.ts                 # FILTER_PREFIXES registry (uniqueness guardrail)
  index.ts

src/modules/<module>/
  filters.ts                  # createModuleFilters({ prefix, parsers, persist, scope })
  components/<x>-table/
    use<X>Table.tsx           # consumes the filter hook + useAppQuery + columns
    columns.tsx               # React Table column defs (existing convention)
```

This fits the existing module layout (`api/`, `components/`, `columns.tsx`,
`use<X>Table.tsx`). The filter definition is one new colocated file per module.

---

## 6. The factory

```ts
// src/lib/filters/create-module-filters.ts
'use client';

import {
  createLoader,
  createSerializer,
  useQueryStates,
  type inferParserType,
  type ParserMap,
  type UrlKeys,
  type UseQueryStatesOptions,
} from 'nuqs';
import { useFilterSnapshot } from './use-filter-snapshot';

export type ModuleFiltersConfig<P extends ParserMap> = {
  /** Unique URL namespace. Maps `status` -> `${prefix}_status`. Use FILTER_PREFIXES. */
  prefix: string;
  parsers: P;
  /** 'session' enables the entity-scoped sessionStorage seed + write-through. */
  persist?: false | 'session';
  options?: Partial<UseQueryStatesOptions<P>>;
};

export function createModuleFilters<P extends ParserMap>(config: ModuleFiltersConfig<P>) {
  const { prefix, parsers, persist = false, options } = config;

  const urlKeys = Object.fromEntries(
    Object.keys(parsers).map((k) => [k, `${prefix}_${k}`]),
  ) as UrlKeys<P>;

  // Built once per module — stable identities.
  const serialize = createSerializer(parsers, { urlKeys });
  const load = createLoader(parsers, { urlKeys });

  type Values = inferParserType<P>;

  /** Pass the entity id as `scopeId` (or `null` while it loads); omit for unscoped pages. */
  function useFilters(scopeId?: string | null) {
    const [filters, setFilters] = useQueryStates(parsers, { urlKeys, ...options });

    useFilterSnapshot<P>({
      enabled: persist === 'session',
      prefix,
      scopeId,
      filters: filters as Record<string, unknown>,
      setFilters: setFilters as unknown as (v: Record<string, unknown>) => void,
      serialize: serialize as unknown as (v: Record<string, unknown>) => string,
      load: load as unknown as (input: string) => Record<string, unknown>,
    });

    const reset = () =>
      setFilters(
        Object.fromEntries(Object.keys(parsers).map((k) => [k, null])) as Partial<Values>,
      );

    return { filters: filters as Values, setFilters, reset };
  }

  return { useFilters, urlKeys, parsers, serialize, load };
}
```

> The full `use-filter-snapshot.ts` (microtask restore + `pendingRestore` guard +
> three-state scope) is in the reference repo; copy it verbatim.

```ts
// src/lib/filters/parsers.ts
import { createParser, parseAsInteger, parseAsIsoDateTime, parseAsString } from 'nuqs';
import { DEFAULT_PAGE_SIZE } from '@/components/v2/organisms/data-table/_utils/utils';

/** Always a positive integer; `page=abc|-5|0` -> 1. */
export const parseAsPageNumber = createParser({
  parse: (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 ? n : null; },
  serialize: (v) => String(v),
}).withDefault(1);

export const tableFilters = {
  page: parseAsPageNumber,
  search: parseAsString.withDefault(''),
  // NOTE: prefer parseAsStringLiteral(sortableColumns) per module (see §10).
  orderBy: parseAsString.withDefault(''),
};

// `size` is NOT a URL param here — page size comes from DEFAULT_PAGE_SIZE / a
// preference, not the URL. Add it only if a module truly needs shareable size.

export const dateRange = {
  startDate: parseAsIsoDateTime,
  endDate: parseAsIsoDateTime,
};
```

```ts
// src/lib/filters/prefixes.ts
//
// Convention: KEYS are readable (used in code — `FILTER_PREFIXES.executions`);
// VALUES are short 3-letter codes that appear in the URL (`exe_page`), joined to
// the filter key with an underscore. Values MUST stay globally unique — that
// uniqueness is the whole namespacing guarantee. One entry per filter-bearing
// module; add more as modules migrate.
export const FILTER_PREFIXES = {
  adminUsers: 'adu',
  agentUsers: 'agu',
  workflowUsers: 'wfu',
  executions: 'exe',
  agentAnalytics: 'aan',
  workflowAnalytics: 'wan',
  assistantAnalytics: 'asa',
  evalSets: 'evs',
  evalSetQuestions: 'esq',
  runHistory: 'rnh',
  runDetailResults: 'rdr',
  knowledgeFiles: 'knf',
  knowledgeWebUrls: 'knw',
  knowledgeAudit: 'kna',
  reportedIssues: 'rpi',
  suggestedIssues: 'sgi',
  conversations: 'cnv',
  supervisorOpenCases: 'soc',
  supervisorClosedCases: 'scc',
  supervisorWorkflowOpenCases: 'swo',
} as const;

export type FilterPrefix = (typeof FILTER_PREFIXES)[keyof typeof FILTER_PREFIXES];
```

Example URLs: `?exe_page=2&exe_status=ERROR`, `?aan_orderBy=createdAt`. The code
still reads `prefix: FILTER_PREFIXES.executions` — only the URL value is terse.

---

## 7. Entity scope — wiring `useEntity`

`scopeId` is the reset boundary. Derive it from `useEntity()` using the three-state
convention so an `isLoading` flicker never clears filters:

```ts
// inside a scoped module's filter hook
import { useEntity } from '@/modules/agents/hooks/useEntity';

function useEntityScopeId(): string | null {
  const { currentEntity, isLoading } = useEntity();
  return isLoading ? null : (currentEntity?.id ?? null); // null => "pending"
}
```

| `scopeId` | meaning | snapshot behaviour |
| --- | --- | --- |
| `undefined` | unscoped page (e.g. `admin/users`) | one stable bucket |
| `null` | scoped, entity still loading | **wait** (no seed/rescope) |
| `string` (entity id) | scoped, ready | seed/rescope per entity |

This replaces the entire `EntityProvider`-coupled reset machinery in the current
`useFilters` (the `previousAgentIdRef`, `onResetFiltersForChange`, and the
`isEntityPending` branches).

---

## 8. Route topology → config

The factory is **path-agnostic** — every route shape maps onto `prefix` + `scopeId`.
Real routes:

The `prefix` column shows the URL code; you reference it in code as the readable
registry key (e.g. `FILTER_PREFIXES.executions` → `exe`).

| Route | App | `prefix` | `scopeId` |
| --- | --- | --- | --- |
| `platform/admin/users` | platform | `adu` | `undefined` (unscoped) |
| `platform/agents/[agentId]/analytics` | platform | `aan` | agent id |
| `platform/agents/[agentId]/conversations` | platform | `cnv` | agent id |
| `platform/agents/[agentId]/issues/reported` | platform | `rpi` | agent id |
| `platform/workflows/[workflowId]/executions` | platform | `exe` | workflow id |
| `platform/workflows/[workflowId]/analytics` | platform | `wan` | workflow id |
| `…/evals/eval-sets` | platform | `evs` | agent id |
| `…/evals/eval-sets/[setId]/questions` | platform | `esq` | `${agentId}:${setId}` |
| `…/evals/run-history/[runId]` | platform | `rdr` | `${agentId}:${runId}` |
| `platform/apps/assistant/analytics` | platform | `asa` | `undefined` |
| `supervisor/cases/open` | supervisor | `soc` | `undefined` |
| `supervisor/cases/closed` | supervisor | `scc` | `undefined` |
| `supervisor/workflows/[workflowId]/cases/open` | supervisor | `swo` | workflow id |

Notes:

- **Composite scope for nested entities** (`agentId:setId`) — filters reset when you
  switch eval set *or* agent. Build it from `useParams()` + `useEntity()`.
- **`[id]` detail routes need no special handling** — there's no module-change reset
  to trap, so the current UUID-regex workaround disappears entirely.
- **`(v2)` vs `(dashboard)`** route groups don't matter; the `prefix` is explicit.

---

## 9. React Query integration (our idiom)

The filter object becomes the **query params**; `pathParams` come from
`useEntityScope`; everything goes through `useAppQuery` + the query-key factory we
already use. Debounce only the value that feeds the query (search) — never the URL
write (nuqs batches it). `keepPreviousData` is already our default in
`queryOptions`, so pagination won't flash.

```ts
// src/modules/workflow-executions/filters.ts
import { parseAsArrayOf, parseAsIsoDateTime, parseAsStringEnum } from 'nuqs';
import { createModuleFilters, FILTER_PREFIXES, tableFilters } from '@/lib/filters';
import { useEntity } from '@/modules/agents/hooks/useEntity';
import { WorkflowExecutionStatus } from './api/workflow-executions.schemas';

const base = createModuleFilters({
  prefix: FILTER_PREFIXES.executions,
  persist: 'session',
  parsers: {
    ...tableFilters,
    startDate: parseAsIsoDateTime,
    endDate: parseAsIsoDateTime,
    // TS enum -> real validation: ?status=BOGUS parses to [] (see §11)
    status: parseAsArrayOf(parseAsStringEnum(Object.values(WorkflowExecutionStatus))).withDefault([]),
  },
});

export function useExecutionsFilters() {
  const { currentEntity, isLoading } = useEntity();
  return base.useFilters(isLoading ? null : (currentEntity?.id ?? null));
}
```

```ts
// src/modules/workflow-executions/components/workflow-executions-table/useWorkflowExecutionsTable.tsx
const { filters, setFilters, reset } = useExecutionsFilters();
const { scopedQueryParams } = useEntityScope();          // { workflow_id }
const [debouncedSearch] = useDebounce(filters.search, 300);

const queryParams: GetWorkflowExecutionsQueryParams = {
  page: filters.page,
  size: DEFAULT_PAGE_SIZE,
  order_by: filters.orderBy || undefined,
  search: debouncedSearch || undefined,
  filter_status: filters.status.length ? filters.status.join(',') : undefined,
  start_date: filterDateToIso(filters.startDate),
  end_date: filterDateToIso(filters.endDate),
};

const { data, isPending } = useGetWorkflowExecutionsQuery({
  pathParams: { workflow_id: /* from scopedQueryParams */ },
  queryParams, // <- filters drive the query key
});
```

The filter hook is **pure state**. Columns (`columns.tsx`), the query, the export
params, and the quick-filter UI all *consume* it — keeping `use<X>Table` thin per
`AGENTS.md`.

---

## 10. React Table integration

Drive the table from URL filters (controlled), don't keep a second copy in React
Table's internal state:

- **Pagination:** `pagination = { pageIndex: filters.page - 1, pageSize: DEFAULT_PAGE_SIZE }`;
  `onPaginationChange` → `setFilters({ page: next.pageIndex + 1 })`. Use
  `manualPagination: true` (server-side).
- **Sorting:** `manualSorting: true`; map React Table's `SortingState` ↔ `orderBy`.
  Constrain `orderBy` to the sortable column ids with
  `parseAsStringLiteral(SORTABLE_COLUMNS)` so `?orderBy=hax` can't reach the API.
- **Row click → detail:** unchanged (`router.push`); the parent URL (with filters)
  stays in history, so browser back restores it, and the session snapshot covers
  in-app "back to list".

---

## 11. Validation — invalid / out-of-range URL values

URLs are user-editable, so they will contain garbage (`?status=BOGUS`,
`?page=999`, `?orderBy=hax`). **Guarantee: `filters` is always valid; bad values
never reach the API.** Four layers, split by *when* you can know a value is invalid.

### Layer 1 — Parse-time (value's domain is known up front)

Use the right parser; a failed parse falls back to default/absent. We already
define domain enums as TS `enum`s — feed them straight in:

| Filter kind | Parser | `?x=garbage` → |
| --- | --- | --- |
| One of a fixed set (status, type) | `parseAsStringEnum(Object.values(MyEnum))` | `null` → "all" |
| Multi-select | `parseAsArrayOf(parseAsStringEnum(Object.values(MyEnum)))` | invalid members dropped |
| Sortable column | `parseAsStringLiteral(SORTABLE_COLUMNS)` | `null` → no sort |
| Page | `parseAsPageNumber` | `1` |

> Verified: `parseAsArrayOf(parseAsStringEnum(...))` **drops invalid members**
> (`?status=ERROR,BOGUS` → `['ERROR']`) but keeps duplicates. Dedup only if it
> matters (wrap in a `parseAsEnumSet`).

This also removes the defensive `status.split(',').filter(Boolean)` and the
`WORKFLOW_EXECUTION_FILTER_STATUS_BLOCKED` membership checks from the components.

### Layer 1.5 — Multi-field, synchronous (date range)

Inverted range (`startDate > endDate`) spans two filters but needs no server data.
Normalize at the query boundary (covers hand-edited URLs), and swap on set in the
date picker:

```ts
const [from, to] =
  startDate && endDate && startDate > endDate ? [endDate, startDate] : [startDate, endDate];
```

### Layer 2 — Dynamic (validity depends on fetched data)

`?page=999` is shape-valid but out of range — you only learn the real count from
`total`. Reconcile after data lands, guarded on `data` so you don't clamp against
the empty initial state:

```ts
const maxPage = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));
useEffect(() => {
  if (data && filters.page > maxPage) setFilters({ page: maxPage });
}, [data, maxPage, filters.page, setFilters]);
```

Same pattern for a filter referencing a deleted agent/workflow, a date outside an
allowed window, etc.: detect after fetch, then `setFilters` to a valid value.

### Layer 3 — URL canonicalization (optional, cosmetic)

After Layers 1–2 *state* is always valid, but the URL string may still read
`?status=BOGUS` until the next write. If you want the address bar cleaned on load,
compare the namespaced params to `serialize(filters)` and `setFilters(filters)`
when they differ. Opt-in; most cases don't need it.

### Server still validates

Layer 1 is **UX, not security** — the URL is fully attacker-controlled, so the Zod
`queryParamsSchema` on each action remains the real boundary.

---

## 12. Dates & timezones

The current `useDateRange` stores `dd/MM/yyyy` strings and hand-`parse`s them.
Replace with:

- **URL:** `parseAsIsoDateTime` (canonical, unambiguous, sortable).
- **Display:** format with `date-fns` / `date-fns-tz` and `FILTERS_DATE_FORMAT` at
  the component edge only.
- **API:** convert to the backend's expected format/zone at the query boundary
  (`filterDateToIso`), not in the filter state.

Keep timezone conversion in **one** place (the query/display boundary); the stored
value is always ISO.

---

## 13. Multiple consumers on one page (tables + quick filters + export)

Several existing pages have a table **and** a quick-filter component **and** an
export button all reading the same filters (e.g. workflow-executions). With the
URL as the store this "just works" — **call the same module hook wherever you need
it.** No "owner" component to designate, no second variant.

Why it's safe to call the same hook from many co-mounted components: nuqs syncs
every `useQueryStates` instance on the same keys, so `filters` is identical across
all of them each render. The snapshot effect is **idempotent** — N instances read
the same snapshot, schedule the same `setFilters`, and write the same value to the
same key; they converge, nothing clobbers. The only cost is a little redundant work
(a couple extra `sessionStorage` writes), negligible at realistic scale.

> Verified: the reference's analytics page calls `useAnalyticsDateRange()` twice
> (page body + `DateRangeBar`), i.e. two co-mounted snapshot instances, and the
> shared-dimension e2e scenarios pass in dev (Strict Mode).

Optional optimization (not required): if a page ever has *many* consumers and you
want to skip the redundant writes, hoist the hook into the page and pass values
down. Don't reach for a read-only/owner split — it reintroduces a footgun (forget
the "owner" and persistence silently stops).

The **export** action should build its params from the same `filters` object the
table uses — never a second source.

---

## 14. Sharing vs isolating filters across pages

Cross-page behaviour falls out of **which hook a page calls** — there is no
special mechanism to build:

- **Share a dimension across pages** (e.g. a global analytics date range): have
  the related pages call the **same** module filter hook (same `prefix`). They
  read/write the same URL keys, so the value is shared by construction. To make it
  survive navigation through a bare `<Link>`, give that hook `persist: 'session'`
  and a `scope` that spans the pages (e.g. the agent id) — same hook + same scope
  means the destination reseeds it from the snapshot. (Optional polish: build the
  link with the hook's serialized query so a chart doesn't fetch-empty for one
  frame; not needed for correctness.)
- **Isolate a filter per view** (e.g. each topic's or each child page's own
  search): give each view its **own** hook with its **own** `prefix`. A parent's
  `aan_search` and a child's `cad_search` are different URL keys, so one can never
  bleed into the other. Switching between entities of the *same* module (same hook,
  different `scope`) is also isolated — the rescope loads that entity's snapshot,
  so "abc" searched under topic A does not apply under topic B.

> **Rule of thumb: same hook = shared, different hook = isolated.** That's the
> whole model — nothing else is required.

---

## 15. i18n

Filter *labels* and option text continue to come from `next-intl`
(`useTranslations`). The architecture is values-only; nothing about it touches
translation. Keep using translation keys for the quick-filter titles, status
labels, etc.

---

## 16. What this deletes

- `src/providers/filters-provider/` — `FiltersProvider`, `FiltersContextBridge`,
  `useFilters`, `utils.ts`, types (the 4-source merge, `createJSONParser`,
  `getCurrentModulePath`, the **UUID regex**, `includeUrlPaths`,
  `shouldIncludeUrlPersistence`, the localStorage↔URL sync, `isInitialized`).
- The per-layout `<FiltersProvider defaultValues={…} config={…}>` wiring in every
  `app/**/layout.tsx`.
- `useDateRange`'s manual `format`/`parse`.
- Per-call `useFiltersContext<T>()` generics — replaced by typed module hooks.

---

## 17. Edge cases to keep in mind

- **Entity transiently `null`** (`useEntity().isLoading`) → handled by the
  three-state `scopeId` (§7); the snapshot waits.
- **Out-of-range page** after switching to a heavier filter → Layer 2 clamp (§11).
- **Inverted date range** from a pasted URL → Layer 1.5 (§11).
- **Array filters**: invalid members auto-dropped; dedup only if needed (§11).
- **`size` is not a URL param** — page size is `DEFAULT_PAGE_SIZE`/preference, so
  there's no `size=0` / `size=huge` foot-gun.
- **Snapshot schema drift across deploys** — `sessionStorage` is short-lived, so
  low risk; if/when preferences move to `localStorage`, version those keys.
- **Long URLs** from large multi-selects — cap selection counts; keep prefixes
  short-ish (the dominant cost is values, not key names).
- **`history: 'replace'`** (nuqs default) means browser Back leaves the page rather
  than undoing the last filter — usually what we want; confirm per surface.

---

## 18. Migration plan (incremental, no big bang)

1. Add `src/lib/filters/` (factory, snapshot, parsers, prefixes) and unit-test the
   parsers. No behaviour change yet. `FiltersProvider` stays.
2. Migrate **one** module end-to-end — **workflow-executions** is the best first
   (full shape: page/search/orderBy/status[]/date range, entity-scoped by
   workflow, has a quick filter + export). Delete its `<FiltersProvider>` layout
   wiring; point `useWorkflowExecutionsTable` at `useExecutionsFilters`.
   Verify: namespacing, deep-link, browser back, in-app back, rescope on workflow
   change, invalid `status`, out-of-range `page`.
3. Roll module by module (evals, knowledge, entity-issues, conversations,
   agent/workflow analytics, admin/agent users, supervisor cases). Each migration
   removes one `FiltersProvider` mount.
4. When no file imports `filters-provider/`, **delete the folder** and the
   `useDateRange` shim.

---

## 19. Conventions checklist

- [ ] One `filters.ts` per module; never import another module's filters.
- [ ] Register every `prefix` in `FILTER_PREFIXES`; keep them unique.
- [ ] Typed parsers only — `parseAsStringEnum(Object.values(MyEnum))`,
      `parseAsStringLiteral(columns)`, `parseAsPageNumber`. No generic JSON parser.
- [ ] `scopeId` from `useEntity()` with the `null`-while-loading convention; never
      parse the pathname.
- [ ] Debounce the value feeding `useAppQuery`, not the URL write.
- [ ] Drive React Table from URL filters (`manualPagination`/`manualSorting`),
      not a second internal copy.
- [ ] Export/other consumers read the same `filters` object — one source.
- [ ] Filter hook is pure state; query, columns, and quick-filter UI consume it.
- [ ] Zod `queryParamsSchema` stays — Layer 1 is UX, not security.
