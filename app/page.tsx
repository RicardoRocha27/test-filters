import Link from "next/link"

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Filters architecture — demo</h1>
      <p className="text-sm text-muted-foreground">
        Each link is a different route shape. Set some filters, navigate away and
        back, switch entities, and compare URLs across modules.
      </p>

      <section className="flex flex-col gap-1">
        <h2 className="font-semibold">App: platform</h2>
        <Link className="text-primary underline" href="/platform/admin/users">
          Top-level page — admin/users (no scope)
        </Link>
        <Link className="text-primary underline" href="/platform/agents/agent-1/analytics">
          Entity page — agents/agent-1/analytics (scope = agent id)
        </Link>
        <Link className="text-primary underline" href="/platform/workflows/wf-1/analytics">
          Entity page — workflows/wf-1/analytics (same shape, isolated)
        </Link>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="font-semibold">App: supervisor</h2>
        <Link className="text-primary underline" href="/supervisor/open-cases">
          Top-level page — supervisor/open-cases (different app)
        </Link>
      </section>
    </div>
  )
}
