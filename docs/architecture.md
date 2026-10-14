# Architecture

The extension uses a Manifest V3 content script for page integration and a
service worker for repository Markdown fetches. TypeScript is checked with
`tsc` and bundled with esbuild; the build copies the manifest and KaTeX assets
into `dist/`.

## Repository Markdown

1. The content script recognizes GitHub paths shaped like
   `/{owner}/{repository}/blob/{branch}/{file}.md`.
2. It maps the path to the matching `raw/refs/heads/` URL and asks the service
   worker to fetch it with the browser's GitHub session credentials.
3. The worker accepts requests only from `github.com` and only for raw URLs on
   `github.com` with the expected repository path. GitHub may redirect these
   requests to `raw.githubusercontent.com`, which is also listed in the host
   permissions.
4. The content script renders the source with markdown-it and
   markdown-it-texmath, using both bracket and dollar delimiter modes. Raw HTML is disabled
   in Markdown parsing, and DOMPurify sanitizes the resulting HTML before it
   replaces the Markdown article.

The surrounding GitHub page is preserved. A mutation observer and GitHub
navigation events let the content script handle pages loaded or changed by
client-side navigation.

## Copilot Chat

On `/copilot/c/` pages, the same observer looks for failed display-math
`<math-renderer>` elements. GitHub's failure fallback includes the original TeX
inside a `<pre>` element. The extension passes that source to KaTeX in display
mode and replaces only the failed renderer. It does not fetch conversation
history or alter successful math renderers.

KaTeX styles and fonts are packaged with the extension. The content script
loads styles through `chrome.runtime.getURL`; the manifest exposes those assets
to GitHub pages so font URLs resolve from the extension package.

## Permissions And Trust

- `https://github.com/*` is the content-script match and the source host for
  Markdown requests.
- `https://raw.githubusercontent.com/*` permits GitHub's raw-content redirect.
- Packaged stylesheets and fonts are exposed only to `https://github.com/*`.
- Repository source is parsed with raw HTML disabled and sanitized before DOM
  insertion.

The extension currently supports `.md` blob files on branch names without `/`.
It does not currently handle tags, commit-SHA paths, other Markdown extensions,
or Copilot formulas whose source is absent from GitHub's error fallback.
