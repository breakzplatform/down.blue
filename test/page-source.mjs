import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function sliceBlock(source, start) {
  const open = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("Unbalanced braces in index.html");
}

function findDeclaration(pattern, name) {
  const match = html.match(pattern);
  if (!match) throw new Error(`${name} not found in index.html`);
  return sliceBlock(html, match.index);
}

/** Top-level helpers (parseShortHash, dagd, shortenWithDagd) run in a sandbox with the given globals. */
export function loadHelpers(globals = {}) {
  const names = ["parseShortHash", "dagd", "shortenWithDagd"];
  const code = names
    .map((name) => findDeclaration(new RegExp(`^ *(async )?function ${name}\\(`, "m"), name))
    .join("\n");
  const context = vm.createContext({ AbortSignal, URL, encodeURIComponent, ...globals });
  vm.runInContext(`${code}\nthis.exports = { ${names.join(", ")} };`, context);
  return context.exports;
}

/** Vue methods of the app, bound to a plain object standing in for the component. */
export function loadMethods(names, helpers, state = {}) {
  const component = { ...state };
  const code = names
    .map((name) => findDeclaration(new RegExp(`^ *(async )?${name}\\(`, "m"), name))
    .map((source) => source.replace(/^\s+/, "").replace(/^(async )?/, "$1function "))
    .join("\n");
  const context = vm.createContext({ ...helpers, URL, encodeURIComponent, console, location: state.location });
  vm.runInContext(`${code}\nthis.exports = { ${names.join(", ")} };`, context);
  for (const name of names) component[name] = context.exports[name];
  return component;
}
