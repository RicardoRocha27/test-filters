import { chromium } from "playwright"

const BASE = process.env.BASE ?? "http://localhost:3334"
const browser = await chromium.launch()
let failures = 0

const read = async (page, prefix = "agentAnalytics") => {
  const url = page.url().replace(BASE, "")
  const m = url.match(new RegExp(`${prefix}_page=(\\d+)`))
  const urlPage = m ? Number(m[1]) : 1
  const filtersPage = await page
    .locator("pre").first().textContent()
    .then((t) => (t ? JSON.parse(t).page : 1)).catch(() => 1)
  return { url, urlPage, filtersPage }
}

const check = (name, cond, detail) => {
  console.log(`  ${cond ? "✓" : "✗ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
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
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Next")
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
  check("filters.page === 2 (table matches URL)", s.filtersPage === 2, `filters.page=${s.filtersPage}`)
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
  check("filters.page === 2", s.filtersPage === 2, `filters.page=${s.filtersPage}`)
  await ctx.close()
}

// 3) Rescope: each agent keeps its own filters; switching shows the other's
{
  console.log("\n[3] rescope on entity change (agent-1 vs agent-2)")
  const { ctx, page } = await fresh()
  await page.goto(`${BASE}/platform/agents/agent-1/analytics`)
  await goPage2(page) // agent-1 -> page 2
  await page.goto(`${BASE}/platform/agents/agent-2/analytics`)
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await page.waitForTimeout(800)
  let s = await read(page)
  check("agent-2 starts clean (page=1)", s.urlPage === 1 && s.filtersPage === 1, s.url)
  // back to agent-1 -> should restore page 2
  await page.goto(`${BASE}/platform/agents/agent-1/analytics`)
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await page.waitForTimeout(800)
  s = await read(page)
  check("agent-1 restores page=2", s.urlPage === 2 && s.filtersPage === 2, `${s.url} filters=${s.filtersPage}`)
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
  page.locator("pre").first().textContent().then((t) => JSON.parse(t)).catch(() => ({}))

// 5) Layer 1: invalid enum value in the URL never reaches state
{
  console.log("\n[5] invalid value in URL is sanitized at parse time")
  const { ctx, page } = await fresh()
  await page.goto(`${BASE}/platform/admin/users?adminUsers_role=wizard&adminUsers_page=abc`)
  await waitForRows(page)
  await page.waitForTimeout(300)
  const f = await readFilters(page)
  check("role 'wizard' -> null (treated as all)", f.role === null, `role=${JSON.stringify(f.role)}`)
  check("page 'abc' -> 1 (shape-valid)", f.page === 1, `page=${f.page}`)
  await ctx.close()
}

// 6) Layer 2: out-of-range page clamps to the last page once data loads
{
  console.log("\n[6] out-of-range page clamps to last page after data loads")
  const { ctx, page } = await fresh()
  await page.goto(`${BASE}/platform/agents/agent-1/analytics?agentAnalytics_page=999`)
  await page.getByRole("heading", { name: "Agent · Analytics" }).waitFor()
  await waitForRows(page)
  await page.waitForTimeout(800)
  const s = await read(page)
  check("page clamped to 2 (URL)", s.urlPage === 2, s.url)
  check("filters.page === 2 (state matches)", s.filtersPage === 2, `filters.page=${s.filtersPage}`)
  await ctx.close()
}

console.log(`\n${failures === 0 ? "ALL PASS ✓" : `${failures} FAILURE(S) ✗`}`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
