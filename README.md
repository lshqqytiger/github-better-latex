# GitHub Better LaTeX

A Chromium extension that improves LaTeX rendering on GitHub.

## Features

- Re-renders repository Markdown blob pages ending in `.md`, using the original
  Markdown source and KaTeX.
- Repairs failed display-math blocks in Copilot Chat when GitHub's error
  fallback still contains the original TeX source.

Markdown math supports `$...$` and `\(...\)` for inline expressions, and
`$$...$$` and `\[...\]` for display expressions. The Copilot Chat repair only touches failed display-math blocks;
other message content and successfully rendered equations are left intact.

## Install

Build the unpacked extension:

```sh
pnpm install
pnpm build
```

Then open `chrome://extensions`, enable **Developer mode**, select **Load
unpacked**, and choose the generated `dist/` directory. After rebuilding,
reload the extension from the extensions page and refresh GitHub.

## Documentation

- [Architecture](docs/architecture.md): page handling, data flow, permissions,
  and security boundaries.
- [Development](docs/development.md): prerequisites, build commands, and manual
  smoke checks.

## Scope

Repository rendering currently targets GitHub blob URLs with a `.md` file on a
single-segment branch name. Copilot Chat repair depends on GitHub retaining the
failed formula's TeX in a `<pre>` fallback; it does not intercept chat APIs or
re-render every message. GitHub may change these page structures over time.
