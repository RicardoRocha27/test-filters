import { chromium } from "playwright"

const BASE = process.env.BASE ?? "http://localhost:3334"
const browser = await chromium.launch()
let failures = 0

const read = async (page, prefix = "agentAnalytics") => {
  const url = page.url().replace(BASE, "")
  const m = url.match(new RegExp(`${prefix}_page=(\\d+)`))
  const urlPage = m ? Number(m[1]) : 1
  const filtersPage = await page
    .getByTestId("module-filters")
    .first()
    .textContent()
    .then((t) => (t ? JSON.parse(t).page : 1))
    .catch(() => 1)
  return { url, urlPage, filtersPage }
}

const check = (name, cond, detail) => {
  console.log(
    `  ${cond ? "✓" : "✗ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`
  )
  if (!cond) failures++
}

async function fresh() {
  const ctx = await browser.newContext()
  return { ctx, page: await ctx.newPage() }
}

async function waitForRows(page) {
  // Wait until the fake API has returned (label shows a non-zero row count).
  await page.waitForSelector("text=/· [1-9]\\d* rows/", { timeout: 10000 })
}

async function clickNext(page) {
  const next = page.getByRole("button", { name: "Next", exact: true })
  await next.waitFor()
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => x.textContent?.trim() === "Next"
      )
      return b && !b.disabled
    },
    { timeout: 10000 }
  )
  await next.click()
  await page.waitForTimeout(600)
}

async function goPage2(page) {
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await clickNext(page)
}

// 1) In-app back restores filters
{
  console.log("\n[1] in-app back link restores filters")
  const { ctx, page } = await fresh()
  await page.goto(`${BASE}/platform/agents/agent-1/analytics`)
  await goPage2(page)
  await page.getByRole("link", { name: /Open case detail/ }).click()
  await page.getByRole("heading", { name: "Case detail" }).waitFor()
  await page.getByRole("link", { name: /Back to analytics/ }).click()
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await page.waitForTimeout(800)
  const s = await read(page)
  check("URL has page=2", s.urlPage === 2, s.url)
  check(
    "filters.page === 2 (table matches URL)",
    s.filtersPage === 2,
    `filters.page=${s.filtersPage}`
  )
  await ctx.close()
}

// 2) Browser back restores filters
{
  console.log("\n[2] browser back button restores filters")
  const { ctx, page } = await fresh()
  await page.goto(`${BASE}/platform/agents/agent-1/analytics`)
  await goPage2(page)
  await page.getByRole("link", { name: /Open case detail/ }).click()
  await page.getByRole("heading", { name: "Case detail" }).waitFor()
  await page.goBack()
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await page.waitForTimeout(800)
  const s = await read(page)
  check("URL has page=2", s.urlPage === 2, s.url)
  check(
    "filters.page === 2",
    s.filtersPage === 2,
    `filters.page=${s.filtersPage}`
  )
  await ctx.close()
}

// 3) Rescope: each agent keeps its own filters; switching shows the other's
{
  console.log("\n[3] rescope on entity change (agent-1 vs agent-2)")
  const { ctx, page } = await fresh()
  await page.goto(`${BASE}/platform/agents/agent-1/analytics`)
  await goPage2(page) // agent-1 -> page 2
  // Switch agents via the in-app nav links (soft navigation), like the real app.
  await page.getByRole("link", { name: "agent-2 analytics" }).click()
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await page.waitForTimeout(800)
  let s = await read(page)
  check(
    "agent-2 starts clean (page=1)",
    s.urlPage === 1 && s.filtersPage === 1,
    s.url
  )
  // back to agent-1 (soft nav) -> should restore page 2
  await page.getByRole("link", { name: "agent-1 analytics" }).click()
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await page.waitForTimeout(800)
  s = await read(page)
  check(
    "agent-1 restores page=2",
    s.urlPage === 2 && s.filtersPage === 2,
    `${s.url} filters=${s.filtersPage}`
  )
  await ctx.close()
}

// 4) Cross-module isolation: admin/users page param doesn't leak agent prefix
{
  console.log("\n[4] namespacing: modules don't collide")
  const { ctx, page } = await fresh()
  await page.goto(`${BASE}/platform/admin/users`)
  await waitForRows(page)
  await clickNext(page)
  const url = page.url().replace(BASE, "")
  check("admin uses adminUsers_ prefix", url.includes("adminUsers_page=2"), url)
  check("no agentAnalytics_ leak", !url.includes("agentAnalytics_"), url)
  await ctx.close()
}

