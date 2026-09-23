# down.blue: Bluesky video downloader

A static single page that downloads and converts Bluesky videos entirely in the browser. No backend. Live at <https://downloader.notx.blue> and <https://down.blue>.

By [@joseli.to](https://bsky.app/profile/joseli.to).

## How it works

1. You paste a Bluesky post URL (`https://bsky.app/profile/<handle>/post/<rkey>`).
2. `extractProfileAndPost()` pulls `profile` and `post` out of it with a regex.
3. It fetches `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=at://<profile>/app.bsky.feed.post/<post>&depth=10`, the public AT Protocol API, no auth.
4. `extractVideoUrl()` walks the post's `embed` (`app.bsky.embed.video`, `record`, `record#view`, `external#view`) looking for an HLS playlist or an external GIF.
5. For video it downloads `master.m3u8`, picks the highest-quality variant, downloads that variant's `.m3u8`, then fetches the `.ts` segments in batches of six and concatenates them.
6. It converts TS to MP4 with [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm), trying `-c copy` first and falling back to `libx264 + aac`.
7. For external GIFs it fetches the URL and hands back the blob.
8. History lives in `localStorage` under `urlHistory`, and `?url=...` processes a post automatically.

Conversion uses the single-thread `@ffmpeg/core`, which does not need `SharedArrayBuffer` or the COOP/COEP headers. The headers stay in `_headers` and in a `<meta>` tag anyway, harmless, in case the multi-thread core comes back.

## The bot

Mentioning [@down.blue](https://bsky.app/profile/down.blue) in a reply to a video post answers with a download link, so you never have to open this page. The bot is a separate project: [breakzplatform/down-blue-bot](https://github.com/breakzplatform/down-blue-bot). There is also an iOS Shortcut, linked from the bot's profile.

## Layout

```
.
├── index.html                          # the whole app: HTML, Vue 3, logic
├── _headers                            # COOP/COEP for Netlify and Cloudflare Pages
├── LICENSE                             # MIT
├── share.png                           # Open Graph image
├── lib/                                # vendored third-party libs, version in the filename
│   ├── vue-3.5.34.min.js
│   ├── mux-7.0.3.min.js                # mux.js, remuxes TS to MP4 without wasm
│   ├── ffmpeg-0.12.7.min.js            # @ffmpeg/ffmpeg 0.12.7
│   ├── 814.ffmpeg.js                   # class worker, fixed name required by webpack
│   ├── ffmpeg-core-st-0.12.6.js        # single-thread ffmpeg-core
│   └── ffmpeg-core-st-0.12.6.wasm
├── assets/
│   └── tailwind-4.3.3.css              # compiled CSS, generated, not vendored
└── scripts/                            # none of this ships; the deploy prunes it
    ├── build-css.sh                    # regenerates assets/tailwind-*.css
    ├── package.json                    # pins the Tailwind CLI only
    ├── pnpm-lock.yaml                  # 66 packages locked by integrity
    ├── tailwind-input.css              # build entry point
    ├── tailwind-theme.css              # Tailwind v4 bridge, @theme only, no values
    └── ds/                             # verbatim copy of the joseli.to design system
```

Fonts are not versioned here. They come from `static.joseli.to`, which sends `access-control-allow-origin: *` and caches for a year.

## Running it locally

The core is single-thread, so any static server works and you do not need COOP/COEP:

```sh
npx http-server -p 8080
```

## Deploying

Netlify publishes the repo root. The build command is not a build: it deletes the files that should not reach the CDN (`scripts/`, `netlify.toml`, `.gitignore`). To keep something else off the public site, add it to that `rm -rf`.

All the npm metadata sits under `scripts/` on purpose. Netlify decides whether to install dependencies by looking for a `package.json` at the site root, so keeping it out of the root means the deploy installs nothing.

Regenerating the stylesheet is the one manual step, needed whenever Tailwind classes change in `index.html` or the design system in `scripts/ds/` is replaced:

```sh
./scripts/build-css.sh
```

## Known problems

These are confirmed, in rough order of how much they hurt.

Starting a second download while one is running corrupts state. Clicking a history card mid-conversion calls `resetState()`, which revokes the blob URL the running download is still writing to, and both callers share `input.ts` and `out.mp4` inside the wasm filesystem.

A failed `ffmpeg.exec` looks like a success. The worker posts the return code instead of throwing, so the `try/catch` around the copy-codec attempt never fires and the `libx264` fallback never runs. A partial `out.mp4` gets downloaded as if it were fine.

A quoted video is fetched under the wrong DID. The walker closes over the outer post's author, so raw and full-quality downloads of someone else's quoted video ask the wrong PDS for the blob and get a 404. The 720p path still works because its playlist URL is absolute.

A quoted video is dropped when it sits beside other media. `recordWithMedia#view` only returns when `media` is a video or an external URI, so a quote of a video post that also has images reports "quote post without video".

URL parsing swallows query strings. The regex is unanchored and `[^/]+` does not stop at `?` or `#`, so `...?ref=share` becomes part of the rkey and the post "does not exist". `postUrl.includes('bsky.app')` accepts any URL containing that substring, and a stored `javascript:` URL later ends up bound to an `href`.

Only `getPostThread` has a timeout. PDS resolution, blob fetches, playlists, segments and `ffmpeg.exec` all run unbounded, so one hang leaves the button disabled until reload.

`localStorage` failures are swallowed. `loadHistory` parses without a `try` and runs before the ffmpeg preload, so corrupt history aborts the rest of startup. The quota path trims memory but not storage, so a reload brings the old list back.

Blob URLs are only revoked on the next search, so downloading raw then 720p then GIF on one post leaks each previous blob for the life of the page.

`getPostThread` asks for `depth=10` and inherits `parentHeight=80` while the handler reads only `data.thread.post`. A reply in a long thread can hit the 15-second timeout for nothing.

## Other debt

No CI and no tests. Nothing checks a change before it deploys.

No bundler. `index.html` loads Vue and ffmpeg through synchronous `<script>` tags, so the app code is unminified and there is no code splitting.

Everything is in one file. Markup, styles, data, methods and the HLS parsers are mixed together, which makes review hard and unit testing impossible without extracting first.

The page is Computer Modern throughout, including body copy. Five faces, around 856 KB, served with `font-display: swap` so they do not block first paint. Subsetting would cut most of that, but it belongs to the asset host, not to this repo.

Headers live in two places. `<meta http-equiv>` has partial browser support; `_headers` is what actually applies in production.

No SRI on the vendored scripts, and no version marker inside them, which makes a supply-chain audit awkward.

`urlHistory` grows without a cap. No `robots.txt` or `sitemap.xml`. The canonical URL and `og:image` point at `https://down.blue`, which breaks previews on forks and staging. The preview image is generated: edit `scripts/og.html` and run `./scripts/build-og.sh`.

`isWebCodecsSupported()` exists but the native fast path looks incomplete, and everything falls back to ffmpeg anyway.

## What to fix next

Roughly by return on effort:

1. Guard against overlapping downloads with a single `AbortController` and a monotonic operation id. This is the one that corrupts user-visible state.
2. Check the `ffmpeg.exec` return code so the re-encode fallback actually runs.
3. Parse the post URL with `new URL()` and require `https:` and `hostname === 'bsky.app'`, then store only the normalized URL.
4. Add `&depth=0&parentHeight=0` to both thread fetches.
5. Give every remaining fetch a timeout, and store the `ensureFfmpeg()` promise so a preload and a click cannot both call `load()`.
6. Unit tests for `extractProfileAndPost`, `extractVideoUrl`, `parseHighestQualityVideoUrl`, `parseSegmentUrls` and `extractSubtitleLang`. They are pure functions covering the heart of the parser.
7. SRI and explicit versions for everything in `lib/`.
8. A service worker that caches `ffmpeg-core.wasm`, about 25 MB, which would pay for itself on the second visit.
9. Cap and rotate `urlHistory`, say 50 entries.
10. Move to Vite and split `index.html` into modules. That would also make the multi-thread `@ffmpeg/core` workable again, which matters for long videos.

If telemetry is ever added, keep it opt-in. The page currently says it collects no analytics, and that claim is part of the point.

## Support

Pix · [APOIA.se/joselito](https://apoia.se/joselito) · [Buy Me a Coffee](https://buymeacoffee.com/joselito)

## Notice

Respect copyright and Bluesky's terms of service. This tool only rearranges media that is already public. It does not bypass access controls.
