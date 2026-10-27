"use strict";

const test = require("node:test");
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
