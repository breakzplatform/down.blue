// Post-deploy check, run on request: `npm run smoke [-- https://down.blue/]`.
// Read-only. Verifies the deployed page still ships the short-link code and
// that the da.gd round trip it depends on resolves to a down.blue target.
const base = process.argv[2] || "https://down.blue/";
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${detail}`}`);
  if (!ok) failures.push(name);
};

const page = await fetch(base + "#", { signal: AbortSignal.timeout(15000) });
const html = await page.text();
check("page responds 200", page.status === 200, `status ${page.status}`);
check("page ships short-hash resolution", html.includes("function parseShortHash") && html.includes("coshorten/"));
check("page shortens with da.gd, not v.gd/is.gd", html.includes("shortenWithDagd") && !/https:\/\/(v|is)\.gd\/create\.php/.test(html));

const target = new URL(base).origin + "/?url=" + encodeURIComponent("https://bsky.app/profile/bsky.app/post/smoke");
try {
  const shortRes = await fetch(`https://da.gd/s?url=${encodeURIComponent(target)}`, { signal: AbortSignal.timeout(10000) });
  const shortUrl = new URL((await shortRes.text()).trim());
  const code = shortUrl.pathname.slice(1);
  check("da.gd shortens a down.blue link", shortRes.ok && shortUrl.hostname === "da.gd" && /^[A-Za-z0-9_]{4,30}$/.test(code), shortUrl.href);
  const resolved = await (await fetch(`https://da.gd/coshorten/${code}`, { signal: AbortSignal.timeout(10000) })).text();
  check("short hash resolves back to the down.blue target", resolved.trim() === target, resolved.trim());
} catch (error) {
  check("da.gd round trip", false, String(error));
}

console.log(failures.length ? `\nSMOKE FAILED: ${failures.join("; ")}` : "\nSMOKE OK");
process.exit(failures.length ? 1 : 0);
