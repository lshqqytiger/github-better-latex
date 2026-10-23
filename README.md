# GitHub Better LaTeX

A Chromium extension that improves LaTeX rendering on GitHub.

## Before And After

**Before:** GitHub Copilot's original rendering.

![GitHub Copilot showing a LaTeX rendering error and raw TeX commands](resources/copilot-before.png)

**After:** With GitHub Better LaTeX enabled.

![GitHub Copilot showing correctly rendered inline and display math](resources/copilot-after.png)

## Features

- Re-renders repository Markdown blob pages ending in `.md`, using the original
  Markdown source and KaTeX.
- Repairs failed display-math blocks in Copilot Chat when GitHub's error
  fallback still contains the original TeX source.
- Re-renders Copilot message bodies from original Markdown when it is available
  in the message's React props, avoiding guesses about ordinary parentheses.

Markdown math supports `$...$` and `\(...\)` for inline expressions, and
`$$...$$` and `\[...\]` for display expressions. Full Copilot rendering hides
the original Markdown body and displays a rendered sibling, leaving React's
original nodes and surrounding message controls intact. GitHub-specific widgets
inside the body appear as standard Markdown output.

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
single-segment branch name. Copilot source access relies on private React
internals and must be verified against the live GitHub version. If the expected
assistant-message props are absent, the message body is left unchanged; failed
display math can still be repaired from GitHub's `<pre>` fallback. The extension
does not guess inline formulas or reconstruct Markdown from rendered HTML.
