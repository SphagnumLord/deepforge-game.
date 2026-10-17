import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox"],
});
// Managed Chromium in the cloud blocks file:// navigation. Serve just this
// document, then disconnect the browser to verify the single-file game.
const html = await readFile(new URL("../dist/deepforge.html", import.meta.url));
const server = createServer((request, response) => {
  if (request.url !== "/") {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
try {
  const page = await browser.newPage();
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  await page.goto(url);
  await page.context().setOffline(true);
  await page.locator("#tutorialStart").click();
  await page.locator(".slot").nth(0).click();
  await page.locator(".slot").nth(1).click();
  assert.equal(
    await page.locator(".slot").nth(1).getAttribute("data-tier"),
    "2",
  );
  await page.locator("#game").click({ position: { x: 250, y: 85 } });
  await page.waitForFunction(
    () => Number(document.getElementById("game").dataset.destroyed) > 0,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, [url]);
  console.log(
    "PASS: standalone HTML merges tools and mines offline with no asset requests.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
