import { test, expect, type Browser, type Page } from "@playwright/test";

type TestAccount = {
  role: "creator" | "studio" | "buyer" | "super_admin";
  email: string;
  password: string;
  home: string;
};

const accounts: TestAccount[] = (() => {
  const raw = process.env.BRIDGE_E2E_ACCOUNTS_JSON;
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("BRIDGE_E2E_ACCOUNTS_JSON must be a JSON array.");
  return parsed as TestAccount[];
})();

const draftTitleId = process.env.BRIDGE_E2E_DRAFT_TITLE_ID ?? "test-fixture-free-video-20261124";
const draftTitleName = process.env.BRIDGE_E2E_DRAFT_TITLE_NAME ?? "[TEST ONLY] Free Video Route Fixture";

async function signIn(browser: Browser, account: TestAccount): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(account.home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:[/?#]|$)"), { timeout: 30_000 });
  return { page, close: () => context.close() };
}

test("public homepage exposes the Crayons Bridge entry points and six workflow stages", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "One bridge from content to market." })).toBeVisible();
  for (const stage of ["Upload", "QC", "Rights", "License", "Deliver", "Earn"]) {
    await expect(page.getByRole("heading", { name: stage, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Create account" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Creators" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Studios" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Investors" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buyers" })).toBeVisible();
});

test("sign-in and public signup entry routes render without submitting data", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  for (const role of ["creator", "studio", "buyer"]) {
    await page.goto(`/signup?role=${role}`);
    await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
    await expect(page.getByRole("radiogroup")).toBeVisible();
  }
  await page.goto("/signup?role=investor");
  await expect(page.getByRole("heading", { name: "Investor access" })).toBeVisible();
});

test.describe("authenticated Testing accounts — read-only navigation", () => {
  test.skip(accounts.length === 0, "Provide BRIDGE_E2E_ACCOUNTS_JSON through a protected CI secret to run authenticated checks.");

  for (const account of accounts) {
    test(`${account.role} can sign in and reach its assigned workspace`, async ({ browser }) => {
      const session = await signIn(browser, account);
      try {
        if (account.role === "buyer") {
          await expect(session.page.getByRole("heading", { name: "Buyer Gallery" })).toBeVisible();
          await expect(session.page.getByText(draftTitleName, { exact: false })).toHaveCount(0);
          await expect(session.page.getByRole("button", { name: "License", exact: true })).toHaveCount(0);
        }

        if (account.role === "super_admin") {
          await session.page.goto("/buyer");
          await expect(session.page.getByRole("heading", { name: "Buyer Gallery" })).toBeVisible();
          await expect(session.page.getByRole("button", { name: "License", exact: true })).toHaveCount(0);
        }

        if (account.role === "creator") {
          await session.page.goto(`/title/${draftTitleId}`);
          await expect(session.page.getByText(draftTitleName, { exact: false })).toBeVisible();
          const submitQc = session.page.getByRole("button", { name: "Submit for QC" });
          await expect(submitQc).toBeDisabled();
        }

        if (account.role === "buyer") {
          // A buyer must not be able to open a creator-owned DRAFT title.
          await session.page.goto(`/title/${draftTitleId}`);
          await expect(session.page.getByText(draftTitleName, { exact: false })).toHaveCount(0);
        }
      } finally {
        await session.close();
      }
    });
  }

  test("each configured account uses an independent browser session", async ({ browser }) => {
    test.skip(accounts.length < 2, "At least two Testing accounts are required for session-isolation verification.");
    const observedUserIds = new Set<string>();

    for (const account of accounts) {
      const session = await signIn(browser, account);
      try {
        const stored = await session.page.evaluate(() => {
          const raw = localStorage.getItem("crayons-bridge.sb-auth-token");
          if (!raw) return null;
          const parsed = JSON.parse(raw) as { user?: { id?: string } };
          return parsed.user?.id ?? null;
        });
        expect(stored, `Missing authenticated session for ${account.role}`).toBeTruthy();
        expect(observedUserIds.has(stored as string), "Two test accounts resolved to the same auth user ID.").toBe(false);
        observedUserIds.add(stored as string);
      } finally {
        await session.close();
      }
    }
  });
});
