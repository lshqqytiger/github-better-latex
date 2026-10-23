import { getCopilotMarkdown } from "./copilot-math";

const snapshots = new WeakMap<HTMLElement, { content: string; html: string }>();
let scheduled = false;
let replaySources = false;

function publishSources(): void {
  scheduled = false;
  const replay = replaySources;
  replaySources = false;
  if (
    location.pathname !== "/copilot" &&
    !location.pathname.startsWith("/copilot/c/")
  ) {
    return;
  }
  document
    .querySelectorAll<HTMLElement>('[data-copilot-markdown="true"]')
    .forEach((root) => {
      const message = getCopilotMarkdown(root);
      if (!message) {
        if (snapshots.has(root)) {
          snapshots.delete(root);
          window.postMessage(
            {
              type: "github-better-latex:copilot-markdown",
              page: location.href,
              token: root.dataset.githubLatexSourceId,
              content: null,
            },
            location.origin,
          );
        }
        return;
      }
      const previous = snapshots.get(root);
      if (
        !replay &&
        previous?.content === message.content &&
        previous.html === root.innerHTML
      ) {
        return;
      }
      const token = root.dataset.githubLatexSourceId ?? crypto.randomUUID();
      root.dataset.githubLatexSourceId = token;
      snapshots.set(root, { content: message.content, html: root.innerHTML });
      window.postMessage(
        {
          type: "github-better-latex:copilot-markdown",
          page: location.href,
          token,
          content: message.content,
        },
        location.origin,
      );
    });
}

function scheduleSources(): void {
  if (!scheduled) {
    scheduled = true;
    window.setTimeout(publishSources, 0);
  }
}

new MutationObserver(scheduleSources).observe(document.documentElement, {
  childList: true,
  characterData: true,
  subtree: true,
});
document.addEventListener("turbo:load", scheduleSources);
window.addEventListener("popstate", scheduleSources);
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (
    event.source === window &&
    event.origin === location.origin &&
    event.data === "github-better-latex:request-copilot-markdown"
  ) {
    replaySources = true;
    scheduleSources();
  }
});
scheduleSources();
