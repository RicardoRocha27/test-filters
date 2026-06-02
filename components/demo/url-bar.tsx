"use client"

import { usePathname, useSearchParams } from "next/navigation"

/** Shows the live URL (path + query) so the namespaced filter params are visible while clicking around. */
export function UrlBar() {
  const pathname = usePathname()
  const query = useSearchParams().toString()
  const url = query ? `${pathname}?${query}` : pathname

  return (
    <div className="sticky top-0 z-10 border-b bg-background/95 p-2 backdrop-blur">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="shrink-0 font-semibold text-muted-foreground">URL</span>
        <code className="break-all">{url}</code>
      </div>
    </div>
  )
}