const readFilters = async (page) =>
  page
    .getByTestId("module-filters")
    .first()
    .textContent()
    .then((t) => JSON.parse(t))
    .catch(() => ({}))

// 5) Layer 1: invalid enum value in the URL never reaches state
{
  console.log("\n[5] invalid value in URL is sanitized at parse time")
  const { ctx, page } = await fresh()
  await page.goto(
    `${BASE}/platform/admin/users?adminUsers_roles=admin,wizard&adminUsers_page=abc`
  )
  await waitForRows(page)
  await page.waitForTimeout(300)
  const f = await readFilters(page)
  check(
    "array: invalid member 'wizard' dropped -> ['admin']",
    JSON.stringify(f.roles) === JSON.stringify(["admin"]),
    `roles=${JSON.stringify(f.roles)}`
  )
  check("page 'abc' -> 1 (shape-valid)", f.page === 1, `page=${f.page}`)
  await ctx.close()
}

// 6) Layer 2: out-of-range page clamps to the last page once data loads
{
  console.log("\n[6] out-of-range page clamps to last page after data loads")
  const { ctx, page } = await fresh()
  await page.goto(
    `${BASE}/platform/agents/agent-1/analytics?agentAnalytics_page=999`
  )
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await page.waitForTimeout(800)
  const s = await read(page)
  check("page clamped to 2 (URL)", s.urlPage === 2, s.url)
  check(
    "filters.page === 2 (state matches)",
    s.filtersPage === 2,
    `filters.page=${s.filtersPage}`
  )
  await ctx.close()
}

// 7) SHARED dimension: the date range is shared with the child (same hook, carried)
{
  console.log("\n[7] shared date range carries parent → child")
  const { ctx, page } = await fresh()
  await page.goto(`${BASE}/platform/agents/agent-1/analytics`)
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await page.getByRole("button", { name: "Set sample range" }).click()
  await page.waitForTimeout(400)
  check(
    "parent URL has adr_startDate",
    page.url().includes("adr_startDate"),
    page.url().replace(BASE, "")
  )
  const parentDates = await page.getByTestId("shared-dates").textContent()
  check("parent shows the date", parentDates.includes("2025-01-01"))

  await page.getByRole("link", { name: /Open case detail/ }).click()
  await page.getByRole("heading", { name: "Case detail" }).waitFor()
  await page.waitForTimeout(400)
  check(
    "child URL carries adr_startDate",
    page.url().includes("adr_startDate"),
    page.url().replace(BASE, "")
  )
  const childDates = await page.getByTestId("shared-dates").textContent()
  check("child shows the SAME date (shared)", childDates.includes("2025-01-01"))
  await ctx.close()
}

// 8) ISOLATED: same key name ("search") in parent and child, but separate state
{
  console.log("\n[8] same-named 'search' stays isolated parent vs child")
  const { ctx, page } = await fresh()
  await page.goto(`${BASE}/platform/agents/agent-1/analytics`)
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)

  await page.getByPlaceholder("filter by name").fill("abc")
  await page.waitForTimeout(400)
  check(
    "parent search -> agentAnalytics_search=abc",
    page.url().includes("agentAnalytics_search=abc"),
    page.url().replace(BASE, "")
  )

  await page.getByRole("link", { name: /Open case detail/ }).click()
  await page.getByRole("heading", { name: "Case detail" }).waitFor()
  await page.waitForTimeout(300)
  check(
    "parent search NOT carried to child",
    !page.url().includes("agentAnalytics_search"),
    page.url().replace(BASE, "")
  )
  const childFilters = await page.getByTestId("case-filters").textContent()
  check(
    "child's own search starts empty",
    JSON.parse(childFilters).search === ""
  )

  await page.getByTestId("case-search").fill("xyz")
  await page.waitForTimeout(400)
  check(
    "child search -> cad_search=xyz",
    page.url().includes("cad_search=xyz"),
    page.url().replace(BASE, "")
  )

  await page.getByRole("link", { name: /Back to analytics/ }).click()
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await page.waitForTimeout(700)
  const back = await readFilters(page)
  check(
    "parent search restored to 'abc'",
    back.search === "abc",
    `search=${JSON.stringify(back.search)}`
  )
  check(
    "child's 'xyz' did NOT leak to parent",
    !page.url().includes("cad_search"),
    page.url().replace(BASE, "")
  )
  await ctx.close()
}

