interface FetchMarkdownRequest {
  type: "fetch-markdown";
  url: string;
}

interface FetchMarkdownResponse {
  ok: boolean;
  markdown?: string;
  error?: string;
}

function isFetchMarkdownRequest(
  message: unknown,
): message is FetchMarkdownRequest {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const request = message as Partial<FetchMarkdownRequest>;
  return request.type === "fetch-markdown" && typeof request.url === "string";
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isFetchMarkdownRequest(message)) {
    return;
  }

  if (!sender.url || new URL(sender.url).origin !== "https://github.com") {
    sendResponse({
      ok: false,
      error: "Requests must come from GitHub.",
    } satisfies FetchMarkdownResponse);
    return;
  }

  const rawUrl = new URL(message.url);
  if (
    rawUrl.origin !== "https://github.com" ||
    !/^\/[^/]+\/[^/]+\/raw\/refs\/heads\//.test(rawUrl.pathname)
  ) {
    sendResponse({
      ok: false,
      error: "The raw Markdown URL is not allowed.",
    } satisfies FetchMarkdownResponse);
    return;
  }

  void fetch(rawUrl, { credentials: "include" })
    .then(async (response) => {
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || contentType.includes("text/html")) {
        sendResponse({
          ok: false,
          error: `Raw Markdown request failed (${response.status}).`,
        } satisfies FetchMarkdownResponse);
        return;
      }

      sendResponse({
        ok: true,
        markdown: await response.text(),
      } satisfies FetchMarkdownResponse);
    })
    .catch((error: unknown) => {
      const reason =
        error instanceof Error ? error.message : "Network request failed.";
      sendResponse({
        ok: false,
        error: `Unable to fetch the raw Markdown file: ${reason}`,
      } satisfies FetchMarkdownResponse);
    });

  return true;
});
