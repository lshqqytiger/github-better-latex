declare module "markdown-it-texmath" {
  import type MarkdownIt from "markdown-it";

  interface TexmathOptions {
    engine: typeof import("katex");
    delimiters: "brackets";
    katexOptions?: import("katex").KatexOptions;
  }

  function texmath(markdown: MarkdownIt, options: TexmathOptions): void;
  export default texmath;
}