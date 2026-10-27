import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";

const target = process.argv[2] ?? "chromium";
if (target !== "chromium" && target !== "firefox") {
  throw new Error(`Unsupported browser target: ${target}`);
}
const outputDirectory = target === "firefox" ? "dist/firefox" : "dist";
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
if (target === "firefox") {
  manifest.background = { scripts: [manifest.background.service_worker] };
  manifest.browser_specific_settings = {
    gecko: {
      id: "github-better-latex@extensions.local",
      strict_min_version: "140.0",
      data_collection_permissions: { required: ["none"] },
    },
    gecko_android: { strict_min_version: "142.0" },
  };
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(
    `${outputDirectory}/manifest.json`,
    `${JSON.stringify(manifest, null, 2)}\n`,
  ),
  copyFile(
    "node_modules/katex/dist/katex.min.css",
    `${outputDirectory}/katex.min.css`,
  ),
  copyFile(
    "node_modules/markdown-it-texmath/css/texmath.css",
    `${outputDirectory}/texmath.css`,
  ),
  cp("node_modules/katex/dist/fonts", `${outputDirectory}/fonts`, {
    recursive: true,
  }),
]);
