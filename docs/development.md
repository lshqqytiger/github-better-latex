# Development

## Prerequisites

- Node.js
- pnpm 12.11.2 (the version recorded in `package.json`)

## Build

From the repository root:

```sh
pnpm install
pnpm build
```

The build type-checks `src/`, bundles the content script and service worker,
then stages `manifest.json`, KaTeX stylesheets, and fonts in `dist/`. Load
`dist/` as an unpacked extension in Chromium. `node_modules/` and `dist/` are
generated and ignored by Git.

`pnpm-workspace.yaml` explicitly allows esbuild's install script, which is
required to install its platform-specific binary under pnpm's build-script
protection.

## Source Layout

- `src/content.ts`: GitHub page handling, Markdown rendering, and Copilot
  display-math repair.
- `src/background.ts`: validates and fetches raw repository Markdown.
- `src/markdown-it-texmath.d.ts`: types for the untyped math plugin.
- `manifest.json`: extension permissions and entry points.
- `scripts/copy-manifest.mjs`: stages the manifest and KaTeX assets.

## Manual Smoke Checks

1. Build and load `dist/` in Chromium.
2. Open a GitHub repository `.md` blob containing inline `$...$` and `\(...\)`
   math, and display `$$...$$` and `\[...\]` math. Confirm the article is rendered and KaTeX fonts load from
   the extension package.
3. Open a Copilot Chat response containing a failed display-math block whose
   fallback includes a `<pre>` with TeX, such as a formula using
   `\operatorname{...}`. Confirm only that failed block is replaced with
   rendered math.
4. Confirm successfully rendered math, code blocks, and other message content
   remain unchanged.

After changing the manifest, reload the extension in `chrome://extensions`;
refresh the GitHub page after every rebuild.
