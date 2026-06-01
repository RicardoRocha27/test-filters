import { Suspense } from "react"
import Link from "next/link"

/** "platform" app shell. The app segment is just a layout — no filter logic here. */
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-3 border-b pb-2 text-sm">
        <Link href="/" className="text-primary underline">Home</Link>
        <span className="text-muted-foreground">platform:</span>
        <Link href="/platform/admin/users" className="text-primary underline">admin/users</Link>
        <Link href="/platform/agents/agent-1/analytics" className="text-primary underline">agent-1 analytics</Link>
        <Link href="/platform/agents/agent-2/analytics" className="text-primary underline">agent-2 analytics</Link>
        <Link href="/platform/workflows/wf-1/analytics" className="text-primary underline">wf-1 analytics</Link>
      </nav>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        {children}
      </Suspense>
    </div>
  )
}
