# Development

## Prerequisites

- Node.js
- pnpm 12.11.2

## Build

From the repository root:

```sh
pnpm install
pnpm build
```

The build type-checks `src/`, bundles the content scripts and service worker,
then stages `manifest.json`, KaTeX stylesheets, and fonts in `dist/`. Load
`dist/` as an unpacked extension in Chromium. `node_modules/` and `dist/` are
generated and ignored by Git.

`pnpm-workspace.yaml` allows esbuild's install script for its platform binary.

## Source Layout

- `src/copilot-math.ts`: exact React message-source extraction and cached rendering.
- `src/copilot-source.ts`: main-world bridge for original Copilot Markdown.
- `src/markdown.ts`: shared parser, including display brackets inside paragraphs.
- `src/content.ts`: GitHub page handling, Markdown rendering, and Copilot
  display-math repair.
- `src/background.ts`: validates and fetches raw repository Markdown.
- `src/markdown-it-texmath.d.ts`: types for the untyped math plugin.
- `manifest.json`: extension permissions and entry points.
- `scripts/copy-manifest.mjs`: stages the manifest and KaTeX assets.

## Manual Smoke Checks

Run `pnpm test` for parser and Copilot lifecycle regressions. Tests use synthetic
React props and HTML; live GitHub compatibility requires browser checks.

1. Build and load `dist/` in Chromium.
2. Open a GitHub repository `.md` blob containing inline `$...$` and `\(...\)`
   math, and display `$$...$$` and `\[...\]` math. Confirm rendering and font
   loading from the extension package.
3. Open a Copilot Chat response containing a failed display-math block whose
   fallback includes a `<pre>` with TeX, such as a formula using
   `\operatorname{...}`. Confirm only that failed block is replaced with
   rendered math.
4. Open a Copilot message whose original source includes `\(H(M)\)` and literal
   `(H(M))` prose. When source props are available, confirm the formula renders
   with its inner parentheses intact and the literal prose is unchanged.
5. Confirm toolbars outside the Markdown body still work, navigate between
   conversations, and check subsequent responses. If a message is not re-rendered,
   inspect whether its React ancestry still exposes the expected message props.

After changing the manifest, reload the extension in `chrome://extensions`;
refresh the GitHub page after every rebuild.
