"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage } = require("./load-page.js");

const { createInstance } = loadPage();
const app = createInstance();
// Objects built inside the sandbox have another realm's prototypes.
const parse = (input) => JSON.parse(JSON.stringify(app.extractProfileAndPost(input)));

test("extractProfileAndPost: bsky.app URLs", async (t) => {
  await t.test("accepts a full https URL", () => {
    assert.deepEqual(parse("https://bsky.app/profile/alice.bsky.social/post/3kabc123"), {
      profile: "alice.bsky.social",
      post: "3kabc123",
      url: "https://bsky.app/profile/alice.bsky.social/post/3kabc123",
      fromAtmosphere: false,
    });
  });

  await t.test("accepts a URL without a scheme and trims whitespace", () => {
    assert.equal(parse("  bsky.app/profile/alice.bsky.social/post/3kabc123 \n").url,
      "https://bsky.app/profile/alice.bsky.social/post/3kabc123");
  });

  await t.test("accepts http and www, and still counts as bsky.app", () => {
    const parsed = parse("http://www.bsky.app/profile/alice.bsky.social/post/3kabc123");
    assert.equal(parsed.url, "https://bsky.app/profile/alice.bsky.social/post/3kabc123");
    assert.equal(parsed.fromAtmosphere, false);
  });

  await t.test("accepts a DID as the actor", () => {
    assert.equal(parse("https://bsky.app/profile/did:plc:abc123xyz/post/3kabc123").profile, "did:plc:abc123xyz");
  });

  await t.test("decodes a percent-encoded DID", () => {
    assert.equal(parse("https://bsky.app/profile/did%3Aplc%3Aabc123xyz/post/3kabc123").profile, "did:plc:abc123xyz");
  });

  await t.test("drops query string and fragment", () => {
    assert.equal(parse("https://bsky.app/profile/alice.bsky.social/post/3kabc123?ref=x#y").url,
      "https://bsky.app/profile/alice.bsky.social/post/3kabc123");
  });

  await t.test("rebuilds other Atmosphere clients as bsky.app and flags them", () => {
    const parsed = parse("https://deer.social/profile/alice.bsky.social/post/3kabc123");
    assert.equal(parsed.url, "https://bsky.app/profile/alice.bsky.social/post/3kabc123");
    assert.equal(parsed.fromAtmosphere, true);
  });
});

test("extractProfileAndPost: trailing segments", async (t) => {
  await t.test("accepts one trailing slash", () => {
    assert.equal(parse("https://bsky.app/profile/alice.bsky.social/post/3kabc123/").post, "3kabc123");
  });

  for (const input of [
    "https://bsky.app/profile/alice.bsky.social/post/3kabc123/quotes",
    "https://bsky.app/profile/alice.bsky.social/post/3kabc123/reposted-by",
    "https://bsky.app/profile/alice.bsky.social/post/3kabc123//",
    "https://bsky.app/profile/alice.bsky.social/post",
    "https://bsky.app/profile/alice.bsky.social",
    "https://bsky.app/x/profile/alice.bsky.social/post/3kabc123",
  ]) {
    await t.test(`rejects ${input}`, () => {
      assert.throws(() => app.extractProfileAndPost(input), /Invalid URL format/);
    });
  }
});

test("extractProfileAndPost: at:// URIs", async (t) => {
  await t.test("accepts a handle", () => {
    assert.deepEqual(parse("at://alice.bsky.social/app.bsky.feed.post/3kabc123"), {
      profile: "alice.bsky.social",
      post: "3kabc123",
      url: "https://bsky.app/profile/alice.bsky.social/post/3kabc123",
      fromAtmosphere: true,
    });
  });

  await t.test("accepts a DID and one trailing slash", () => {
    assert.equal(parse("at://did:plc:abc123xyz/app.bsky.feed.post/3kabc123/").url,
      "https://bsky.app/profile/did:plc:abc123xyz/post/3kabc123");
  });

  for (const input of [
    "at://alice.bsky.social/app.bsky.feed.like/3kabc123",
    "at://alice.bsky.social/app.bsky.feed.post",
    "at://alice.bsky.social/app.bsky.feed.post/3kabc123/extra",
  ]) {
    await t.test(`rejects ${input}`, () => {
      assert.throws(() => app.extractProfileAndPost(input), /Invalid URL/);
    });
  }
});

test("extractProfileAndPost: invalid actor and rkey", async (t) => {
  for (const input of [
    "https://bsky.app/profile/al%20ice/post/3kabc123",
    "https://bsky.app/profile/alice%2Fbob/post/3kabc123",
    "https://bsky.app/profile/alice/post/3k%25abc",
    "https://bsky.app/profile/alice/post/3k%E0%A4%A",
    "https://bsky.app/profile/alice/post/3k%3Cscript%3E",
    `https://bsky.app/profile/${"a".repeat(254)}/post/3kabc123`,
    `https://bsky.app/profile/alice/post/${"a".repeat(513)}`,
    "at://al ice/app.bsky.feed.post/3kabc123",
  ]) {
    await t.test(`rejects ${input.slice(0, 80)}`, () => {
      assert.throws(() => app.extractProfileAndPost(input), /Invalid URL format/);
    });
  }

  await t.test("accepts the maximum lengths", () => {
    assert.equal(parse(`https://bsky.app/profile/${"a".repeat(253)}/post/${"b".repeat(512)}`).post, "b".repeat(512));
  });
});

test("extractProfileAndPost: dot segments", async (t) => {
  for (const input of [
    "https://bsky.app/profile/./post/3kabc123",
    "https://bsky.app/profile/../post/3kabc123",
    "https://bsky.app/profile/alice/post/.",
    "https://bsky.app/profile/alice/post/..",
    "https://bsky.app/profile/alice/post/%2e",
    "https://bsky.app/profile/alice/post/%2E%2E",
    "at://./app.bsky.feed.post/3kabc123",
    "at://../app.bsky.feed.post/3kabc123",
    "at://alice/app.bsky.feed.post/.",
    "at://alice/app.bsky.feed.post/..",
    "at://alice/app.bsky.feed.post/%2e%2e",
  ]) {
    await t.test(`rejects ${input}`, () => {
      assert.throws(() => app.extractProfileAndPost(input), /Invalid URL format/);
    });
  }
});

test("extractProfileAndPost: not a URL", async (t) => {
  for (const input of ["", null, undefined, "javascript:alert(1)", "ftp://bsky.app/profile/a/post/b", "http://"]) {
    await t.test(`rejects ${JSON.stringify(input)}`, () => {
      assert.throws(() => app.extractProfileAndPost(input), /Invalid URL/);
    });
  }
});
