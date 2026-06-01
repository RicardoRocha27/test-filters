import { Suspense } from "react"
import Link from "next/link"

/** A different app ("supervisor"). Distinct prefix, fully isolated from platform. */
export default function SupervisorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-3 border-b pb-2 text-sm">
        <Link href="/" className="text-primary underline">Home</Link>
        <span className="text-muted-foreground">supervisor:</span>
        <Link href="/supervisor/open-cases" className="text-primary underline">open-cases</Link>
      </nav>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        {children}
      </Suspense>
    </div>
  )
}
