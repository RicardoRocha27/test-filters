"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * A personal preference: localStorage-only, deliberately NOT in the URL.
 *
 * Use this for things you would NOT put in a link you send a teammate — column
 * visibility, density, a personal default page size. Navigational filters belong
 * in `createModuleFilters` (the URL); preferences belong here. See §3.
 *
 * Optionally scope by a key (e.g. per entity) so different scopes keep different
 * preferences under `pref:{key}:{scope}`.
 */
export function usePreference<T>(
  key: string,
  defaultValue: T,
  opts?: { scope?: string | null }
) {
  const storageKey = `pref:${key}:${opts?.scope ?? "_"}`

  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === "undefined") return () => {}
    // Reflect changes made in other tabs.
    window.addEventListener("storage", onChange)
    return () => window.removeEventListener("storage", onChange)
  }, [])

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return null
    try {
      return localStorage.getItem(storageKey)
    } catch {
      return null
    }
  }, [storageKey])

  const raw = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null // server snapshot
  )

  const value: T = raw === null ? defaultValue : (safeParse(raw) as T) ?? defaultValue

  const setValue = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
        // Notify same-tab subscribers (the storage event only fires cross-tab).
        window.dispatchEvent(new StorageEvent("storage", { key: storageKey }))
      } catch {
        // localStorage unavailable — degrade silently.
      }
    },
    [storageKey]
  )

  return [value, setValue] as const
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
