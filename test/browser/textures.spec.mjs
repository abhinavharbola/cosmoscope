import { test, expect } from "@playwright/test";
import { encodePng } from "../../tools/png.mjs";
import { assertPinsMatch, installStubs, watch, bootDone } from "./harness.mjs";

const solid = (r, g, b) => {
  const rgba = new Uint8Array(64 * 32 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
  }
  return Buffer.from(encodePng(64, 32, rgba));
};

const IMAGES = {
  "Earth/2k/map.png": solid(40, 90, 160),
  "Earth/2k/lights.png": solid(30, 20, 0),
  "Earth/2k/cloudMask.png": solid(200, 200, 200),
  "Earth/4k/map.png": solid(60, 140, 60),
  "Moon/2k/map.png": solid(130, 130, 130),
  "Moon/2k/bump.png": solid(128, 128, 128),
};

const MANIFEST = {
  version: 2,
  bodies: {
    Earth: {
      credit: "Fixture Earth credit",
      license: "Public domain",
      url: "https://example.invalid/earth",
      note: "Fixture note.",
      centerLon: 90,
      tiers: {
        "2k": { map: "Earth/2k/map.png", lights: "Earth/2k/lights.png", cloudMask: "Earth/2k/cloudMask.png" },
        "4k": { map: "Earth/4k/map.png" },
      },
    },
    Moon: {
      credit: "Fixture Moon credit",
      license: "Public domain",
      bumpScale: 2,
      tiers: { "2k": { map: "Moon/2k/map.png", bump: "Moon/2k/bump.png" } },
    },
    Mars: {
      credit: "Hostile entry",
      tiers: { "2k": { map: "../README.md" } },
    },
  },
};

test.beforeAll(async () => {
  await assertPinsMatch();
});

test.describe("real textures", () => {
  test.describe.configure({ mode: "serial" });

  let page;
  let problems;
  const requested = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    problems = watch(page);
    await installStubs(page);
    page.on("request", (r) => requested.push(new URL(r.url()).pathname));
    await page.route("**/textures/manifest.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MANIFEST) })
    );
    await page.route(/\/textures\/(Earth|Moon)\/.*\.png$/, (route) => {
      const key = new URL(route.request().url()).pathname.replace(/^\/textures\//, "");
      const body = IMAGES[key];
      return route.fulfill(
        body
          ? { status: 200, contentType: "image/png", headers: { "cache-control": "no-store" }, body }
          : { status: 404, body: "missing" }
      );
    });
  });

  test.afterAll(async () => {
    await page.close();
  });

  const focusRow = (id) =>
    page.locator("#index .body-row", { has: page.locator(`span:first-child:text-is("${id}")`) }).click();

  test("startup loads the manifest textures", async () => {
    test.setTimeout(400000);
    await page.goto("/#t=2026-11-01T12:00:00Z&s=1");
    await bootDone(page);
    await page.keyboard.press("d");
    await expect(page.locator("#diag")).not.toContainText("building", { timeout: 200000 });
    await expect(page.locator("#diag")).toContainText("Shader fallback: no");
    await page.keyboard.press("d");
    expect(requested).toContain("/textures/Earth/2k/map.png");
    expect(requested).toContain("/textures/Earth/2k/cloudMask.png");
    expect(requested).toContain("/textures/Moon/2k/bump.png");
  });

  test("the plate credits a real surface and calls a procedural one procedural", async () => {
    await focusRow("Earth");
    const src = page.locator("#plate-src");
    await expect(src).toContainText("Fixture Earth credit");
    await expect(src).toContainText("Public domain");
    await expect(src).toContainText("2k map");
    await expect(src).toContainText("Fixture note.");
    await expect(src.locator('a[href="https://example.invalid/earth"]')).toHaveCount(1);
    await focusRow("Moon");
    await expect(src).toContainText("Fixture Moon credit");
    await expect(src.locator('a[href^="https://example.invalid"]')).toHaveCount(0);
    await focusRow("Jupiter");
    await expect(src).toContainText("procedural, not a photograph");
  });

  test("a manifest path that escapes the textures folder is ignored", async () => {
    await focusRow("Mars");
    await expect(page.locator("#plate-src")).toContainText("procedural, not a photograph");
    await expect(page.locator("#plate-src")).not.toContainText("Hostile entry");
    expect(requested.filter((p) => /README/.test(p))).toEqual([]);
  });

  test("the texture detail item appears and loads a larger map for the focused body only", async () => {
    await focusRow("Earth");
    await page.locator("#btn-view").click();
    const quality = page.locator("#btn-quality");
    await expect(quality).toBeVisible();
    await expect(quality).toContainText("2k");
    expect(requested).not.toContain("/textures/Earth/4k/map.png");
    await quality.click();
    await expect(quality).toContainText("4k");
    await page.keyboard.press("Escape");
    await expect(page.locator("#plate-src")).toContainText("4k map");
    expect(requested).toContain("/textures/Earth/4k/map.png");
    expect(await page.evaluate(() => localStorage.getItem("cosmos_tex"))).toBe("4k");
    await page.keyboard.press("d");
    await expect(page.locator("#diag")).toContainText("Earth 4k");
    await focusRow("Moon");
    await expect(page.locator("#plate-src")).toContainText("2k map");
    await expect(page.locator("#diag")).toContainText("Earth 2k", { timeout: 60000 });
    await focusRow("Earth");
    await expect(page.locator("#diag")).toContainText("Earth 4k", { timeout: 60000 });
    await expect(page.locator("#plate-src")).toContainText("4k map");
    await page.keyboard.press("d");
  });

  test("cycling past the last tier wraps to 2k", async () => {
    await page.locator("#btn-view").click();
    await page.locator("#btn-quality").click();
    await expect(page.locator("#btn-quality")).toContainText("2k");
    await page.keyboard.press("Escape");
    await expect(page.locator("#plate-src")).toContainText("2k map");
  });

  test("the session produced no console errors or texture warnings", async () => {
    expect(problems).toEqual([]);
  });
});
