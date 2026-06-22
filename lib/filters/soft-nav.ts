"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

// Module-level: true once the user has made at least one in-app (client-side)
// navigation in this document. Resets on a fresh document load (reload, manual
// URL edit, direct/bookmarked link) because the JS context is recreated.
let softNavigated = false

/**
 * Whether we arrived at the current view via in-app navigation (vs a fresh load).
 *
 * The snapshot uses this to decide whether a *bare* URL should restore filters:
 *  - in-app nav to a bare page (parent → child → back) → restore (the feature);
 *  - hard load of a bare page (reload / typed / cleared URL) → URL wins, stay bare.
 */
export function hasSoftNavigated() {
  return softNavigated
}

/**
 * Mount once near the root. Flips the flag the first time the client pathname
 * changes. After that it stays true for the document's lifetime, so any later
 * navigation back to a bare page restores.
 *
 * Note: on the *very first* transition after a fresh load, this effect (in the
 * layout) runs after the destination page's effects, so a restore-eligible bare
 * page reached by that first hop won't restore. That's a rare edge (you'd have to
 * hard-load a child, then go to a list that had filters) and it degrades to "bare"
 * — never to a wrong/clobbered URL.
 */
export function SoftNavWatcher() {
  const pathname = usePathname()
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    softNavigated = true
  }, [pathname])

  return null
}
