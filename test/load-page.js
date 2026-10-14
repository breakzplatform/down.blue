// Loads the app script inlined in index.html into a node:vm sandbox, so tests
// can call its pure functions and Vue methods without a browser or a bundler.
// Vue, ffmpeg and the DOM are replaced by the smallest stubs the script needs
// to evaluate; nothing in the page runs until a test calls it.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PAGE = path.join(__dirname, "..", "index.html");

// The app is the last inline <script> (the one that calls createApp).
function appScriptSource() {
  const html = fs.readFileSync(PAGE, "utf8");
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const app = inline.filter((src) => src.includes("createApp("));
  if (app.length !== 1) throw new Error(`Expected one app script in index.html, found ${app.length}`);
  return app[0];
}

function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); },
  };
}

// Returns { options, sandbox, createInstance }. `options` is the object passed
// to createApp; top-level function declarations are properties of `sandbox`.
// `fetch` and `location` are stubs a test can replace through `sandbox`.
function loadPage({ href = "https://down.blue/" } = {}) {
  let options = null;
  const location = {
    href,
    hash: new URL(href).hash,
    search: new URL(href).search,
    origin: new URL(href).origin,
    replaced: [],
    replace(url) { this.replaced.push(String(url)); },
  };
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    location,
    localStorage: memoryStorage(),
    navigator: { language: "en" },
    document: {
      documentElement: { lang: "en", getAttribute: () => null, setAttribute() {} },
    },
    fetch: async () => { throw new Error("fetch not stubbed"); },
    FFmpegWASM: { FFmpeg: class FFmpeg {} },
    Vue: {
      markRaw: (value) => value,
      createApp(opts) {
        options = opts;
        return { mount() {} };
      },
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(appScriptSource(), sandbox, { filename: "index.html" });
  if (!options) throw new Error("index.html did not call createApp");

  // A plain object standing in for the Vue instance: data, methods bound to
  // it, and computed properties as getters. No reactivity, no lifecycle.
  function createInstance(overrides = {}) {
    const vmThis = {};
    Object.assign(vmThis, options.data.call(vmThis));
    for (const [name, fn] of Object.entries(options.methods)) vmThis[name] = fn.bind(vmThis);
    for (const [name, fn] of Object.entries(options.computed || {})) {
      Object.defineProperty(vmThis, name, { get: () => fn.call(vmThis), configurable: true });
    }
    return Object.assign(vmThis, overrides);
  }

  return { options, sandbox, createInstance };
}

module.exports = { loadPage };
