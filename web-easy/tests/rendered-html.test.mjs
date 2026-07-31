import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function renderRoot() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://dingding.example/", {
      headers: {
        accept: "text/html",
        host: "dingding.example",
        "x-forwarded-proto": "https",
      },
      redirect: "manual",
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("root opens the focus app", async () => {
  const response = await renderRoot();
  assert.ok([307, 308].includes(response.status));
  assert.equal(
    new URL(response.headers.get("location"), "https://dingding.example").pathname,
    "/app/index.html",
  );
});

test("ships every browser asset needed by macOS Chrome and Safari", async () => {
  const appRoot = new URL("../dist/client/app/", import.meta.url);
  const html = await readFile(new URL("index.html", appRoot), "utf8");

  assert.match(html, /<meta\s+charset=["']UTF-8["']/i);
  assert.match(html, /src=["']\.\/vendor\/chart\.umd\.js["']/i);
  assert.match(html, /href=["']\.\/src\/styles\.css["']/i);
  assert.match(html, /src=["']\.\/src\/app\.js["']/i);

  await Promise.all(
    [
      "dingding_notifications_sw.js",
      "src/app.js",
      "src/core.js",
      "src/platform-browser.js",
      "src/styles.css",
      "vendor/chart.umd.js",
      "vendor/inter-latin-400-normal.woff2",
      "vendor/inter-latin-500-normal.woff2",
      "vendor/inter-latin-600-normal.woff2",
    ].map((path) => access(new URL(path, appRoot))),
  );
});

test("ships automatic away detection and settlement reporting", async () => {
  const appRoot = new URL("../dist/client/app/", import.meta.url);
  const [html, app, platform] = await Promise.all([
    readFile(new URL("index.html", appRoot), "utf8"),
    readFile(new URL("src/app.js", appRoot), "utf8"),
    readFile(new URL("src/platform-browser.js", appRoot), "utf8"),
  ]);

  assert.match(app, /const AWAY_IDLE_MS = 2 \* 60 \* 1000/);
  assert.match(app, /task\.pauseKind === 'auto'/);
  assert.match(app, /if \(!awayMonitor\) startAwayDetection\(\)/);
  assert.match(app, /activeScreen\.id !== 'screen-timer'/);
  assert.match(platform, /'pointermove', 'pointerdown', 'keydown'/);
  assert.match(html, /id="s-away"/);
});

test("includes share and browser metadata", async () => {
  const layout = await readFile(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );

  assert.match(layout, /DingDing Zones/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /twitter/);
  await access(new URL("../dist/client/og.png", import.meta.url));
  await access(new URL("../dist/client/favicon.png", import.meta.url));
});
