import {
  mkdir,
  readFile,
  writeFile,
  stat,
  readdir,
  rename,
  rm
} from "node:fs/promises";

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const texDir = path.join(root, "textures");
const originals = path.join(root, "out", "originals");

const WIDTH = {
  "2k": 2048,
  "4k": 4096,
  "8k": 8192
};

const MASKS = new Set(["bump", "rough", "cloudMask"]);
const EXTS = [".tif", ".tiff", ".jpg", ".jpeg", ".png"];

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 2;

const argv = process.argv.slice(2);

const flag = (name) => argv.includes(`--${name}`);

const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);

  return i >= 0 && argv[i + 1]
    ? argv[i + 1].split(",")
    : fallback;
};

const numberOption = (name, fallback, min, max) => {
  const i = argv.indexOf(`--${name}`);

  if (i < 0) return fallback;

  const value = Number(argv[i + 1]);

  if (!Number.isInteger(value) || value < min || value > max) {
    console.error(
      `Invalid --${name}. Use an integer from ${min} to ${max}.`
    );

    process.exit(2);
  }

  return value;
};

const tiers = option("tier", ["2k"]);
const only = option("only", null);

const manifestOnly = flag("manifest");
const force = flag("force");
const requireSha = flag("require-sha");

const timeoutMs = numberOption(
  "timeout-ms",
  DEFAULT_TIMEOUT_MS,
  1000,
  300000
);

const retries = numberOption(
  "retries",
  DEFAULT_RETRIES,
  1,
  5
);

for (const tier of tiers) {
  if (!WIDTH[tier]) {
    console.error(`Unknown tier ${tier}. Use 2k, 4k or 8k.`);
    process.exit(2);
  }
}

const sources = JSON.parse(
  await readFile(
    new URL("./texture-sources.json", import.meta.url),
    "utf8"
  )
);

const exists = (file) =>
  stat(file).then(
    () => true,
    () => false
  );

const failures = [];

async function findOriginal(base) {
  const names = await readdir(originals).catch(() => []);

  const hit = names.find((name) =>
    EXTS.some(
      (ext) => name.toLowerCase() === `${base}${ext}`.toLowerCase()
    )
  );

  return hit ? path.join(originals, hit) : null;
}

async function verify(file, spec) {
  if (!spec.sha256) {
    if (requireSha) {
      await rm(file, { force: true });

      throw new Error(
        `no sha256 pinned for ${spec.product} and --require-sha is set`
      );
    }

    console.warn(`  warning: no sha256 pinned for ${spec.product}`);
    return;
  }

  const got = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");

  if (got !== String(spec.sha256).toLowerCase()) {
    await rm(file, { force: true });

    throw new Error(
      `sha256 mismatch for ${spec.product}: expected ${spec.sha256}, got ${got}`
    );
  }
}

async function download(url, base) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();

  const target = path.join(
    originals,
    `${base}${EXTS.includes(ext) ? ext : ".jpg"}`
  );

  const part = `${target}.part`;

  await rm(part, { force: true });

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": "Cosmoscope texture fetcher/1.0"
      }
    });

    if (!res.ok || !res.body) {
      await res.body?.cancel();

      throw new Error(
        `HTTP ${res.status} ${res.statusText} for ${url}`
      );
    }

    await pipeline(
      Readable.fromWeb(res.body),
      createWriteStream(part)
    );

    await rename(part, target);

    return target;
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}

async function acquire(id, slot, spec) {
  const base = `${id}_${slot}`;

  const cached = force
    ? null
    : await findOriginal(base);

  if (cached) {
    console.log(`  using cached ${path.basename(cached)}`);
    return cached;
  }

  const urls = [
    ...new Set([
      spec.url,
      ...(spec.fallbacks ?? [])
    ].filter(Boolean))
  ];

  if (!urls.length) {
    throw new Error(
      `No download URL. Get "${spec.product}" and save it as out/originals/${base}.tif, .jpg or .png`
    );
  }

  const errors = [];

  for (const url of urls) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      console.log(
        `  downloading ${url}${
          attempt > 1
            ? ` (attempt ${attempt}/${retries})`
            : ""
        }`
      );

      let file;

      try {
        file = await download(url, base);

        await verify(file, spec);

        return file;
      } catch (error) {
        if (file) {
          await rm(file, { force: true });
        }

        const message =
          error.name === "TimeoutError" ||
          error.name === "AbortError"
            ? `timed out after ${timeoutMs} ms`
            : error.message;

        errors.push(`${url}: ${message}`);

        console.warn(`  source failed: ${message}`);

        if (attempt < retries) {
          const delay = 750 * (2 ** (attempt - 1));

          await new Promise((resolve) =>
            setTimeout(resolve, delay)
          );
        }
      }
    }
  }

  throw new Error(
    `all ${urls.length} source(s) failed after ${retries} attempt(s): ${errors.join(" | ")}`
  );
}

