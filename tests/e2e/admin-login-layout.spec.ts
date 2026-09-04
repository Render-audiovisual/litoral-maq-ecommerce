import { expect, test } from "@playwright/test";

test("el acceso administrativo cubre todo el alto en una pantalla grande", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/admin/login/");

  const layout = page.locator(".admin-auth-page");
  const visual = page.locator(".auth-panel.visual");
  await expect(layout).toBeVisible();
  await expect(visual).toBeVisible();

  const dimensions = await page.evaluate(() => {
    const layoutRect = document.querySelector(".admin-auth-page")?.getBoundingClientRect();
    const visualRect = document.querySelector(".auth-panel.visual")?.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      layoutBottom: layoutRect?.bottom ?? 0,
      visualBottom: visualRect?.bottom ?? 0,
    };
  });

  expect(dimensions.layoutBottom).toBeGreaterThanOrEqual(dimensions.viewportHeight - 1);
  expect(dimensions.visualBottom).toBeGreaterThanOrEqual(dimensions.viewportHeight - 1);
});
