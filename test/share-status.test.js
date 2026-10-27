"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { loadPage } = require("./load-page.js");

const { createInstance } = loadPage();

test("the share status follows a language switch and keeps its error style", () => {
  const app = createInstance({ lang: "en" });
  app.shareStatusKey = "shareCopyFailed";
  const english = app.shareStatus;
  assert.ok(app.shareStatusIsError);
  app.lang = "pt";
  assert.notEqual(app.shareStatus, english);
  assert.equal(app.shareStatus, app.t.shareCopyFailed);
  assert.ok(app.shareStatusIsError);
});

test("a success status is not styled as an error", () => {
  const app = createInstance({ shareStatusKey: "shareCopied" });
  assert.equal(app.shareStatus, app.t.shareCopied);
  assert.equal(app.shareStatusIsError, false);
});

describe("share link when da.gd is down", () => {
  function setup() {
    const page = loadPage();
    const fetches = [];
    page.sandbox.fetch = async (url) => { fetches.push(String(url)); throw new Error("da.gd down"); };
    const shared = [];
    // The first share rejects as if the tap expired while da.gd was failing.
    page.sandbox.navigator.share = async (data) => {
      shared.push(data.url);
      if (shared.length === 1) throw Object.assign(new Error("no gesture"), { name: "NotAllowedError" });
    };
    const app = page.createInstance({ sharePostUrl: "https://bsky.app/profile/a/post/3abc" });
    return { app, fetches, shared };
  }

  test("an expired tap on the full link says so, and the retry skips da.gd", async () => {
    const { app, fetches, shared } = setup();
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      await app.shareDownloadLink();
      assert.equal(app.shareStatusKey, "shareRetryLong");
      await app.shareDownloadLink();
    } finally { console.warn = originalWarn; }
    assert.equal(fetches.length, 1, "the second tap must not wait on da.gd again");
    assert.deepEqual(shared, [app.downloadShareUrl(), app.downloadShareUrl()]);
    assert.equal(app.shareStatusKey, "shareSharedLong");
  });
});
