import { expect, test } from "@playwright/test";

test.describe("Route Authentication Guards", () => {
  test("unauthenticated access to /dashboard redirects to sign-in", async ({ page }) => {
    const response = await page.goto("/dashboard");
    expect(response).not.toBeNull();
    // Clerk middleware protects /dashboard and redirects unauthenticated visits to /sign-in
    await page.waitForURL(/sign-in/, { timeout: 10_000 });
    expect(page.url()).toContain("sign-in");
  });

  test("unauthenticated access to /admin redirects to sign-in", async ({ page }) => {
    const response = await page.goto("/admin");
    expect(response).not.toBeNull();
    await page.waitForURL(/sign-in/, { timeout: 10_000 });
    expect(page.url()).toContain("sign-in");
  });

  test("unauthenticated access to /workspace redirects to sign-in", async ({ page }) => {
    const response = await page.goto("/workspace");
    expect(response).not.toBeNull();
    await page.waitForURL(/sign-in/, { timeout: 10_000 });
    expect(page.url()).toContain("sign-in");
  });
});
