/**
 * In-memory fake API so the demo actually fetches (via React Query) keyed on the
 * filters object. No backend — it generates deterministic rows per resource+scope
 * and applies search/sort/pagination client-side.
 */

export type Row = {
  id: string
  name: string
  category: string
  createdAt: string
}

const NAMES = [
  "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel",
  "India", "Juliet", "Kilo", "Lima", "Mike", "November", "Oscar", "Papa",
  "Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "Xray",
]

function seededRows(resource: string, scopeId: string, categories: string[]): Row[] {
  // Deterministic: the same resource+scope always yields the same dataset,
  // and different scopes (entities) yield visibly different data.
  const seedChar = (scopeId.charCodeAt(0) || 65) % NAMES.length
  return NAMES.map((base, i) => {
    const idx = (i + seedChar) % NAMES.length
    return {
      id: `${resource}-${scopeId}-${i}`,
      name: `${NAMES[idx]} ${resource} (${scopeId})`,
      category: categories[(i + seedChar) % categories.length],
      createdAt: new Date(2024, 0, 1 + ((i * 7 + seedChar) % 300)).toISOString(),
    }
  })
}

export type ListParams = {
  page: number
  size: number
  search: string
  orderBy: string
  /** Optional category filter (role / status / metric in the demo modules). */
  category?: string
}

export type ListResult = { items: Row[]; total: number }

export async function fakeList(args: {
  resource: string
  scopeId?: string | null
  categories: string[]
  params: ListParams
}): Promise<ListResult> {
  const { resource, scopeId, categories, params } = args
  // Simulate latency so you can see React Query refetch on filter changes.
  await new Promise((r) => setTimeout(r, 350))

  let rows = seededRows(resource, scopeId ?? "_", categories)

  if (params.search) {
    const q = params.search.toLowerCase()
    rows = rows.filter((r) => r.name.toLowerCase().includes(q))
  }
  if (params.category) {
    rows = rows.filter((r) => r.category === params.category)
  }
  if (params.orderBy) {
    rows = [...rows].sort((a, b) => {
      if (params.orderBy === "name") return a.name.localeCompare(b.name)
      if (params.orderBy === "createdAt") return a.createdAt.localeCompare(b.createdAt)
      if (params.orderBy === "category") return a.category.localeCompare(b.category)
      return 0
    })
  }

  const total = rows.length
  const start = (params.page - 1) * params.size
  const items = rows.slice(start, start + params.size)
  return { items, total }
}
