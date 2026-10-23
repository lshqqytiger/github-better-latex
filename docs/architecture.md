# Architecture

The Manifest V3 extension uses content scripts for page integration and a
service worker for repository Markdown fetches.

## Repository Markdown

1. The content script recognizes GitHub paths shaped like
   `/{owner}/{repository}/blob/{branch}/{file}.md`.
2. It maps the path to the matching `raw/refs/heads/` URL and asks the service
   worker to fetch it with the browser's GitHub session credentials.
3. The worker accepts requests only from `github.com` and only for raw URLs on
   `github.com` with the expected repository path. GitHub may redirect these
   requests to `raw.githubusercontent.com`.
4. The content script renders the source with markdown-it and
   markdown-it-texmath with bracket and dollar delimiters. Raw HTML is disabled,
   and DOMPurify sanitizes the resulting HTML before it
   replaces the Markdown article.

A mutation observer and navigation events handle client-side page changes.

The shared parser protects complete multiline `\(...\)` and `\[...\]` regions
before Markdown block parsing. Temporary tokens keep blank lines and leading
`+` signs inside formulas from becoming paragraphs or lists; the original TeX
is retained for KaTeX. Inline code, fenced and indented code blocks, escaped
delimiters, and unclosed formulas are left untouched.

## Copilot Chat

On `/copilot` and `/copilot/c/` pages, the same observer looks for failed display-math
`<math-renderer>` elements. GitHub's failure fallback includes the original TeX
inside a `<pre>` element. The extension passes that source to KaTeX in display
mode and replaces only the failed renderer when full source is unavailable.

A separate `MAIN`-world script reads React fiber ancestors of each
`[data-copilot-markdown="true"]` body, stopping at the enclosing message's DOM
boundary. The root's committed fiber selects the active alternate after React
updates. The bridge accepts only `message` props containing an assistant role, string
ID, and string content. This relies on private React internals.

The bridge sends the original Markdown and a per-element token using
`window.postMessage`. The isolated content script validates the envelope,
current URL, and target token, then renders the entire message body with the
same Markdown parser and DOMPurify sanitizer used for repository files. Page
messages are untrusted input. The bridge initiates no network requests or
privileged extension operations.

Source and output are cached per DOM element. The original message body is
hidden, not overwritten; output is placed in an extension-owned sibling so
React can continue updating its original children. Text and child mutations
trigger source checks for updates. Lost source restores the native body, and
removed message bodies trigger output cleanup. A startup handshake replays
source if the isolated listener missed the first publication.

Surrounding message controls are preserved, but code preview widgets, citations,
and other GitHub-specific body widgets appear as standard Markdown output.

If no validated source is available, inline content is left untouched.

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

See the [README](../README.md#scope) for supported page types and limitations.
