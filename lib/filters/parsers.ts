import { createParser, parseAsInteger, parseAsIsoDateTime, parseAsString } from "nuqs"

/**
 * A page number that is ALWAYS a positive integer. Anything else in the URL
 * (`page=abc`, `page=-5`, `page=0`, `page=1.5`) fails to parse and falls back to
 * the default of 1. This is Layer 1 validation: the *shape* is enforced here, so
 * `filters.page` is never garbage. The dynamic upper bound (page > last page)
 * can't be known until data loads — that's reconciled in the table controller.
 */
export const parseAsPageNumber = createParser({
  parse: (value) => {
    const n = Number(value)
    return Number.isInteger(n) && n >= 1 ? n : null
  },
  serialize: (value) => String(value),
}).withDefault(1)

/**
 * Reusable, typed parser groups. Compose these into a module's parser map.
 * Defaults live here via `.withDefault()`; with nuqs's `clearOnDefault`, a value
 * equal to its default is omitted from the URL.
 */
export const tableFilters = {
  page: parseAsPageNumber,
  size: parseAsInteger.withDefault(20),
  search: parseAsString.withDefault(""),
  orderBy: parseAsString.withDefault(""), // see note: prefer parseAsStringLiteral(columns)
}

export const dateRange = {
  startDate: parseAsIsoDateTime,
  endDate: parseAsIsoDateTime,
}
