import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";

const bundle = await build({
  entryPoints: ["src/copilot-math.ts"],
  bundle: true,
  format: "iife",
  globalName: "copilotMath",
  write: false,
});
const parser = await build({
  entryPoints: ["src/markdown.ts"],
  bundle: true,
  format: "iife",
  globalName: "markdownParser",
  write: false,
});
const scripts = await build({
  entryPoints: ["src/content.ts", "src/copilot-source.ts"],
  bundle: true,
  format: "iife",
  outdir: "test-bundle",
  write: false,
});

function waitForDom(window, predicate) {
  if (predicate()) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const observer = new window.MutationObserver(() => {
      if (predicate()) {
        observer.disconnect();
        window.clearTimeout(timeout);
        resolve();
      }
    });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error("Expected DOM update did not arrive"));
    }, 2000);
    observer.observe(window.document, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  });
}

function withMessage(check) {
  const dom = new JSDOM(
    '<!doctype html><div class="message-container"><div data-copilot-markdown="true">(H(M))</div><button>Copy</button></div>',
    { runScripts: "outside-only" },
  );
  try {
    dom.window.eval(
      `${bundle.outputFiles[0].text}\nglobalThis.copilotMath = copilotMath;`,
    );
    dom.window.eval(
      `${parser.outputFiles[0].text}\nglobalThis.markdownParser = markdownParser;`,
    );
    const root = dom.window.document.querySelector("[data-copilot-markdown]");
    const sanitize = createDOMPurify(dom.window);
    const render = (source) =>
      sanitize.sanitize(dom.window.markdownParser.renderMarkdown(source));
    check(root, dom.window.copilotMath, render);
  } finally {
    dom.window.close();
  }
}

test("renders Korean bold ending in punctuation before adjacent Korean text", () => {
  withMessage((root, helpers, render) => {
    const label = "\uc99d\uac10\ub960(%)";
    const source = `\uc5d1\uc140\uc5d0\uc11c **${label}**\uc740 \ubcf4\ud1b5 \uc774\ub807\uac8c \uacc4\uc0b0\ud574\uc694:`;
    const output = helpers.renderCopilotMarkdown(root, source, render);
    assert.equal(output.querySelector("strong")?.textContent, label);
    assert.ok(!output.textContent.includes("**"));
    assert.equal(output.textContent.trim(), source.replaceAll("**", ""));
  });
});

test("CJK emphasis support preserves standard emphasis, literal code, escapes, and math", () => {
  withMessage((root, helpers, render) => {
    const source = [
      "**bold** and **outer *inner***.",
      "",
      "`**literal**` and \\*\\*escaped\\*\\*.",
      "",
      "```md",
      "**literal**",
      "```",
      "",
      String.raw`\(H(M)\) and \[H(M\mid C)\].`,
    ].join("\n");
    const output = helpers.renderCopilotMarkdown(root, source, render);
    assert.deepEqual(
      Array.from(output.querySelectorAll("strong"), (node) => node.textContent),
      ["bold", "outer inner"],
    );
    assert.equal(output.querySelector("strong em")?.textContent, "inner");
    assert.equal(output.querySelector("code").textContent, "**literal**");
    assert.equal(
      output.querySelector("pre code").textContent.trim(),
      "**literal**",
    );
    assert.ok(output.textContent.includes("**escaped**"));
    assert.equal(output.querySelectorAll(".katex").length, 2);
    assert.equal(output.querySelectorAll(".katex-display").length, 1);
  });
});

test("renders centernot-implies in every math delimiter without altering code", () => {
  withMessage((root, helpers, render) => {
    const sources = [
      String.raw`\(A\centernot\implies B\)`,
      String.raw`$A\centernot \implies B$`,
      String.raw`\[
A\centernot\implies B
\]`,
      String.raw`$$A\centernot{\implies} B$$`,
      String.raw`In prose \[A\centernot\implies B\] too.`,
    ];
    const literal = String.raw`\centernot\implies`;
    const output = helpers.renderCopilotMarkdown(
      root,
      sources.join("\n\n") +
        `\n\n\`${literal}\`\n\n\`\`\`tex\n${literal}\n\`\`\``,
      render,
    );
    const expressions = Array.from(output.querySelectorAll(".katex-html"));
    assert.equal(expressions.length, 5);
    assert.equal(output.querySelectorAll(".katex-error").length, 0);
    expressions.forEach((expression) => {
      assert.ok(!expression.textContent.includes("centernot"));
      assert.match(expression.textContent, /[\u0338\u21cf\u21ce\ue020]/u);
    });
    assert.equal(output.querySelector("code").textContent, literal);
    assert.equal(output.querySelector("pre code").textContent.trim(), literal);
  });
});

