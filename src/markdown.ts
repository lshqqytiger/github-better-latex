import katex from "katex";
import MarkdownIt from "markdown-it";
import markdownItCjkFriendly from "markdown-it-cjk-friendly";
import texmath from "markdown-it-texmath";
import { createMathOptions } from "./math-options";

const mathOptions = createMathOptions();

const markdown = new MarkdownIt({ html: false, linkify: true }).use(texmath, {
  engine: katex,
  delimiters: ["brackets", "dollars"],
  katexOptions: mathOptions,
});

markdown.use(markdownItCjkFriendly);

interface ProtectedMath {
  prefix: string;
  expressions: { content: string; displayMode: boolean }[];
}

interface MathEnvironment {
  protectedMath?: ProtectedMath;
}

const codeParser = new MarkdownIt({ html: false });

function isEscaped(source: string, position: number): boolean {
  let backslashes = 0;
  while (position > 0 && source[--position] === "\\") {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

markdown.core.ruler.before("block", "protect_multiline_math", (state) => {
  const environment = state.env as MathEnvironment;
  let prefix = "\\githubBetterLatexMath";
  while (state.src.includes(prefix)) {
    prefix += "Token";
  }
  const protectedMath: ProtectedMath = { prefix, expressions: [] };
  environment.protectedMath = protectedMath;
  const lineOffsets = [0];
  for (let position = 0; position < state.src.length; position += 1) {
    if (state.src[position] === "\n") {
      lineOffsets.push(position + 1);
    }
  }
  const codeRanges: [number, number][] = [];
  const collectCode = (tokens: ReturnType<MarkdownIt["parse"]>): void => {
    tokens.forEach((token) => {
      if (
        (token.type === "fence" || token.type === "code_block") &&
        token.map
      ) {
        codeRanges.push([
          lineOffsets[token.map[0]],
          lineOffsets[token.map[1]] ?? state.src.length,
        ]);
      }
      if (token.children) {
        collectCode(token.children);
      }
    });
  };
  collectCode(codeParser.parse(state.src, {}));

  let result = "";
  let copied = 0;
  for (let position = 0; position < state.src.length; position += 1) {
    const codeRange = codeRanges.find(
      ([start, end]) => position >= start && position < end,
    );
    if (codeRange) {
      position = codeRange[1] - 1;
      continue;
    }
    if (isEscaped(state.src, position)) {
      continue;
    }
    if (state.src[position] === "`") {
      const run = /^`+/.exec(state.src.slice(position))![0];
      const delimiters = /`+/g;
      delimiters.lastIndex = position + run.length;
      const paragraphBreak = /\n[ \t]*\n/g;
      paragraphBreak.lastIndex = position + run.length;
      const boundary =
        paragraphBreak.exec(state.src)?.index ?? state.src.length;
      let closing: RegExpExecArray | null;
      while (
        (closing = delimiters.exec(state.src)) &&
        closing.index < boundary
      ) {
        if (closing[0].length === run.length) {
          position = closing.index + run.length - 1;
          break;
        }
      }
      if (!closing || closing.index >= boundary) {
        position += run.length - 1;
      }
      continue;
    }
    const opening = state.src.slice(position, position + 2);
    if (opening !== "\\(" && opening !== "\\[") {
      continue;
    }
    const closing = opening === "\\(" ? "\\)" : "\\]";
    let end = state.src.indexOf(closing, position + 2);
    while (end >= 0 && isEscaped(state.src, end)) {
      end = state.src.indexOf(closing, end + 2);
    }
    if (end < 0) {
      continue;
    }
    if (
      codeRanges.some(([start, finish]) => start < end + 2 && finish > position)
    ) {
      continue;
    }
    const content = state.src.slice(position + 2, end);
    if (content.includes("\n")) {
      const index =
        protectedMath.expressions.push({
          content,
          displayMode: opening === "\\[",
        }) - 1;
      result += state.src.slice(copied, position) + `${prefix}{${index}}`;
      copied = end + 2;
    }
    position = end + 1;
  }
  state.src = result + state.src.slice(copied);
});

markdown.inline.ruler.before("escape", "protected_math", (state, silent) => {
  const protectedMath = (state.env as MathEnvironment).protectedMath;
  if (
    !protectedMath ||
    !state.src.startsWith(protectedMath.prefix, state.pos)
  ) {
    return false;
  }
  const match = /^\{(\d+)\}/.exec(
    state.src.slice(state.pos + protectedMath.prefix.length),
  );
  if (!match || !protectedMath.expressions[Number(match[1])]) {
    return false;
  }
  if (!silent) {
    const token = state.push("protected_math", "math", 0);
    token.content = match[1];
  }
  state.pos += protectedMath.prefix.length + match[0].length;
  return true;
});

markdown.renderer.rules.protected_math = (
  tokens,
  index,
  options,
  environment: MathEnvironment,
) => {
  const expression =
    environment.protectedMath!.expressions[Number(tokens[index].content)];
  return katex.renderToString(expression.content, {
    ...mathOptions,
    displayMode: expression.displayMode,
  });
};

markdown.inline.ruler.before("escape", "display_brackets", (state, silent) => {
  if (!state.src.startsWith("\\[", state.pos)) {
    return false;
  }
  const end = state.src.indexOf("\\]", state.pos + 2);
  if (end < 0 || end + 2 > state.posMax) {
    return false;
  }
  if (!silent) {
    const token = state.push("display_brackets", "math", 0);
    token.content = state.src.slice(state.pos + 2, end);
  }
  state.pos = end + 2;
  return true;
});

markdown.renderer.rules.display_brackets = (tokens, index) =>
  katex.renderToString(tokens[index].content, {
    ...mathOptions,
    displayMode: true,
  });

export function renderMarkdown(source: string): string {
  const previousMacros = mathOptions.macros;
  mathOptions.macros = createMathOptions().macros;
  try {
    return markdown.render(source);
  } finally {
    mathOptions.macros = previousMacros;
  }
}
