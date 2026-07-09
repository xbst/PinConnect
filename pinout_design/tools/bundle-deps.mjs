import { build } from "esbuild";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const libDir = resolve(__dirname, "..", "lib");

// Bundle CodeMirror into a single ES module
await build({
  stdin: {
    contents: `
      export { EditorView, keymap, lineNumbers, highlightActiveLine,
               highlightActiveLineGutter, drawSelection,
               rectangularSelection } from "@codemirror/view";
      export { EditorState, Compartment } from "@codemirror/state";
      export { StreamLanguage, defaultHighlightStyle,
               syntaxHighlighting, indentOnInput,
               bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
      export { defaultKeymap, history, historyKeymap,
               indentWithTab } from "@codemirror/commands";
      export { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
      export { oneDark } from "@codemirror/theme-one-dark";
    `,
    resolveDir: __dirname,
    loader: "js",
  },
  bundle: true,
  format: "esm",
  minify: true,
  outfile: resolve(libDir, "codemirror", "codemirror.min.js"),
});

console.log("  codemirror.min.js built");

// Bundle smol-toml
await build({
  stdin: {
    contents: `export { parse, stringify } from "smol-toml";`,
    resolveDir: __dirname,
    loader: "js",
  },
  bundle: true,
  format: "esm",
  minify: true,
  outfile: resolve(libDir, "smol-toml.min.js"),
});

console.log("  smol-toml.min.js built");
console.log("Done.");