test("repository Markdown supports Firefox and Chromium runtime APIs", async () => {
  for (const api of ["browser", "chrome"]) {
    for (const fails of [false, true]) {
      const dom = new JSDOM(
        '<!doctype html><article class="markdown-body entry-content">Original</article>',
        {
          runScripts: "outside-only",
          url: "https://github.com/owner/repository/blob/main/README.md",
        },
      );
      try {
        const { window } = dom;
        let request;
        let warning;
        const warned = new Promise((resolve) => {
          window.console.warn = (...args) => {
            warning = args;
            resolve();
          };
        });
        const getURL = (name) =>
          `${api === "browser" ? "moz" : "chrome"}-extension://test/${name}`;
        if (api === "browser") {
          window.browser = {
            runtime: {
              getURL,
              sendMessage(message) {
                request = message;
                return fails
                  ? Promise.reject(new Error("Background unavailable"))
                  : Promise.resolve({
                      ok: true,
                      markdown: String.raw`Math: $x^2$`,
                    });
              },
            },
          };
        } else {
          const runtime = {
            getURL,
            lastError: undefined,
            sendMessage(message, callback) {
              request = message;
              runtime.lastError = fails
                ? { message: "Background unavailable" }
                : undefined;
              callback(
                fails
                  ? undefined
                  : { ok: true, markdown: String.raw`Math: $x^2$` },
              );
              runtime.lastError = undefined;
            },
          };
          window.chrome = { runtime };
        }
        window.eval(
          scripts.outputFiles.find((file) => file.path.endsWith("content.js"))
            .text,
        );
        const article = window.document.querySelector("article");
        assert.equal(
          window.document
            .querySelector("link[data-github-latex-stylesheet]")
            .href.startsWith(
              `${api === "browser" ? "moz" : "chrome"}-extension://`,
            ),
          true,
        );
        if (fails) {
          await warned;
          assert.match(warning[1].message, /Background unavailable/);
          assert.equal(article.textContent, "Original");
          assert.equal(article.dataset.githubLatexRendered, undefined);
        } else {
          await waitForDom(window, () =>
            Boolean(article.querySelector(".katex")),
          );
          assert.equal(
            article.dataset.githubLatexRendered,
            window.location.href,
          );
        }
        assert.deepEqual(JSON.parse(JSON.stringify(request)), {
          type: "fetch-markdown",
          url: "https://github.com/owner/repository/raw/refs/heads/main/README.md",
        });
      } finally {
        dom.window.close();
      }
    }
  }
});

test("Copilot display-error fallback supports centernot-implies", () => {
  const dom = new JSDOM(
    String.raw`<!doctype html><math-renderer class="js-display-math"><div class="flash-error">Unsupported command</div><pre>A\centernot\implies B</pre></math-renderer>`,
    {
      runScripts: "outside-only",
      url: "https://github.com/copilot/c/test-thread",
    },
  );
  try {
    const { window } = dom;
    window.chrome = {
      runtime: { getURL: (name) => `chrome-extension://test/${name}` },
    };
    window.eval(
      scripts.outputFiles.find((file) => file.path.endsWith("content.js")).text,
    );
    assert.equal(window.document.querySelector(".flash-error"), null);
    const expression = window.document.querySelector(
      "math-renderer .katex-html",
    );
    assert.ok(expression);
    assert.ok(!expression.textContent.includes("centernot"));
    assert.match(expression.textContent, /[\u0338\u21cf\u21ce\ue020]/u);
  } finally {
    dom.window.close();
  }
});

