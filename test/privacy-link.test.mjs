import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("footer links to the central privacy policy", () => {
  assert.match(html, /<a href="https:\/\/notx\.blue\/privacy">\{\{ t\.privacyLink \}\}<\/a>/);
  assert.match(html, /privacyLink: "Privacy"/);
  assert.match(html, /privacyLink: "Privacidade"/);
});

test("does not claim to use no external services", () => {
  assert.doesNotMatch(html, /no external services/i);
  assert.doesNotMatch(html, /não usa serviços externos/i);
});
