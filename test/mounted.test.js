"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage } = require("./load-page.js");

function mountAt(href) {
  const { options, createInstance } = loadPage({ href });
  const calls = [];
  const instance = createInstance({
    findVideo() { calls.push(["findVideo", this.postUrl]); },
    resolveShortHash(code) { calls.push(["resolveShortHash", code]); },
  });
  options.mounted.call(instance);
  return calls;
}

test("a shared post url wins over a short hash", () => {
  const calls = mountAt("https://down.blue/?url=https%3A%2F%2Fbsky.app%2Fprofile%2Fa%2Fpost%2F3abc#Ab3x");
  assert.deepEqual(calls, [["findVideo", "https://bsky.app/profile/a/post/3abc"]]);
});

test("a short hash alone is resolved", () => {
  assert.deepEqual(mountAt("https://down.blue/#Ab3x"), [["resolveShortHash", "Ab3x"]]);
});

test("nothing runs without a url or short hash", () => {
  assert.deepEqual(mountAt("https://down.blue/"), []);
});
