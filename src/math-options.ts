import type { KatexOptions } from "katex";

export function createMathOptions(): KatexOptions {
  return {
    throwOnError: false,
    trust: false,
    macros: { "\\centernot": "\\not" },
  };
}