test("protects multiline bracket math from lists and paragraph breaks", () => {
  withMessage((root, helpers, render) => {
    const source = String.raw`Weakly \(\langle \partial_t u(t),v\rangle
+ a(u(t),v)\).

Therefore \[
\langle \partial_t u(t),v\rangle + a(u(t),v)

+ \varepsilon\int_\Omega u(t)^3 v\,dx = \langle f(t),v\rangle
\]

- A real list item with \(x
+ y\) inside.

Afterward, **normal Markdown**.`;
    const output = helpers.renderCopilotMarkdown(root, source, render);
    assert.equal(output.querySelectorAll(".katex").length, 3);
    assert.equal(output.querySelectorAll(".katex-display").length, 1);
    assert.equal(output.querySelectorAll("li").length, 1);
    assert.equal(output.querySelectorAll(".katex-error").length, 0);
    assert.equal(output.querySelector("strong").textContent, "normal Markdown");
    const prose = output.cloneNode(true);
    prose.querySelectorAll(".katex").forEach((element) => element.remove());
    assert.ok(!prose.textContent.includes("githubBetterLatexMath"));
    assert.ok(!prose.textContent.includes(String.raw`\varepsilon`));
  });
});

test("multiline protection leaves inline, fenced, indented, and escaped code literal", () => {
  withMessage((root, helpers, render) => {
    const formula = String.raw`\(x
+ y\)`;
    const source = [
      "`" + formula + "`",
      "",
      "```tex",
      formula,
      "```",
      "",
      "~~~tex",
      formula,
      "~~~",
      "",
      "    \\(x",
      "    + y\\)",
      "",
      String.raw`\\(escaped`,
      "+ text" + String.raw`\\)`,
      "",
      String.raw`Unclosed \(x`,
      "+ unfinished",
    ].join("\n");
    const output = helpers.renderCopilotMarkdown(root, source, render);
    assert.equal(output.querySelectorAll(".katex").length, 0);
    assert.equal(output.querySelectorAll("pre").length, 3);
    assert.ok(
      output.querySelector("code").textContent.includes(String.raw`\(x`),
    );
    assert.ok(!output.textContent.includes("githubBetterLatexMath"));
    assert.ok(output.textContent.includes("Unclosed (x"));
  });
});

test("restores the rendered sibling if React removes it without removing the native body", () => {
  withMessage((root, helpers, render) => {
    const original = root.firstChild;
    const output = helpers.renderCopilotMarkdown(
      root,
      String.raw`\(H(M)\)`,
      render,
    );
    output.remove();
    helpers.cleanupCopilotMarkdown();
    assert.equal(root.nextElementSibling, output);
    assert.equal(root.firstChild, original);
    assert.equal(output.querySelector(".katex-html").textContent, "H(M)");
    assert.equal(root.hidden, true);
    const rendered = output.firstChild;
    helpers.cleanupCopilotMarkdown();
    assert.equal(output.firstChild, rendered);
  });
});

test("stray backticks do not suppress math in a different paragraph", () => {
  withMessage((root, helpers, render) => {
    const source =
      "A stray ` here.\n\n" +
      String.raw`Weakly \(x
+ y\)` +
      "\n\nA stray ` later.";
    const output = helpers.renderCopilotMarkdown(root, source, render);
    assert.equal(output.querySelectorAll(".katex").length, 1);
    assert.equal(output.querySelectorAll("code").length, 0);
    assert.equal(output.querySelectorAll("li").length, 0);
  });
});

test("an unclosed formula cannot consume a closing delimiter inside fenced code", () => {
  withMessage((root, helpers, render) => {
    const source =
      String.raw`Unclosed \(x

` +
      "```tex\n" +
      String.raw`\)` +
      "\n```";
    const output = helpers.renderCopilotMarkdown(root, source, render);
    assert.equal(output.querySelectorAll(".katex").length, 0);
    assert.equal(
      output.querySelector("pre code").textContent.trim(),
      String.raw`\)`,
    );
  });
});

