/// <reference types="chrome" />

import DOMPurify from "dompurify";
import katex from "katex";
import MarkdownIt from "markdown-it";
import texmath from "markdown-it-texmath";

interface FetchMarkdownResponse {
  ok: boolean;
  markdown?: string;
  error?: string;
}

const markdown = new MarkdownIt({ html: false, linkify: true }).use(texmath, {
  engine: katex,
  delimiters: "brackets",
  katexOptions: { throwOnError: false },
});

let pendingPageUrl: string | null = null;

function installStylesheet(filename: string): void {
  if (
    document.querySelector(`link[data-github-latex-stylesheet="${filename}"]`)
  ) {
    return;
  }

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = window.chrome.runtime.getURL(filename);
  stylesheet.dataset.githubLatexStylesheet = filename;
  document.head.append(stylesheet);
}

installStylesheet("katex.min.css");
installStylesheet("texmath.css");

function renderCopilotMathErrors(): void {
  if (!location.pathname.startsWith("/copilot/c/")) {
    return;
  }

  const failures = document.querySelectorAll<HTMLElement>(
    "math-renderer.js-display-math .flash-error",
  );
  failures.forEach((failure) => {
    const renderer = failure.closest(
      "math-renderer.js-display-math",
    ) as HTMLElement | null;
    const tex = renderer?.querySelector("pre")?.textContent?.trim();
    if (!renderer || !tex) {
      return;
    }

    katex.render(tex, renderer, {
      displayMode: true,
      throwOnError: false,
    });
  });
}

function getRawMarkdownUrl(pageUrl: URL): string | null {
  const match = pageUrl.pathname.match(
    /^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+\.md)$/i,
  );
  if (!match) {
    return null;
  }

  const [, owner, repository, branch, filePath] = match;
  return new URL(
    `/${owner}/${repository}/raw/refs/heads/${branch}/${filePath}`,
    pageUrl.origin,
  ).href;
}

async function renderMarkdownPage(): Promise<void> {
  renderCopilotMathErrors();

  const pageUrl = new URL(location.href);
  const rawUrl = getRawMarkdownUrl(pageUrl);
  if (!rawUrl) {
    pendingPageUrl = null;
    return;
  }

  const article = document.querySelector<HTMLElement>(
    "article.markdown-body.entry-content",
  );
  if (
    !article ||
    article.dataset.githubLatexRendered === pageUrl.href ||
    pendingPageUrl === pageUrl.href
  ) {
    return;
  }

  pendingPageUrl = pageUrl.href;
  try {
    const response = (await window.chrome.runtime.sendMessage({
      type: "fetch-markdown",
      url: rawUrl,
    })) as FetchMarkdownResponse;
    if (!response?.ok || typeof response.markdown !== "string") {
      throw new Error(response?.error ?? "The raw Markdown request failed.");
    }

    if (location.href !== pageUrl.href || !article.isConnected) {
      return;
    }

    article.innerHTML = DOMPurify.sanitize(markdown.render(response.markdown));
    article.dataset.githubLatexRendered = pageUrl.href;
  } catch (error) {
    console.warn("GitHub LaTeX could not render this Markdown file.", error);
  } finally {
    if (pendingPageUrl === pageUrl.href) {
      pendingPageUrl = null;
    }
  }
}

const observer = new MutationObserver(() => void renderMarkdownPage());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("turbo:load", () => void renderMarkdownPage());
window.addEventListener("popstate", () => void renderMarkdownPage());
void renderMarkdownPage();
