import { expect, test } from "@playwright/test";

test.describe("Home Page and Navigation", () => {
  test("renders landing page hero and branding", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/UniMind AI/i);

    const heading = page.getByRole("heading", {
      name: "Your university, made easier to navigate.",
    });
    await expect(heading).toBeVisible();

    const dashboardLink = page.getByRole("link", { name: "Open dashboard" });
    await expect(dashboardLink).toBeVisible();
    await expect(dashboardLink).toHaveAttribute("href", "/dashboard");

    const signInLink = page.getByRole("link", { name: "Sign in" });
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveAttribute("href", "/sign-in");

    const signUpLink = page.getByRole("link", { name: "Create account" });
    await expect(signUpLink).toBeVisible();
    await expect(signUpLink).toHaveAttribute("href", "/sign-up");
  });
});