test("shares macros within a message but never leaks them to subsequent renders", () => {
  withMessage((root, helpers, render) => {
    const first = root.ownerDocument.createElement("div");
    first.innerHTML = render(String.raw`$\gdef\reviewLeak{LEAK}$

Inline \(\reviewLeak\), display \[\reviewLeak\].

More \[
\reviewLeak
\]`);
    const firstVisual = Array.from(
      first.querySelectorAll(".katex-html"),
      (node) => node.textContent,
    ).join(" ");
    assert.equal(firstVisual.split("LEAK").length - 1, 3);
    const second = root.ownerDocument.createElement("div");
    second.innerHTML = render(String.raw`$\reviewLeak$`);
    assert.ok(
      second
        .querySelector(".katex-html")
        .textContent.includes(String.raw`\reviewLeak`),
    );
    assert.ok(
      !second.querySelector(".katex-html").textContent.includes("LEAK"),
    );
    render(String.raw`$\gdef\centernot{WRONG}$`);
    const third = root.ownerDocument.createElement("div");
    third.innerHTML = render(String.raw`$A\centernot\implies B$`);
    assert.match(
      third.querySelector(".katex-html").textContent,
      /[\u0338\u21cf\u21ce\ue020]/u,
    );
    assert.ok(!third.textContent.includes("WRONG"));
  });
});

test("reads exact assistant source rather than guessing from rendered parentheses", () => {
  withMessage((root, helpers) => {
    const message = {
      id: "answer-1",
      role: "assistant",
      content: String.raw`\(H(M)\)`,
    };
    root.__reactFiber$test = {
      stateNode: root,
      return: { memoizedProps: { message } },
    };
    const source = helpers.getCopilotMarkdown(root);
    assert.equal(source.id, message.id);
    assert.equal(source.content, message.content);
    assert.equal(root.textContent, "(H(M))");
  });
});

test("uses the committed alternate after React updates its tree", () => {
  withMessage((root, helpers) => {
    const state = {};
    const oldTree = { stateNode: state };
    const newTree = { stateNode: state, alternate: oldTree };
    oldTree.alternate = newTree;
    const oldOwner = {
      return: oldTree,
      memoizedProps: {
        message: { id: "answer", role: "assistant", content: "Old source" },
      },
    };
    const newOwner = {
      return: newTree,
      memoizedProps: {
        message: { id: "answer", role: "assistant", content: "Updated source" },
      },
    };
    const oldFiber = { stateNode: root, return: oldOwner };
    const newFiber = { stateNode: root, return: newOwner, alternate: oldFiber };
    oldFiber.alternate = newFiber;
    root.__reactFiber$test = oldFiber;
    state.current = oldTree;
    assert.equal(helpers.getCopilotMarkdown(root).content, "Old source");
    state.current = newTree;
    assert.equal(helpers.getCopilotMarkdown(root).content, "Updated source");
    state.current = oldTree;
    assert.equal(helpers.getCopilotMarkdown(root).content, "Old source");
  });
});

test("renders whole formulas, preserves literal parentheses and external controls", () => {
  withMessage((root, helpers, render) => {
    const button = root.parentElement.querySelector("button");
    const source = String.raw`Literal (H(M)), option (a). Inline \(H(M)\) and \(H(M\mid C)\). Code: `;
    const original = root.firstChild;
    const output = helpers.renderCopilotMarkdown(
      root,
      source + "`(H(M))`\n\n$$H(M)$$\n\n<script>alert(1)</script>",
      render,
    );
    const expressions = Array.from(
      output.querySelectorAll(".katex-html"),
      (node) => node.textContent,
    );
    assert.deepEqual(expressions, ["H(M)", "H(M\u2223C)", "H(M)"]);
    assert.ok(output.textContent.includes("Literal (H(M)), option (a)."));
    assert.equal(output.querySelector("code").textContent, "(H(M))");
    assert.equal(output.querySelector("script"), null);
    assert.equal(root.parentElement.querySelector("button"), button);
    assert.equal(root.firstChild, original);
    assert.equal(root.hidden, true);
  });
});

test("does nothing without exact source and rejects user or malformed messages", () => {
  withMessage((root, helpers) => {
    const original = root.innerHTML;
    assert.equal(helpers.getCopilotMarkdown(root), null);
    for (const message of [
      { id: "user-1", role: "user", content: "(H(M))" },
      { id: "answer-1", role: "assistant", content: 123 },
      { role: "assistant", content: "(H(M))" },
    ]) {
      root.__reactFiber$test = { memoizedProps: { message } };
      assert.equal(helpers.getCopilotMarkdown(root), null);
    }
    assert.equal(root.innerHTML, original);
  });
});

