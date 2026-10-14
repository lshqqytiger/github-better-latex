import { copyFile, cp, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await Promise.all([
  copyFile("manifest.json", "dist/manifest.json"),
  copyFile("node_modules/katex/dist/katex.min.css", "dist/katex.min.css"),
  copyFile(
    "node_modules/markdown-it-texmath/css/texmath.css",
    "dist/texmath.css",
  ),
  cp("node_modules/katex/dist/fonts", "dist/fonts", { recursive: true }),
]);
