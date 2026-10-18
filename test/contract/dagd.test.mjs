import { test } from "node:test";
import assert from "node:assert/strict";
import { loadHelpers } from "../page-source.mjs";

// Read-only calls against the real da.gd. Skipped with SKIP_NETWORK=1 or when da.gd is unreachable.
async function reachable() {
  if (process.env.SKIP_NETWORK === "1") return false;
  try {
    await fetch("https://da.gd/", { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}

const online = await reachable();
const skip = online ? false : "da.gd unreachable or SKIP_NETWORK=1";
const target = "https://down.blue/?url=" + encodeURIComponent("https://bsky.app/profile/bsky.app/post/contract-test");
let shortCode;

test("s?url= answers with a da.gd short link", { skip }, async () => {
  const res = await fetch(`https://da.gd/s?url=${encodeURIComponent(target)}`, { signal: AbortSignal.timeout(10000) });
  assert.equal(res.status, 200);
  const url = new URL((await res.text()).trim());
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "da.gd");
  shortCode = url.pathname.match(/^\/([A-Za-z0-9_]{4,30})\/?$/)?.[1];
  assert.ok(shortCode, `no short code in ${url}`);
});

test("coshorten/<code> returns the original target", { skip }, async () => {
  assert.ok(shortCode, "depends on the s?url= test");
  const res = await fetch(`https://da.gd/coshorten/${shortCode}`, { signal: AbortSignal.timeout(10000) });
  assert.equal(res.status, 200);
  assert.equal((await res.text()).trim(), target);
});

test("page helpers work end to end against the real service", { skip }, async () => {
  const { shortenWithDagd, dagd } = loadHelpers({ fetch });
  const shortLink = await shortenWithDagd(target);
  assert.match(shortLink, /^https:\/\/down\.blue\/#[A-Za-z0-9_]{4,30}$/);
  const resolved = new URL(await dagd(`coshorten/${shortLink.split("#")[1]}`));
  assert.equal(resolved.hostname, "down.blue");
});