test("does not search outside the message boundary or loop on cyclic fibers", () => {
  withMessage((root, helpers) => {
    root.__reactFiber$test = {
      stateNode: root,
      return: {
        stateNode: root.ownerDocument.body,
        memoizedProps: {
          message: { id: "wrong", role: "assistant", content: "Wrong message" },
        },
      },
    };
    assert.equal(helpers.getCopilotMarkdown(root), null);
    const cycle = {};
    cycle.return = cycle;
    root.__reactFiber$test = cycle;
    assert.equal(helpers.getCopilotMarkdown(root), null);
  });
});

test("handles updates and React overwrites without rewriting unchanged output", () => {
  withMessage((root, helpers, render) => {
    const output = helpers.renderCopilotMarkdown(
      root,
      String.raw`\(H(M)\)`,
      render,
    );
    const first = output.firstChild;
    helpers.renderCopilotMarkdown(root, String.raw`\(H(M)\)`, render);
    assert.equal(output.firstChild, first);
    helpers.renderCopilotMarkdown(root, String.raw`\(H(M\mid C)\)`, render);
    assert.equal(
      output.querySelector(".katex-html").textContent,
      "H(M\u2223C)",
    );
    root.textContent = "React overwrite";
    helpers.renderCopilotMarkdown(root, String.raw`\(H(M\mid C)\)`, render);
    assert.equal(root.textContent, "React overwrite");
    assert.equal(
      output.querySelector(".katex-html").textContent,
      "H(M\u2223C)",
    );
    helpers.restoreCopilotMarkdown(root);
    assert.equal(root.hidden, false);
    assert.equal(root.style.display, "");
    assert.equal(output.isConnected, false);
  });
});

test("renders bracket display math within paragraphs and list items", () => {
  withMessage((root, helpers, render) => {
    const source = String.raw`- Inline \(K\), display \[P(C\mid M)=1/2\], then \(M\).

Therefore \[H(M\mid C)=H(M)=1\ \text{bit}\] and more prose.

- A list with a single newline:
  \[
  H(M)=1
  \]
  Follow-up text.`;
    const output = helpers.renderCopilotMarkdown(root, source, render);
    assert.equal(output.querySelectorAll(".katex-display").length, 3);
    assert.equal(output.querySelectorAll(".katex-html").length, 5);
    assert.equal(output.querySelectorAll(".katex-error").length, 0);
    assert.ok(output.textContent.includes("Follow-up text."));
    const prose = output.cloneNode(true);
    prose.querySelectorAll(".katex").forEach((element) => element.remove());
    assert.ok(!prose.textContent.includes(String.raw`\mid`));
  });
});

test("preserves code and literal brackets while supporting all math delimiters", () => {
  withMessage((root, helpers, render) => {
    const source =
      String.raw`Literal [H(M)] and (H(M)). Inline $H(M)$ and \(H(M)\).

Display $$H(M)$$ and \[H(M)\].

\[
H(M)
\]

` + "`\\[H(M)\\]`\n\n```tex\n\\[H(M)\\]\n```\n\nUnclosed \\[H(M)";
    const output = helpers.renderCopilotMarkdown(root, source, render);
    assert.equal(output.querySelectorAll(".katex").length, 5);
    assert.equal(output.querySelectorAll(".katex-display").length, 3);
    assert.ok(output.textContent.includes("Literal [H(M)] and (H(M))."));
    assert.equal(
      output.querySelector("code").textContent,
      String.raw`\[H(M)\]`,
    );
    assert.ok(
      output
        .querySelector("pre code")
        .textContent.includes(String.raw`\[H(M)\]`),
    );
    assert.ok(output.textContent.includes("Unclosed [H(M)"));
  });
});

test("removes output when React removes the original body", () => {
  withMessage((root, helpers, render) => {
    const output = helpers.renderCopilotMarkdown(
      root,
      String.raw`\(H(M)\)`,
      render,
    );
    root.remove();
    helpers.cleanupCopilotMarkdown();
    assert.equal(output.isConnected, false);
  });
});

