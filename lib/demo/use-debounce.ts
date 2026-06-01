"use client"

import { useEffect, useState } from "react"

/** Minimal debounce — used to debounce the value feeding React Query, never the URL write. */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
