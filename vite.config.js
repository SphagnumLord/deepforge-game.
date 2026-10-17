import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const template = new URL("./index.source.html", import.meta.url);

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "deepforge-html-source",
      transformIndexHtml: {
        order: "pre",
        handler: () => readFile(template, "utf8"),
      },
      handleHotUpdate({ file, server }) {
        if (file === fileURLToPath(template)) {
          server.ws.send({ type: "full-reload", path: "*" });
          return [];
        }
      },
    },
  ],
  build: { target: "es2022" },
});