test("restores native hidden and display attributes exactly", () => {
  withMessage((root, helpers, render) => {
    root.setAttribute("hidden", "until-found");
    root.style.setProperty("display", "grid", "important");
    helpers.renderCopilotMarkdown(root, "First source", render);
    helpers.renderCopilotMarkdown(root, "Updated source", render);
    helpers.restoreCopilotMarkdown(root);
    assert.equal(root.getAttribute("hidden"), "until-found");
    assert.equal(root.style.display, "grid");
    assert.equal(root.style.getPropertyPriority("display"), "important");
  });
});

test("bundled bridge retries startup, validates messages, and restores native content", async () => {
  const dom = new JSDOM(
    '<!doctype html><div class="message-container"><div data-copilot-markdown="true">Native body</div><button>Copy</button></div>',
    {
      runScripts: "outside-only",
      url: "https://github.com/copilot/c/test-thread",
    },
  );
  const { window } = dom;
  try {
    const root = window.document.querySelector("[data-copilot-markdown]");
    const nativeText = root.firstChild;
    const message = {
      id: "answer",
      role: "assistant",
      content: String.raw`Literal (H(M)); \(H(M)\)`,
    };
    root.__reactFiber$test = {
      stateNode: root,
      return: { memoizedProps: { message } },
    };
    window.chrome = {
      runtime: { getURL: (name) => `chrome-extension://test/${name}` },
    };
    let enableReceiver = false;
    let publications = 0;
    let firstPublication;
    const published = new Promise((resolve) => {
      firstPublication = resolve;
    });
    window.postMessage = (data) => {
      if (data?.type === "github-better-latex:copilot-markdown") {
        publications += 1;
        firstPublication();
      }
      if (enableReceiver) {
        window.dispatchEvent(
          new window.MessageEvent("message", {
            source: window,
            origin: window.location.origin,
            data,
          }),
        );
      }
    };
    window.eval(
      scripts.outputFiles.find((file) =>
        file.path.endsWith("copilot-source.js"),
      ).text,
    );
    await published;
    enableReceiver = true;
    window.eval(
      scripts.outputFiles.find((file) => file.path.endsWith("content.js")).text,
    );
    const getOutput = () =>
      window.document.querySelector("[data-github-latex-copilot-output]");
    await waitForDom(window, () => getOutput()?.querySelector(".katex-html"));
    assert.equal(getOutput().querySelector(".katex-html").textContent, "H(M)");
    assert.equal(root.firstChild, nativeText);
    assert.equal(root.hidden, true);
    const before = getOutput().innerHTML;
    const envelope = {
      type: "github-better-latex:copilot-markdown",
      token: root.dataset.githubLatexSourceId,
      page: window.location.href,
      content: "Incorrect content",
    };
    for (const event of [
      { source: window, origin: "https://example.com", data: envelope },
      { source: null, origin: window.location.origin, data: envelope },
      {
        source: window,
        origin: window.location.origin,
        data: { ...envelope, page: "https://github.com/copilot/c/old-thread" },
      },
      {
        source: window,
        origin: window.location.origin,
        data: { ...envelope, token: "unknown" },
      },
    ]) {
      window.dispatchEvent(new window.MessageEvent("message", event));
      assert.equal(getOutput().innerHTML, before);
    }
    message.content = String.raw`\(H(M\mid C)\)`;
    root.firstChild.data = "Native streaming update";
    await waitForDom(
      window,
      () =>
        getOutput()?.querySelector(".katex-html")?.textContent ===
        "H(M\u2223C)",
    );
    assert.equal(root.firstChild, nativeText);
    message.role = "user";
    root.firstChild.data = "Native restored body";
    await waitForDom(window, () => !getOutput());
    assert.equal(root.hidden, false);
    assert.equal(root.textContent, "Native restored body");
    assert.ok(
      publications <= 4,
      "Bridge should not repeatedly publish its own output changes",
    );
    message.role = "assistant";
    root.firstChild.data = "Native body again";
    await waitForDom(window, () => getOutput());
    root.remove();
    await waitForDom(window, () => !getOutput());
  } finally {
    window.close();
  }
});
