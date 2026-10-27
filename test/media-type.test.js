"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage } = require("./load-page.js");

const { sandbox } = loadPage();

test("mediaTypeOrOctetStream keeps media types", () => {
  for (const type of ["video/mp4", "video/quicktime", "image/gif", "video/MP2T", "video/mp4; codecs=avc1"]) {
    assert.equal(sandbox.mediaTypeOrOctetStream(type), type);
  }
});

test("mediaTypeOrOctetStream neutralizes types a blob: URL would render", () => {
  for (const type of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/html; charset=utf-8", "", null]) {
    assert.equal(sandbox.mediaTypeOrOctetStream(type), "application/octet-stream");
  }
});
