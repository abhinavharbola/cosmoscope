import { test, expect } from "@playwright/test";
import { installStubs, watch, bootDone, settled } from "./harness.mjs";
import { buildFixtureText } from "../missions-fixture.mjs";

const CATALOG = buildFixtureText();
const WHEN = "t=2021-03-01T00:00:00Z&s=1";

async function serveCatalog(page) {
  await installStubs(page);
  await page.route("**/data/missions.json", (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: CATALOG })
  );
}

test.describe("missions", () => {
  test.describe.configure({ mode: "serial" });

  let page;
  let problems;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    problems = watch(page);
    await serveCatalog(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("the index lists a loaded mission under its kind", async () => {
    test.setTimeout(400000);
    await page.goto(`/#${WHEN}`);
    await bootDone(page);
    await expect(page.locator("#index .index-sub")).toHaveText(["Spacecraft"]);
    const rows = page.locator("#index .body-row.craft");
    await expect(rows).toHaveCount(1);
    await expect(rows.locator("span:first-child")).toHaveText("Test Probe");
    await expect(rows.locator(".au")).not.toHaveText("");
  });

  test("focusing it shows its plate, title and a shareable hash", async () => {
    await page.locator("#index .body-row.craft").click();
    await expect(page.locator("#plate")).toBeVisible();
    await expect(page.locator("#plate-name")).toHaveText("Test Probe");
    await expect(page).toHaveTitle("Test Probe | Cosmos");
    await expect(page.locator("#plate .meter-wrap")).toBeHidden();
    await expect(page.locator("#plate-table")).toContainText("Tracked");
    await expect(page.locator("#plate-src")).toContainText("Horizons");
    await settled(page);
    await expect.poll(() => page.evaluate(() => location.hash)).toContain("f=TestProbe");
    await page.screenshot({ path: "test-results/screens/missions-focus.png" });
  });

  test("a planet restores the size meter, and the missions toggle works from the View menu", async () => {
    await page.keyboard.press("4");
    await expect(page.locator("#plate-name")).toHaveText("Mars");
    await expect(page.locator("#plate .meter-wrap")).toBeVisible();
    await page.locator("#btn-view").click();
    const toggle = page.locator("#btn-missions");
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText("On");
    await toggle.click();
    await expect(toggle).toContainText("Off");
    await expect.poll(() => page.evaluate(() => location.hash)).toContain("m=0");
    await toggle.click();
    await expect(toggle).toContainText("On");
    await page.keyboard.press("Escape");
  });

  test("the session produced no console errors or failed requests", async () => {
    expect(problems).toEqual([]);
  });
});

test("a link that names a mission focuses it once the catalog has loaded", async ({ page }) => {
  test.setTimeout(240000);
  const problems = watch(page);
  await serveCatalog(page);
  await page.goto(`/#f=TestProbe&${WHEN}`);
  await bootDone(page);
  await expect(page.locator("#plate-name")).toHaveText("Test Probe");
  await expect(page.locator("#index .body-row.craft")).toHaveClass(/active/);
  expect(problems).toEqual([]);
});

test("without a catalog the app still starts and shows no mission controls", async ({ page }) => {
  test.setTimeout(240000);
  const problems = watch(page);
  await installStubs(page);
  await page.route("**/data/missions.json", (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ version: 1, objects: {} }) })
  );
  await page.goto(`/#f=TestProbe&${WHEN}`);
  await bootDone(page);
  await expect(page.locator("#fatal")).toBeHidden();
  await expect(page.locator("#plate")).toBeHidden();
  await expect(page.locator("#index .body-row.craft")).toHaveCount(0);
  await page.locator("#btn-view").click();
  await expect(page.locator("#btn-missions")).toBeHidden();
  expect(problems).toEqual([]);
});
