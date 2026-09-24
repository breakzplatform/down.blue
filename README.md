# down.blue

Download videos and GIFs from Bluesky and the rest of the Atmosphere, straight from your browser. Everything runs on your device: there is no server, no sign-in and no analytics.

**Use it at <https://down.blue>.** The old address, <https://downloader.notx.blue>, redirects there.

Made by [@joseli.to](https://bsky.app/profile/joseli.to). MIT licensed.

## Using it

Paste the link to a post that has a video and pick a format:

- **Original (raw)** is the file exactly as it was uploaded, fetched from the author's PDS.
- **Full quality MP4** converts that original file to MP4, keeping the video as is and converting only the audio when it can.
- **720p MP4** is built from Bluesky's HLS stream, a lighter file.

Posts with an external GIF (Tenor, Giphy) get a single download button instead.

Links from any Atmosphere client work, as long as they use the usual `/profile/<handle>/post/<id>` path: bsky.app, deer.social, blacksky.community and so on. You can also paste an `at://` URI. Quote posts work too, including a quote that has images of its own next to the quoted video.

To open a post directly, add it to the address: `https://down.blue/?url=<post link>`.

Your recent downloads stay in a history panel. It lives in your browser's `localStorage` and never leaves your device.

### Without opening the page

Reply to a video post mentioning [@down.blue](https://bsky.app/profile/down.blue) and the bot answers with a download link. The bot lives in its own repository, [breakzplatform/down-blue-bot](https://github.com/breakzplatform/down-blue-bot). There is also an iOS Shortcut, linked from the bot's profile.

## How it works

1. The page reads the handle (or DID) and the post id from the link. The rest of the link is thrown away, so the site you copied it from does not matter.
2. It asks the public Bluesky API for the post (`app.bsky.feed.getPostThread`, no authentication). If the post does not exist, this step fails.
3. It looks through the post's embeds, including quoted posts, for a video or a GIF.
4. Depending on the format, it fetches the original file from the author's PDS or the HLS playlist and its `.ts` segments. Everything is converted in your browser: the 720p stream is repackaged as MP4 with [mux.js](https://github.com/videojs/mux.js), and [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) handles the original file and any stream mux.js cannot. ffmpeg copies the video first and re-encodes only if that fails.

The whole app is one file, `index.html`, using Vue 3 without a build step.

## Running it locally

Any static server works:

```sh
npx http-server -p 8080
```

Then open <http://localhost:8080>. ffmpeg runs single-threaded, so you do not need special headers locally. The COOP/COEP headers in `_headers` are kept only in case a multi-threaded build comes back.

## Project layout

```
.
├── index.html               # the whole app: markup, styles, Vue code
├── _headers                 # COOP/COEP headers for Netlify and Cloudflare Pages
├── netlify.toml             # publish settings; strips scripts/ from the deployed site
├── og.png                   # link preview image
├── apple-touch-icon.png     # home screen icon
├── lib/                     # vendored libraries, version in the file name
├── assets/                  # compiled Tailwind CSS
└── scripts/                 # tooling only, never deployed
    ├── build-css.sh         # rebuilds assets/tailwind-*.css
    ├── build-social.sh      # renders og.html to og.png and banner.html to banner.png
    ├── build-icons.sh       # renders avatar.svg to avatar.png and the home screen icon
    ├── og.html, banner.html, avatar.svg, favicon.svg
    ├── tailwind-input.css, tailwind-theme.css
    ├── package.json, pnpm-lock.yaml   # pin the Tailwind CLI, nothing else
    └── ds/                  # copy of the joseli.to design system tokens
```

`lib/814.ffmpeg.js` is the one vendored file without a version in its name: the ffmpeg package loads it by that exact name.

Fonts are not in the repository. They load from `static.joseli.to`.

### Changing styles

The CSS is Tailwind v4, compiled ahead of time. After changing Tailwind classes in `index.html`, rebuild it:

```sh
./scripts/build-css.sh
```

The script installs the pinned Tailwind CLI with pnpm the first time it runs. The default Tailwind palette, radii and shadows are disabled on purpose, so use the design system names (`bg-surface-page`, `text-text-2`, `shadow-2` and so on).

### Changing the preview image, banner or icons

Edit `scripts/og.html`, `scripts/banner.html`, `scripts/avatar.svg` or `scripts/favicon.svg`, then run `./scripts/build-social.sh` or `./scripts/build-icons.sh`. The banner and avatar are for the @down.blue profile and are not deployed. Both need Chrome installed. The favicon is inlined in `index.html` by hand.

## Known limitations

Long videos are the weak spot. Bluesky allows up to ten minutes, and single-threaded ffmpeg keeps the whole input and output in memory, so a long video can be slow or fail on a phone.

Only the post lookup has a timeout. If a later download hangs, reload the page.

Cancelling a download does not stop an ffmpeg conversion that has already started. The result is discarded, but the work runs to the end.

There are no automated tests yet. The HLS parsers (`parseHighestQualityVideoUrl`, `parseSegmentUrls`, `extractSubtitleLang`) and the URL and embed parsers (`extractProfileAndPost`, `extractVideoInfo`) are the best place to start.

## Contributing

Issues and pull requests are welcome. Please test in a browser before sending a change: a regular video, a quote post, an invalid link, and both the light and dark themes. The page promises no analytics, so any telemetry has to be opt-in.

## Support

[Buy Me a Coffee](https://buymeacoffee.com/joselito)

## Notice

Respect copyright and Bluesky's terms of service. This tool only downloads media that is already public, and it does not bypass any access control.
