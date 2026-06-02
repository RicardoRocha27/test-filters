"use client"

import { Button } from "@/components/ui/button"
import { useAnalyticsDateRange } from "@/modules/analytics/shared-date-filters"

/** Renders the SHARED analytics date range. Used on both the parent and child pages. */
export function DateRangeBar() {
  const { filters, setFilters, reset } = useAnalyticsDateRange()

  return (
    <div className="rounded border border-dashed p-3">
      <p className="text-xs font-semibold text-muted-foreground">
        Shared analytics date range — same hook on every page in this agent&apos;s section
      </p>
      <pre className="mt-1 text-xs" data-testid="shared-dates">
        {JSON.stringify(
          { startDate: filters.startDate, endDate: filters.endDate },
          null,
          2
        )}
      </pre>
      <div className="mt-2 flex gap-2">
        <Button
          variant="outline"
          onClick={() =>
            setFilters({
              startDate: new Date("2025-01-01T00:00:00.000Z"),
              endDate: new Date("2025-03-01T00:00:00.000Z"),
            })
          }
        >
          Set sample range
        </Button>
        <Button variant="outline" onClick={reset}>
          Clear dates
        </Button>
      </div>
    </div>
  )
}