// 9) Deep-link wins over the snapshot (URL is authoritative on mount)
{
  console.log("\n[9] deep-link value wins over the session snapshot")
  const { ctx, page } = await fresh()
  // Prime the snapshot with search "aaa".
  await page.goto(`${BASE}/platform/agents/agent-1/analytics`)
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await page.getByPlaceholder("filter by name").fill("aaa")
  await page.waitForTimeout(400)
  // Now deep-link a DIFFERENT value; the URL must win, not the snapshot.
  // (Don't waitForRows — "zzz" matches nothing; we only need the page mounted.)
  await page.goto(
    `${BASE}/platform/agents/agent-1/analytics?agentAnalytics_search=zzz`
  )
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await page.waitForTimeout(700)
  const f = await readFilters(page)
  check(
    "URL 'zzz' wins over snapshot 'aaa'",
    f.search === "zzz",
    `search=${JSON.stringify(f.search)}`
  )
  await ctx.close()
}

// 10) A SHARED dimension is still scoped per entity (not global)
{
  console.log("\n[10] shared date range is scoped per entity")
  const { ctx, page } = await fresh()
  await page.goto(`${BASE}/platform/agents/agent-1/analytics`)
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await page.getByRole("button", { name: "Set sample range" }).click()
  await page.waitForTimeout(400)
  // Switch to agent-2 via the in-app nav link (soft) — must NOT inherit agent-1's date.
  await page.getByRole("link", { name: "agent-2 analytics" }).click()
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await page.waitForTimeout(500)
  const d2 = await page.getByTestId("shared-dates").textContent()
  check(
    "agent-2 has no date (scoped)",
    d2.includes('"startDate": null'),
    d2.replace(/\s+/g, " ").trim()
  )
  // Back to agent-1 (soft nav) — date restored.
  await page.getByRole("link", { name: "agent-1 analytics" }).click()
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await page.waitForTimeout(500)
  const d1 = await page.getByTestId("shared-dates").textContent()
  check("agent-1 date restored", d1.includes("2025-01-01"))
  await ctx.close()
}

// 11) Two namespaces live on ONE page don't clobber each other
{
  console.log(
    "\n[11] same-page namespaces are independent (adr vs agentAnalytics)"
  )
  const { ctx, page } = await fresh()
  await page.goto(`${BASE}/platform/agents/agent-1/analytics`)
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await page.getByRole("button", { name: "Set sample range" }).click()
  await page.getByPlaceholder("filter by name").fill("abc")
  await page.waitForTimeout(400)
  check(
    "both namespaces in URL",
    page.url().includes("adr_startDate") &&
      page.url().includes("agentAnalytics_search=abc"),
    page.url().replace(BASE, "")
  )
  // Change search -> date untouched.
  await page.getByPlaceholder("filter by name").fill("xyz")
  await page.waitForTimeout(400)
  check(
    "changing search leaves the date",
    page.url().includes("adr_startDate") &&
      page.url().includes("agentAnalytics_search=xyz"),
    page.url().replace(BASE, "")
  )
  // Clear the date -> search untouched.
  await page.getByRole("button", { name: "Clear dates" }).click()
  await page.waitForTimeout(400)
  check(
    "clearing the date leaves the search",
    !page.url().includes("adr_") &&
      page.url().includes("agentAnalytics_search=xyz"),
    page.url().replace(BASE, "")
  )
  await ctx.close()
}

// 12) Array multi-select: live round-trip through the URL
{
  console.log("\n[12] array multi-select round-trips through the URL")
  const { ctx, page } = await fresh()
  await page.goto(`${BASE}/platform/admin/users`)
  await waitForRows(page)
  await page.getByTestId("multi-admin").click()
  await page.getByTestId("multi-editor").click()
  await page.waitForTimeout(400)
  check(
    "URL has roles=admin,editor",
    /adminUsers_roles=admin%2Ceditor|adminUsers_roles=admin,editor/.test(
      page.url()
    ),
    page.url().replace(BASE, "")
  )
  const f = await readFilters(page)
  check(
    "filters.roles === ['admin','editor']",
    JSON.stringify(f.roles) === JSON.stringify(["admin", "editor"]),
    `roles=${JSON.stringify(f.roles)}`
  )
  // Untick one -> array updates.
  await page.getByTestId("multi-admin").click()
  await page.waitForTimeout(400)
  const f2 = await readFilters(page)
  check(
    "untick admin -> ['editor']",
    JSON.stringify(f2.roles) === JSON.stringify(["editor"]),
    `roles=${JSON.stringify(f2.roles)}`
  )
  await ctx.close()
}

