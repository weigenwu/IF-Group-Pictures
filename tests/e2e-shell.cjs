const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const port = process.env.TEST_PORT || "5067";
const baseUrl = `http://127.0.0.1:${port}`;
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const server = spawn(python, ["app.py"], {
  cwd: root,
  env: { ...process.env, PORT: port },
  stdio: "ignore",
});

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("IF/IHC test server did not start");
}

(async () => {
  let browser;
  try {
    await waitForServer();
    const launchOptions = { headless: true };
    if (process.env.BROWSER_EXECUTABLE) launchOptions.executablePath = process.env.BROWSER_EXECUTABLE;
    else launchOptions.channel = process.env.BROWSER_CHANNEL || "msedge";
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const navigation = await page.locator(".suite-tabs a").evaluateAll((links) => links.map((link) => ({
      text: link.textContent.replace(/\s+/g, " ").trim().replace(" 当前", ""),
      target: link.getAttribute("target"),
    })));
    assert.deepEqual(navigation.map((item) => item.text), ["实验流程", "WB", "IF / IHC"]);
    assert.deepEqual(navigation.map((item) => item.target), [null, null, null]);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.locator('.suite-tabs a[aria-current="page"]').click();
    await page.waitForFunction(() => scrollY < 2);
    const topAnchor = await page.evaluate(() => {
      const header = document.querySelector(".suitebar").getBoundingClientRect();
      const title = document.querySelector("h1").getBoundingClientRect();
      return { scrollY, headerBottom: header.bottom, titleTop: title.top };
    });
    assert.ok(topAnchor.scrollY < 2, "current IF/IHC tab must return to the document top");
    assert.ok(topAnchor.titleTop >= topAnchor.headerBottom, "sticky suite header must not cover the IF/IHC title");

    await page.goto(`${baseUrl}/wb-migrate`, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const sourceBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      await new Promise((resolve, reject) => {
        const request = indexedDB.open("blotboard-wb", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("projects", { keyPath: "key" });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("projects", "readwrite");
          transaction.objectStore("projects").put({
            key: "current",
            token: "test-token",
            snapshot: {
              kind: "blotboard-project",
              version: 2,
              projectId: "migrate-test-1",
              modifiedAt: "2026-07-14T00:00:00.000Z",
              savedAt: "2026-07-14T00:00:00.000Z",
              settings: {
                groups: [{ name: "Control", count: 1 }], laneLabels: ["Control"], layoutMode: "compact", footerLabel: "",
                laneWidth: 40, rowHeight: 40, rowGap: 0, labelSize: 16, showMw: true, showLanes: false, showBorder: true,
                demoLoaded: false, exportDpi: 300, exportProfile: "preserve", panelColumns: 2, panelGap: 24,
              },
              rows: [{
                rowKey: "row-migrate", name: "Protein", mw: "", role: "target", membraneId: "", nonAdjacent: false,
                splices: [], crop: { x: 0, y: 0, w: 1, h: 1 }, brightness: 100, contrast: 100, invert: false,
                source: { name: "source.png", type: "image/png", size: sourceBlob.size, lastModified: 0, sha256: "", blob: sourceBlob },
              }],
              panels: [],
            },
          });
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#exportLegacyProject").click(),
    ]);
    assert.match(download.suggestedFilename(), /^wb-migrated-.*\.wb-project$/);
    const migrated = JSON.parse(await fs.readFile(await download.path(), "utf8"));
    assert.equal(migrated.kind, "blotboard-project");
    assert.match(migrated.rows[0].source.dataUrl, /^data:image\/png;base64,/);
    assert.equal("blob" in migrated.rows[0].source, false);
    assert.match(await page.locator("#migrateStatus").innerText(), /迁移文件已下载/);
    assert.deepEqual(runtimeErrors, []);
    console.log("IF/IHC shell E2E passed: mobile layout and IndexedDB WB migration download.");
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