async function convert(sharp, file, id, slot, wanted) {
  const meta = await sharp(file, {
    limitInputPixels: false
  }).metadata();

  const ratio = meta.width / meta.height;

  if (Math.abs(ratio - 2) > 0.04) {
    throw new Error(
      `${path.basename(file)} is ${meta.width} x ${meta.height}, not 2:1 equirectangular`
    );
  }

  let made = 0;

  for (const tier of wanted) {
    const w = WIDTH[tier];

    if (meta.width < w * 0.9 && slot !== "cloudMask") {
      console.log(
        `  ${id} ${slot} ${tier}: skipped, source is only ${meta.width} px wide`
      );

      continue;
    }

    const out = path.join(
      texDir,
      id,
      tier,
      `${slot}.jpg`
    );

    await mkdir(path.dirname(out), {
      recursive: true
    });

    let pipe = sharp(file, {
      limitInputPixels: false,
      sequentialRead: true
    }).resize(w, w / 2, {
      fit: "fill",
      kernel: "lanczos3"
    });

    pipe = MASKS.has(slot)
      ? pipe.greyscale().normalise()
      : pipe.removeAlpha().toColourspace("srgb");

    await pipe.jpeg({
      quality: 86,
      mozjpeg: true
    }).toFile(out);

    const size = (await stat(out)).size;

    console.log(
      `  ${id} ${slot} ${tier}: ${(size / 1048576).toFixed(2)} MB`
    );

    made += 1;
  }

  return made;
}

async function buildManifest() {
  const bodies = {};

  for (const [id, src] of Object.entries(sources)) {
    const found = {};

    for (const tier of Object.keys(WIDTH)) {
      const files = {};

      for (const slot of Object.keys(src.slots)) {
        const rel = `${id}/${tier}/${slot}.jpg`;

        if (await exists(path.join(texDir, rel))) {
          files[slot] = rel;
        }
      }

      if (Object.keys(files).length) {
        found[tier] = files;
      }
    }

    if (!Object.values(found).some((files) => files.map)) {
      continue;
    }

    const entry = {
      credit: src.credit,
      license: src.license,
      url: src.url,
      centerLon: src.centerLon
    };

    if (src.note) {
      entry.note = src.note;
    }

    if (src.bumpScale) {
      entry.bumpScale = src.bumpScale;
    }

    entry.tiers = found;

    bodies[id] = entry;
  }

  await writeFile(
    path.join(texDir, "manifest.json"),
    `${JSON.stringify({
      version: 2,
      bodies
    }, null, 2)}\n`
  );

  const listed = Object.keys(bodies);

  console.log(
    listed.length
      ? `manifest: ${listed.join(", ")}`
      : "manifest: no textures on disk, app stays procedural"
  );
}

if (!manifestOnly) {
  let sharp;

  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error(
      "This tool needs sharp. Run: npm install --no-save sharp"
    );

    process.exit(2);
  }

  await mkdir(originals, {
    recursive: true
  });

  for (const [id, src] of Object.entries(sources)) {
    if (only && !only.includes(id)) {
      continue;
    }

    console.log(id);

    for (const [slot, spec] of Object.entries(src.slots)) {
      try {
        const file = await acquire(id, slot, spec);

        await convert(sharp, file, id, slot, tiers);
      } catch (err) {
        failures.push(`${id} ${slot}: ${err.message}`);

        console.log(
          `  ${id} ${slot}: FAILED, ${err.message}`
        );
      }
    }
  }
}

await buildManifest();

if (failures.length) {
  console.log(`\n${failures.length} item(s) failed:`);

  for (const failure of failures) {
    console.log(`  ${failure}`);
  }

  process.exitCode = 1;
}