// 13) Rich multi-namespace deep link wins over PRIMED snapshots (shareability)
//     Guards the timing-coupling regression: a shared link with many filters
//     across namespaces must render exactly what was sent, never stale session state.
{
  console.log("\n[13] big multi-namespace deep link beats primed snapshots")
  const { ctx, page } = await fresh()

  // Prime stale snapshots for agent-1: search "aaa" + a 2025 date range.
  await page.goto(`${BASE}/platform/agents/agent-1/analytics`)
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await page.getByPlaceholder("filter by name").fill("aaa")
  await page.getByRole("button", { name: "Set sample range" }).click() // adr = 2025-01-01
  await page.waitForTimeout(400)

  // Now open a rich deep link with DIFFERENT values across both namespaces.
  const deep =
    `${BASE}/platform/agents/agent-1/analytics` +
    `?agentAnalytics_page=2&agentAnalytics_search=agent&agentAnalytics_orderBy=createdAt` +
    `&adr_startDate=2024-06-01T00:00:00.000Z&adr_endDate=2024-09-01T00:00:00.000Z`
  await page.goto(deep)
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await page.waitForTimeout(700)

  const f = await readFilters(page)
  check("search = link's 'agent' (not snapshot 'aaa')", f.search === "agent", `search=${JSON.stringify(f.search)}`)
  check("orderBy = link's 'createdAt'", f.orderBy === "createdAt", `orderBy=${JSON.stringify(f.orderBy)}`)
  check("page = link's 2", f.page === 2, `page=${f.page}`)
  const dates = await page.getByTestId("shared-dates").textContent()
  check("date = link's 2024-06 (not snapshot 2025-01)", dates.includes("2024-06-01") && !dates.includes("2025-01-01"), dates.replace(/\s+/g, " ").trim())
  await ctx.close()
}

// 14) Clear FORGETS across navigation (but plain nav-back restores — scenario 1)
{
  console.log("\n[14] clear drops the snapshot; nav-back does NOT resurrect it")
  const { ctx, page } = await fresh()
  await page.goto(`${BASE}/platform/agents/agent-1/analytics`)
  await goPage2(page) // page 2 -> snapshot now holds page=2
  check("set up: URL on page 2", page.url().includes("agentAnalytics_page=2"), page.url().replace(BASE, ""))

  // Explicit clear (ModuleView "Clear filters" -> hook reset).
  await page.getByRole("button", { name: "Clear filters" }).click()
  await page.waitForTimeout(300)
  check("clear empties the URL", !page.url().includes("agentAnalytics_page"), page.url().replace(BASE, ""))

  // Navigate away and back to the BARE page — must stay cleared (no resurrection).
  await page.getByRole("link", { name: /Open case detail/ }).click()
  await page.getByRole("heading", { name: "Case detail" }).waitFor()
  await page.getByRole("link", { name: /Back to analytics/ }).click()
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await page.waitForTimeout(800)
  const s = await read(page)
  check("after clear + nav round-trip, still page 1 (not resurrected)", s.urlPage === 1 && s.filtersPage === 1, `${s.url} filters=${s.filtersPage}`)
  await ctx.close()
}

// 15) Hard load of a bare URL is authoritative — does NOT restore (the manual-clear bug)
{
  console.log("\n[15] hard load / manual URL clear stays bare (URL wins)")
  const { ctx, page } = await fresh()
  // Land on a filtered page (writes the snapshot).
  await page.goto(`${BASE}/platform/admin/users?adminUsers_orderBy=createdAt`)
  await waitForRows(page)
  check("filtered load: orderBy in URL", page.url().includes("adminUsers_orderBy=createdAt"), page.url().replace(BASE, ""))

  // Simulate clearing the URL by hard-loading the bare page (fresh document load,
  // like editing the address bar). Must NOT auto-restore orderBy.
  await page.goto(`${BASE}/platform/admin/users`)
  await waitForRows(page)
  await page.waitForTimeout(500)
  const f = await readFilters(page)
  check("bare hard load stays bare (no resurrection)", !page.url().includes("adminUsers_orderBy") && f.orderBy === "", `${page.url().replace(BASE, "")} orderBy=${JSON.stringify(f.orderBy)}`)
  await ctx.close()
}

console.log(`\n${failures === 0 ? "ALL PASS ✓" : `${failures} FAILURE(S) ✗`}`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
