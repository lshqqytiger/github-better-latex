/// <reference types="chrome" />

import DOMPurify from "dompurify";
import katex from "katex";
import {
  cleanupCopilotMarkdown,
  renderCopilotMarkdown,
  restoreCopilotMarkdown,
} from "./copilot-math";
import { renderMarkdown } from "./markdown";
import { createMathOptions } from "./math-options";

interface FetchMarkdownResponse {
  ok: boolean;
  markdown?: string;
  error?: string;
}

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

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    (location.pathname !== "/copilot" &&
      !location.pathname.startsWith("/copilot/c/"))
  ) {
    return;
  }
  const data = event.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("type" in data) ||
    data.type !== "github-better-latex:copilot-markdown" ||
    !("page" in data) ||
    data.page !== location.href ||
    !("token" in data) ||
    typeof data.token !== "string" ||
    !("content" in data) ||
    (typeof data.content !== "string" && data.content !== null)
  ) {
    return;
  }
  const root = Array.from(
    document.querySelectorAll<HTMLElement>('[data-copilot-markdown="true"]'),
  ).find((element) => element.dataset.githubLatexSourceId === data.token);
  if (root) {
    if (data.content === null) {
      restoreCopilotMarkdown(root);
      return;
    }
    renderCopilotMarkdown(root, data.content, (source: string) =>
      DOMPurify.sanitize(renderMarkdown(source)),
    );
  }
});
window.postMessage(
  "github-better-latex:request-copilot-markdown",
  location.origin,
);

function renderCopilotMathErrors(): void {
  if (
    location.pathname !== "/copilot" &&
    !location.pathname.startsWith("/copilot/c/")
  ) {
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
      ...createMathOptions(),
      displayMode: true,
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
  cleanupCopilotMarkdown();
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

    article.innerHTML = DOMPurify.sanitize(renderMarkdown(response.markdown));
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
observer.observe(document.documentElement, {
  childList: true,
  characterData: true,
  subtree: true,
});
window.addEventListener("turbo:load", () => void renderMarkdownPage());
window.addEventListener("popstate", () => void renderMarkdownPage());
void renderMarkdownPage();
