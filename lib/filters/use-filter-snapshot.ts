"use client"

import { useEffect, useMemo, useRef } from "react"
import type { ParserMap } from "nuqs"

type SerializeFn = (values: Record<string, unknown>) => string
type LoadFn = (input: string) => Record<string, unknown>

type Args<P extends ParserMap> = {
  /** Whether session persistence is enabled (persist: "session"). */
  enabled: boolean
  /** Namespace, e.g. "agentAnalytics". */
  prefix: string
  /**
   * Reset boundary, using a three-state convention:
   *  - `undefined` => unscoped module (top-level page); one stable bucket.
   *  - `null`      => scoped but not ready yet (route params still resolving);
   *                   seeding/rescoping is skipped so a transient flicker can't
   *                   fire a spurious clear.
   *  - `string`    => scoped and ready.
   */
  scopeId: string | null | undefined
  /** Internal filter keys (kept for parity with the factory; reset uses nulls). */
  keys: (keyof P)[]
  /** Current filter values from useQueryStates. */
  filters: Record<string, unknown>
  /** Setter from useQueryStates. */
  setFilters: (values: Record<string, unknown>) => void
  /** createSerializer instance (respects clearOnDefault + urlKeys). */
  serialize: SerializeFn
  /** createLoader instance (parses a namespaced query string back to values). */
  load: LoadFn
}

/**
 * The entity-scoped session snapshot — the single mechanism behind
 * "remember my filters within a session" + "rescope on entity change".
 *
 * Snapshot key: `filters:{prefix}:{scopeId}`. The snapshot is a serialized query
 * string (defaults omitted), round-tripped via nuqs's serializer/loader so dates
 * and arrays survive losslessly.
 *
 * Rules (see filters-architecture.md §4):
 *  - Initial mount, URL has params  -> URL wins, do nothing (and capture it).
 *  - Initial mount, URL is bare      -> seed from the snapshot.
 *  - Scope changed                   -> replace URL with the new scope's snapshot.
 *  - Reset (handled by the factory)  -> clears URL; snapshot empties on next write.
 *
 * Robustness notes:
 *  - Restores are deferred to a microtask so nuqs is fully initialized before we
 *    call its setter (calling it synchronously inside the mount effect races with
 *    nuqs's own URL read and silently no-ops the state update).
 *  - `pendingRestore` holds the query string we expect once a restore lands, so
 *    the write-through never clobbers the snapshot during the transient bare
 *    state — and tolerates React Strict Mode double-firing effects in dev.
 */
export function useFilterSnapshot<P extends ParserMap>({
  enabled,
  prefix,
  scopeId,
  filters,
  setFilters,
  serialize,
  load,
}: Args<P>) {
  const storageKey = `filters:${prefix}:${scopeId ?? "_"}`

  // Serialize from values (synchronous, race-free, respects clearOnDefault).
  // Empty string == all defaults == "no filters".
  const qs = useMemo(() => serialize(filters), [serialize, filters])

  // Which storageKey we've already handled (guards re-renders + Strict Mode).
  const seededKey = useRef<string | null>(null)
  // The query string we expect once a scheduled restore applies. While non-null,
  // the write-through pauses so it can't delete the snapshot mid-restore.
  const pendingRestore = useRef<string | null>(null)

  // Seed on mount + rescope on scope change.
  useEffect(() => {
    if (!enabled) return
    if (scopeId === null) return // scoped but pending — wait for a real id
    if (seededKey.current === storageKey) return // already handled this scope

    const isFirst = seededKey.current === null
    seededKey.current = storageKey

    let snap: string | null = null
    try {
      snap = sessionStorage.getItem(storageKey)
    } catch {
      snap = null
    }

    if (isFirst) {
      // Initial mount: the URL wins when present (deep link / back button).
      // qs === "" means the URL is bare, so seed from the snapshot.
      if (qs === "" && snap) {
        pendingRestore.current = snap
        queueMicrotask(() => setFilters(load(snap!)))
      }
    } else {
      // Genuine scope change: adopt the new scope's snapshot (or reset to empty).
      pendingRestore.current = snap ?? ""
      queueMicrotask(() => setFilters(snap ? load(snap) : load("")))
    }
    // Reacts to scope only — not keystrokes or setter-identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, enabled])

  // Write-through: mirror the live filters into the snapshot.
  useEffect(() => {
    if (!enabled) return
    if (scopeId === null) return // scoped but pending — don't touch storage yet

    if (pendingRestore.current !== null) {
      // Waiting for a restore to land — don't touch the snapshot meanwhile.
      if (qs === pendingRestore.current) pendingRestore.current = null
      return
    }

    try {
      if (qs === "") sessionStorage.removeItem(storageKey)
      else sessionStorage.setItem(storageKey, qs)
    } catch {
      // sessionStorage unavailable (private mode / SSR) — degrade silently.
    }
  }, [qs, storageKey, enabled, scopeId])
}
