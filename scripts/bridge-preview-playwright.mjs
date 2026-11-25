import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.BRIDGE_BASE_URL;
if (!baseURL) throw new Error("BRIDGE_BASE_URL is required.");
const target = new URL(baseURL);
const allowedPreviewHost = "bridge-lyfdfrxns-stream-vista-opc-pvt-ltd-s-projects.vercel.app";
if (target.protocol !== "https:" || target.hostname !== allowedPreviewHost) {
  throw new Error("Safety stop: tests are pinned to the approved Crayons Bridge Testing Preview deployment only.");
}

const headers = {};
if (process.env.VERCEL_PROTECTION_BYPASS) {
  headers["x-vercel-protection-bypass"] = process.env.VERCEL_PROTECTION_BYPASS;
  headers["x-vercel-set-bypass-cookie"] = "true";
}
const draftTitleId = process.env.BRIDGE_E2E_DRAFT_TITLE_ID ?? "test-fixture-free-video-20261124";
const draftTitleName = process.env.BRIDGE_E2E_DRAFT_TITLE_NAME ?? "[TEST ONLY] Free Video Route Fixture";
const accounts = process.env.BRIDGE_E2E_ACCOUNTS_JSON
  ? JSON.parse(process.env.BRIDGE_E2E_ACCOUNTS_JSON)
  : [];
const expectedHomes = {
  creator: "/creator",
  studio: "/studio",
  buyer: "/buyer",
  super_admin: "/dashboard",
};
const results = [];
let browser;

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (error) {
    results.push({ name, status: "FAIL", reason: error instanceof Error ? error.message : String(error) });
    console.error("FAIL", name, error instanceof Error ? error.message : String(error));
  }
}

function assertNotVercelSso(page) {
  const current = new URL(page.url());
  assert.ok(
    !current.hostname.endsWith("vercel.com") && !current.pathname.includes("sso-api"),
    "Preview is protected by Vercel SSO. Supply the Preview-only VERCEL_PROTECTION_BYPASS secret to this workflow.",
  );
}

async function signIn(account) {
  const context = await browser.newContext({ extraHTTPHeaders: headers });
  const page = await context.newPage();
  await page.goto(new URL("/login", baseURL).toString(), { waitUntil: "domcontentloaded" });
  assertNotVercelSso(page);
  await page.getByRole("heading", { name: "Sign in" }).waitFor({ state: "visible" });
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(url => url.pathname === account.home || url.pathname.startsWith(account.home + "/"), { timeout: 30_000 });
  return { context, page };
}

