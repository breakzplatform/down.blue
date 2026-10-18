import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadHelpers, loadMethods } from "./page-source.mjs";

const textResponse = (body, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, text: async () => body });

function fetchReturning(body, status) {
  const calls = [];
  const fetch = async (url) => { calls.push(String(url)); return textResponse(body, status); };
  return { fetch, calls };
}

const strings = {
  shareCopied: "copied-short",
  shareCopiedLong: "copied-long",
  shareSharedLong: "shared-long",
  errShortLink: "short-link-error",
  statusResolvingShortLink: "resolving",
};

function createComponent(fetch, extra = {}) {
  const helpers = loadHelpers({ fetch });
  return loadMethods(
    ["downloadShareUrl", "prepareShareUrl", "resolveShortHash"],
    helpers,
    {
      postUrl: "https://bsky.app/profile/a.bsky.social/post/3abc",
      t: strings,
      shareBusy: false,
      shareShortUrl: "",
      shareShortUrlFor: "",
      status: "",
      loadingMode: null,
      ...extra,
    },
  );
}

describe("parseShortHash", () => {
  const { parseShortHash } = loadHelpers({});
  for (const [hash, expected] of [
    ["#abcd", "abcd"],
    ["#Ab_9xyz", "Ab_9xyz"],
    ["#" + "a".repeat(30), "a".repeat(30)],
  ]) {
    test(`accepts ${hash.slice(0, 12)}`, () => assert.equal(parseShortHash(hash), expected));
  }
  for (const hash of ["", "#", "#abc", "#" + "a".repeat(31), "#ab-cd", "#ab cd", "#ab/cd", "abcd", "#abcd#x", undefined, null]) {
    test(`rejects ${JSON.stringify(hash)}`, () => assert.equal(parseShortHash(hash), null));
  }
});

describe("downloadShareUrl", () => {
  test("encodes the post url into a down.blue link", () => {
    const component = createComponent(async () => { throw new Error("no network"); });
    assert.equal(
      component.downloadShareUrl(),
      "https://down.blue/?url=https%3A%2F%2Fbsky.app%2Fprofile%2Fa.bsky.social%2Fpost%2F3abc",
    );
  });
});

describe("shortenWithDagd", () => {
  test("turns a da.gd link into a down.blue short link", async () => {
    const { fetch, calls } = fetchReturning("https://da.gd/Ab3x\n");
    const { shortenWithDagd } = loadHelpers({ fetch });
    assert.equal(await shortenWithDagd("https://down.blue/?url=x"), "https://down.blue/#Ab3x");
    assert.match(calls[0], /^https:\/\/da\.gd\/s\?url=https%3A%2F%2Fdown\.blue%2F%3Furl%3Dx$/);
  });

  for (const [label, body, status] of [
    ["foreign host", "https://evil.example/Ab3x", 200],
    ["missing code", "https://da.gd/", 200],
    ["code too short", "https://da.gd/ab", 200],
    ["non-url body", "Error, database insert failed", 200],
    ["http error", "nope", 500],
  ]) {
    test(`rejects ${label}`, async () => {
      const { shortenWithDagd } = loadHelpers({ fetch: fetchReturning(body, status).fetch });
      await assert.rejects(shortenWithDagd("https://down.blue/?url=x"));
    });
  }
});

describe("share result (must not silently fall back to the long link)", () => {
  test("happy path returns the SHORT url and marks it shortened", async () => {
    const component = createComponent(fetchReturning("https://da.gd/Ab3x").fetch);
    const result = await component.prepareShareUrl();
    assert.deepEqual({ ...result }, { url: "https://down.blue/#Ab3x", shortened: true });
    assert.notEqual(result.url, component.downloadShareUrl());
    assert.equal(component.shareBusy, false);
  });

  test("short url is cached for the same post", async () => {
    const { fetch, calls } = fetchReturning("https://da.gd/Ab3x");
    const component = createComponent(fetch);
    await component.prepareShareUrl();
    await component.prepareShareUrl();
    assert.equal(calls.length, 1);
  });

  test("failed shortening is reported as a fallback, never as success", async () => {
    const warnings = [];
    const component = createComponent(async () => { throw new Error("network down"); });
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args);
    let result;
    try { result = await component.prepareShareUrl(); } finally { console.warn = originalWarn; }
    assert.equal(result.shortened, false);
    assert.equal(result.url, component.downloadShareUrl());
    assert.equal(warnings.length, 1, "the failure must be logged");
    assert.equal(component.shareShortUrl, "", "a fallback must not be cached as a short link");
    assert.equal(component.shareBusy, false);
  });

  test("a bad da.gd answer (foreign host) is also a fallback", async () => {
    const component = createComponent(fetchReturning("https://evil.example/Ab3x").fetch);
    const originalWarn = console.warn;
    console.warn = () => {};
    try { assert.equal((await component.prepareShareUrl()).shortened, false); } finally { console.warn = originalWarn; }
  });
});

describe("resolveShortHash", () => {
  async function resolve(body, status) {
    const replaced = [];
    const component = createComponent(fetchReturning(body, status).fetch, {
      location: { replace: (url) => replaced.push(url) },
    });
    const originalError = console.error;
    console.error = () => {};
    try { await component.resolveShortHash("Ab3x"); } finally { console.error = originalError; }
    return { component, replaced };
  }

  test("redirects to the down.blue target", async () => {
    const { replaced, component } = await resolve("https://down.blue/?url=https%3A%2F%2Fbsky.app%2Fx");
    assert.deepEqual(replaced, ["https://down.blue/?url=https%3A%2F%2Fbsky.app%2Fx"]);
    assert.notEqual(component.status, strings.errShortLink);
  });

  for (const [label, body, status] of [
    ["another host", "https://evil.example/?url=x", 200],
    ["a look-alike host", "https://down.blue.evil.example/", 200],
    ["plain http", "http://down.blue/", 200],
    ["a non-url answer", "no such code", 200],
    ["a 404", "not found", 404],
  ]) {
    test(`refuses ${label} and shows the error`, async () => {
      const { replaced, component } = await resolve(body, status);
      assert.deepEqual(replaced, []);
      assert.equal(component.status, strings.errShortLink);
      assert.equal(component.loadingMode, null);
    });
  }
});
