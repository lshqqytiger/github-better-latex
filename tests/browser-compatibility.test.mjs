import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { test } from "node:test";

const execute = promisify(execFile);

for (const target of ["chromium", "firefox"]) {
  test(`stages a ${target}-compatible manifest and rendering assets`, async () => {
    await execute(process.execPath, ["scripts/copy-manifest.mjs", target]);
    const directory = target === "firefox" ? "dist/firefox" : "dist";
    const manifest = JSON.parse(
      await readFile(`${directory}/manifest.json`, "utf8"),
    );
    const source = JSON.parse(await readFile("manifest.json", "utf8"));

    if (target === "firefox") {
      assert.deepEqual(manifest.background, { scripts: ["background.js"] });
      assert.deepEqual(manifest.browser_specific_settings.gecko, {
        id: "github-better-latex@extensions.local",
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      });
      assert.deepEqual(manifest.browser_specific_settings.gecko_android, {
        strict_min_version: "142.0",
      });
    } else {
      assert.deepEqual(manifest, source);
    }
    assert.deepEqual(manifest.content_scripts, source.content_scripts);
    assert.equal(manifest.content_scripts[0].world, "MAIN");
    assert.deepEqual(manifest.host_permissions, source.host_permissions);
    assert.deepEqual(
      manifest.web_accessible_resources,
      source.web_accessible_resources,
    );
    await Promise.all([
      access(`${directory}/katex.min.css`),
      access(`${directory}/texmath.css`),
      access(`${directory}/fonts/KaTeX_Main-Regular.woff2`),
    ]);
  });
}