try {
  browser = await chromium.launch({ headless: true });

  await check("Preview HTTP homepage and six workflow stages", async () => {
    const context = await browser.newContext({ extraHTTPHeaders: headers });
    try {
      const page = await context.newPage();
      const response = await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      assertNotVercelSso(page);
      assert.equal(response?.status(), 200, "Homepage did not return HTTP 200.");
      await page.getByRole("heading", { name: "One bridge from content to market." }).waitFor({ state: "visible" });
      for (const stage of ["Upload", "QC", "Rights", "License", "Deliver", "Earn"]) {
        await page.getByRole("heading", { name: stage, exact: true }).waitFor({ state: "visible" });
      }
      for (const role of ["Creators", "Studios", "Investors", "Buyers"]) {
        await page.getByRole("heading", { name: role, exact: true }).waitFor({ state: "visible" });
      }
    } finally {
      await context.close();
    }
  });

  await check("Sign-in and account-registration routes", async () => {
    const context = await browser.newContext({ extraHTTPHeaders: headers });
    try {
      const page = await context.newPage();
      await page.goto(new URL("/login", baseURL).toString(), { waitUntil: "domcontentloaded" });
      assertNotVercelSso(page);
      await page.getByLabel("Email").waitFor({ state: "visible" });
      await page.getByLabel("Password").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Sign in" }).waitFor({ state: "visible" });
      for (const role of ["creator", "studio", "buyer"]) {
        await page.goto(new URL(`/signup?role=${role}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: "Create an account" }).waitFor({ state: "visible" });
        await page.getByRole("radiogroup").waitFor({ state: "visible" });
      }
      await page.goto(new URL("/signup?role=investor", baseURL).toString(), { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Investor access" }).waitFor({ state: "visible" });
    } finally {
      await context.close();
    }
  });

  await check("Unauthenticated Buyer poster API rejects access", async () => {
    const context = await browser.newContext({ extraHTTPHeaders: headers });
    try {
      const response = await context.request.get(
        new URL(`/api/buyer/poster?titleId=${encodeURIComponent(draftTitleId)}`, baseURL).toString(),
        { maxRedirects: 0 },
      );
      assert.equal(response.status(), 401, `Unauthenticated poster API request should return HTTP 401; got ${response.status()} (a 302 indicates Preview SSO blocked the request).`);
    } finally {
      await context.close();
    }
  });

  if (!Array.isArray(accounts) || accounts.some(a => !a || !expectedHomes[a.role] || !a.email || !a.password)) {
    throw new Error("BRIDGE_E2E_ACCOUNTS_JSON must be an array of {role,email,password}; roles: creator, studio, buyer, super_admin.");
  }

  if (accounts.length === 0) {
    console.log("SKIP authenticated account checks: BRIDGE_E2E_ACCOUNTS_JSON is not configured.");
  }

  const observedUserIds = new Set();
  for (const account of accounts) {
    await check(`${account.role} login and workspace access`, async () => {
      const session = await signIn({ ...account, home: expectedHomes[account.role] });
      try {
        if (account.role === "buyer") {
          await session.page.getByRole("heading", { name: "Buyer Gallery" }).waitFor({ state: "visible" });
          const body = await session.page.locator("body").innerText();
          assert.ok(!body.includes(draftTitleName), "DRAFT fixture appeared in Buyer Gallery.");
        }

        if (account.role === "super_admin") {
          await session.page.goto(new URL("/buyer", baseURL).toString(), { waitUntil: "domcontentloaded" });
          await session.page.getByRole("heading", { name: "Buyer Gallery" }).waitFor({ state: "visible" });
          assert.equal(await session.page.getByRole("button", { name: "License", exact: true }).count(), 0,
            "Super Admin Buyer Gallery must be read-only.");
        }

        if (account.role === "creator") {
          await session.page.goto(new URL(`/title/${draftTitleId}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
          assertNotVercelSso(session.page);
          await session.page.getByText(draftTitleName, { exact: false }).waitFor({ state: "visible" });
          await session.page.getByRole("button", { name: "Start ingest" }).waitFor({ state: "visible" });
          assert.equal(await session.page.getByRole("button", { name: "Submit for QC" }).count(), 0,
            "A DRAFT title must not expose Submit for QC.");
          if (process.env.BRIDGE_E2E_PREPARING_TITLE_ID) {
            await session.page.goto(new URL(`/title/${process.env.BRIDGE_E2E_PREPARING_TITLE_ID}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
            const submitQc = session.page.getByRole("button", { name: "Submit for QC" });
            await submitQc.waitFor({ state: "visible" });
            assert.equal(await submitQc.isDisabled(), true, "PREPARING title without verified current master and poster must not submit for QC.");
          }
        }

        if (account.role === "buyer") {
          await session.page.goto(new URL(`/title/${draftTitleId}`, baseURL).toString(), { waitUntil: "domcontentloaded" });
          assertNotVercelSso(session.page);
          const body = await session.page.locator("body").innerText();
          assert.ok(!body.includes(draftTitleName), "Buyer could access a creator-owned DRAFT title.");
        }

        const userId = await session.page.evaluate(() => {
          const raw = localStorage.getItem("crayons-bridge.sb-auth-token");
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          return parsed?.user?.id ?? null;
        });
        assert.ok(userId, "Authenticated Supabase user ID was not present in this isolated browser context.");
        assert.ok(!observedUserIds.has(userId), "Two Testing accounts resolved to the same authenticated user ID.");
        observedUserIds.add(userId);
      } finally {
        await session.context.close();
      }
    });
  }
} finally {
  await browser?.close();
}

const passed = results.filter(result => result.status === "PASS").length;
const failed = results.filter(result => result.status === "FAIL").length;
console.log(`\nPreview Playwright result: ${passed} passed, ${failed} failed, ${results.length} executed.`);
if (failed > 0) process.exitCode = 1;
