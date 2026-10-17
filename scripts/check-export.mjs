import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { STORAGE } from "../src/core.js";

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const entry = new URL("../index.html", import.meta.url);
const html = await readFile(entry);
const exported = await readFile(new URL("../dist/deepforge.html", import.meta.url));
assert.equal(
  Buffer.compare(html, exported),
  0,
  "the index in the downloaded ZIP must be the standalone game",
);
const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox"],
});
// Serve only the downloaded index, with no assets or source modules available.
const documentPath = "/download/index.html";
const server = createServer((request, response) => {
  if (request.url !== documentPath) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}${documentPath}`;

function observe(page) {
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  return { errors, requests };
}

async function play(page, mobile) {
  await page.waitForFunction(
    () => document.querySelectorAll(".slot").length === 12,
  );
  await page.locator("#tutorialStart").click();
  await page.locator(".slot").nth(0).click();
  await page.locator(".slot").nth(1).click();
  assert.equal(
    await page.locator(".slot").nth(1).getAttribute("data-tier"),
    "2",
  );
  await page.locator("#autoMerge").click();
  assert.equal(await page.locator('.slot[data-tier="3"]').count(), 1);
  assert.equal(await page.locator("#autoMerge").isDisabled(), true);
  await page.locator("#buy").click();
  assert.equal(await page.locator("#coins").textContent(), "155");
  assert.equal(await page.locator("#upgrade").isDisabled(), true);
  assert.equal(await page.locator("#damage").textContent(), "2");
  assert.equal(await page.locator("#upgradeLabel").textContent(), "Улучшить силу (+1)");
  await page.locator('.slot[data-tier="3"]').click();
  if (mobile) await page.locator("#dropSelected").click();
  else await page.locator("#game").click({ position: { x: 250, y: 85 } });
  await page.waitForFunction(
    () => Number(document.getElementById("game").dataset.destroyed) > 0,
  );
  await page.locator("#pause").click();
}

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      isMobile: width === 390,
      hasTouch: width === 390,
    });
    try {
      const page = await context.newPage();
      const { errors, requests } = observe(page);
      await page.goto(url);
      await context.setOffline(true);
      await play(page, width === 390);
      const saved = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        STORAGE,
      );
      assert(saved.board.hp.some((hp) => hp === 0));
      assert.equal(saved.power, 0);
      await context.setOffline(false);
      await page.reload();
      await context.setOffline(true);
      await page.waitForFunction(
        () => document.querySelectorAll(".slot").length === 12,
      );
      const restored = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        STORAGE,
      );
      assert.deepEqual(restored.board.hp, saved.board.hp);
      assert.equal(restored.coins, saved.coins);
      assert.equal(restored.power, saved.power);
      assert.equal(await page.locator("#tutorial").isVisible(), false);
      assert.deepEqual(errors, []);
      assert.deepEqual(
        requests,
        [url, url],
        "the index must never load external assets",
      );
      console.log(
        `PASS: downloaded index at ${width}px starts, merges, buys and mines offline; progress survives reload.`,
      );
    } finally {
      await context.close();
    }
  }

  // No web server, network or usable localStorage: like a restricted local file.
  const context = await browser.newContext();
  try {
    await context.setOffline(true);
    const page = await context.newPage();
    const { errors, requests } = observe(page);
    await page.setContent(html.toString("utf8"));
    await play(page, false);
    assert.equal(
      await page.locator("#saveStatus").textContent(),
      "Сохранение на устройстве недоступно",
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    console.log(
      "PASS: standalone index runs without any server or storage access.",
    );
  } finally {
    await context.close();
  }

  const fileContext = await browser.newContext();
  try {
    const page = await fileContext.newPage();
    const { errors, requests } = observe(page);
    let blockedByPolicy = false;
    try {
      await page.goto(entry.href);
    } catch (error) {
      if (!String(error).includes("ERR_BLOCKED_BY_ADMINISTRATOR")) throw error;
      blockedByPolicy = true;
    }
    if (blockedByPolicy) {
      console.log(
        "SKIP: direct file:// navigation is blocked by cloud Chromium policy; offline and server-free checks passed above.",
      );
    } else {
      await play(page, false);
      assert.deepEqual(errors, []);
      assert.deepEqual(requests, []);
      console.log("PASS: the root index runs directly from file://.");
    }
  } finally {
    await fileContext.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
