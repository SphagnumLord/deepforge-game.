import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
let html = await readFile(path.join(dist, "index.html"), "utf8");
const notices = await readFile(
  path.join(root, "public", "THIRD_PARTY_NOTICES.txt"),
  "utf8",
);
html = html.replace("<head>", () => `<head>\n<!--\n${notices}\n-->`);
const script = html.match(/<script\b[^>]*src="([^\"]+)"[^>]*><\/script>/);
const style = html.match(
  /<link\b[^>]*rel="stylesheet"[^>]*href="([^\"]+)"[^>]*>/,
);
if (!script || !style)
  throw new Error("Expected one bundled script and stylesheet");
const javascript = await readFile(path.join(dist, script[1]), "utf8");
const css = await readFile(path.join(dist, style[1]), "utf8");
html = html.replace(
  script[0],
  () =>
    `<script type="module">${javascript.replace(/<\/script/gi, "<\\/script")}</script>`,
);
html = html.replace(style[0], () => `<style>${css}</style>`);
for (const asset of ["mark", "pickaxe", "hammer"]) {
  const svg = await readFile(
    path.join(root, "public", "assets", `${asset}.svg`),
  );
  html = html.replaceAll(
    `./assets/${asset}.svg`,
    `data:image/svg+xml;base64,${svg.toString("base64")}`,
  );
}
html = html.replace('class="brand" href="./"', 'class="brand" href="#"');
await writeFile(path.join(dist, "deepforge.html"), html);
console.log(
  `Standalone game: dist/deepforge.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} kB)`,
);
