import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { assertPinsMatch, installStubs, watch, bootDone, centerStats } from "./harness.mjs";

const BODIES = ["Sun", "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Moon"];
const SHOTS = "test-results/screens";
const FIXED_TIME = "t=2026-11-01T12:00:00Z&s=1";

test.beforeAll(async () => {
  await assertPinsMatch();
  await mkdir(SHOTS, { recursive: true });
});

test.describe("session", () => {
  test.describe.configure({ mode: "serial" });

  let page;
  let problems;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    problems = watch(page);
    await installStubs(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("starts, clears the intro and compiles shaders", async () => {
    test.setTimeout(400000);
    await page.goto(`/#${FIXED_TIME}`);
    await bootDone(page);
    await expect(page.locator("#fatal")).toBeHidden();
    await expect(page.locator("#intro")).toHaveCount(0);
    await expect(page).toHaveTitle("Cosmos");
    await page.keyboard.press("d");
    await expect(page.locator("#diag")).toBeVisible();
    await expect(page.locator("#diag")).toContainText("Shader fallback: no");
    await expect(page.locator("#diag")).not.toContainText("building", { timeout: 200000 });
    await page.keyboard.press("d");
    await expect(page.locator("#diag")).toBeHidden();
  });

  test("the index lists every body", async () => {
    const rows = page.locator("#index .body-row");
    await expect(rows).toHaveCount(BODIES.length);
    const names = await rows.locator("span:first-child").allTextContents();
    expect(names.sort()).toEqual([...BODIES].sort());
  });

  for (const id of BODIES) {
    test(`index click focuses ${id}, renders it and the cursor picks it`, async () => {
      const row = page.locator("#index .body-row", { has: page.locator(`span:first-child:text-is("${id}")`) });
      await row.click();
      await expect(row).toHaveClass(/active/);
      await expect(page.locator("#plate")).toBeVisible();
      await expect(page.locator("#plate-name")).toHaveText(id);
      await expect(page).toHaveTitle(`${id} | Cosmos`);
      await page.waitForTimeout(2800);

      const view = page.viewportSize();
      await page.mouse.move(view.width / 2, view.height / 2);
      await expect.poll(() => page.evaluate(() => document.getElementById("stage").style.cursor)).toBe("pointer");
      await page.mouse.move(view.width - 4, view.height - 4);
      await page.mouse.move(view.width - 6, view.height - 6);
      await expect.poll(() => page.evaluate(() => document.getElementById("stage").style.cursor)).toBe("grab");

      const index = BODIES.indexOf(id) + 1;
      const file = `${SHOTS}/${String(index).padStart(2, "0")}-${id}.png`;
      const shot = await page.screenshot({ path: file });
      const stats = await centerStats(page, shot);
      expect(stats.mean, `${id} center is black`).toBeGreaterThan(2);
      expect(stats.std, `${id} center is flat`).toBeGreaterThan(0.5);
    });
  }

  test("the system overview and a label click work", async () => {
    await page.locator("#index .views button", { hasText: "System" }).click();
    await expect(page).toHaveTitle("Cosmos");
    await expect(page.locator("#plate")).toBeHidden();
    await page.waitForTimeout(2800);
    await page.screenshot({ path: `${SHOTS}/00-System.png` });
    const label = page.locator("#labels .label", { hasText: "Jupiter" });
    await expect(label).toBeVisible();
    await label.click();
    await expect(page.locator("#plate-name")).toHaveText("Jupiter");
  });

  test("number keys and the inner view change focus", async () => {
    await page.keyboard.press("4");
    await expect(page.locator("#plate-name")).toHaveText("Mars");
    await page.keyboard.press("m");
    await expect(page.locator("#plate-name")).toHaveText("Moon");
    await page.keyboard.press("i");
    await expect(page.locator("#index .views button", { hasText: "Inner" })).toHaveClass(/active/);
    await page.waitForTimeout(2800);
    await page.screenshot({ path: `${SHOTS}/00-Inner.png` });
  });

  test("each menu opens and Escape closes it without moving focus", async () => {
    await page.keyboard.press("4");
    await expect(page.locator("#plate-name")).toHaveText("Mars");
    for (const [button, pop] of [
      ["#btn-jump", "#jump"],
      ["#btn-view", "#view"],
    ]) {
      await page.locator(button).click();
      await expect(page.locator(pop)).toBeVisible();
      await expect(page.locator(button)).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(page.locator(pop)).toBeHidden();
      await expect(page.locator(button)).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("#plate-name")).toHaveText("Mars");
    }
  });

  test("the help dialog opens from the menu and from the keyboard, and Escape closes it", async () => {
    await page.locator("#btn-view").click();
    await page.locator("#btn-help").click();
    await expect(page.locator("#help")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#help")).toBeHidden();
    await page.keyboard.press("?");
    await expect(page.locator("#help")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#help")).toBeHidden();
    await expect(page.locator("#plate-name")).toHaveText("Mars");
  });

  test("view toggles and the NASA dispatch panel respond", async () => {
    const sizes = page.locator("#btn-sizes");
    await page.locator("#btn-view").click();
    await expect(sizes).toContainText("Exaggerated");
    await sizes.click();
    await expect(sizes).toContainText("True scale");
    await sizes.click();
    await expect(sizes).toContainText("Exaggerated");
    await page.keyboard.press("Escape");

    await page.locator("#dispatch-toggle").click();
    await expect(page.locator("#dispatch")).toBeVisible();
    await expect(page.locator("#dispatch-body")).toContainText("Near-Earth objects");
    await page.locator("#dispatch-toggle").click();
    await expect(page.locator("#dispatch")).toBeHidden();
  });

  test("a light pulse starts and stops", async () => {
    await page.locator("#btn-pulse").click();
    await expect(page.locator("#ruler")).toBeVisible();
    await page.locator("#ruler-close").click();
    await expect(page.locator("#ruler")).toBeHidden();
  });

  test("Escape with nothing open returns to the whole system", async () => {
    await page.keyboard.press("Escape");
    await expect(page).toHaveTitle("Cosmos");
    await expect(page.locator("#index .views button", { hasText: "System" })).toHaveClass(/active/);
  });

  test("the session produced no console errors, failed requests or texture failures", async () => {
    expect(problems).toEqual([]);
  });
});

test("the hash #f=constructor still starts the app at the system view", async ({ page }) => {
  test.setTimeout(240000);
  const problems = watch(page);
  await installStubs(page);
  await page.goto("/#f=constructor");
  await bootDone(page);
  await expect(page.locator("#fatal")).toBeHidden();
  await expect(page).toHaveTitle("Cosmos");
  await expect(page.locator("#plate")).toBeHidden();
  await expect(page.locator("#index .views button", { hasText: "System" })).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => location.hash)).not.toContain("constructor");
  expect(problems).toEqual([]);
});
