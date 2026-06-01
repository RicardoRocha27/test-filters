"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

/**
 * Child / detail page. It has NO filters of its own. The in-app "back" link below
 * points at the BARE parent URL (no query string) — yet the parent restores its
 * filters from the entity-scoped session snapshot. The browser back button works
 * too (the parent's filtered URL is in history).
 */
export default function CaseDetailPage() {
  const { id, caseId } = useParams<{ id: string; caseId: string }>()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Case detail</h1>
      <p className="text-sm text-muted-foreground">
        agent <b>{id}</b> · case <b>{caseId}</b> · this page has no filters
      </p>
      <Link
        href={`/platform/agents/${id}/analytics`}
        className="text-primary underline"
      >
        ← Back to analytics (bare URL — filters restored from snapshot)
      </Link>
    </div>
  )
}
