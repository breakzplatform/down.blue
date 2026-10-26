"use strict";

// Issue #3: mux.js writes 0xFFFFFFFF as every duration in the init segment, so VLC and
// WhatsApp show 13:15:21. These tests build tiny fragmented MP4s by hand and check that
// the durations are rewritten from the fragments.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage } = require("./load-page.js");

const { sandbox } = loadPage();
const { collectFragmentSpans, withFragmentDurations } = sandbox;

const UNKNOWN = 0xffffffff;

function u32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function box(type, ...payload) {
  const body = Buffer.concat(payload);
  return Buffer.concat([u32(body.length + 8), Buffer.from(type, "ascii"), body]);
}

const fullBox = (type, version, flags, ...payload) =>
  box(type, u32((version << 24) | flags), ...payload);

const mvhd = (timescale) =>
  fullBox("mvhd", 0, 0, u32(0), u32(0), u32(timescale), u32(UNKNOWN), Buffer.alloc(80));
const tkhd = (trackId) =>
  fullBox("tkhd", 0, 3, u32(0), u32(0), u32(trackId), u32(0), u32(UNKNOWN), Buffer.alloc(60));
const mdhd = (timescale) =>
  fullBox("mdhd", 0, 0, u32(0), u32(0), u32(timescale), u32(UNKNOWN), u32(0));
const trak = (trackId, timescale) => box("trak", tkhd(trackId), box("mdia", mdhd(timescale)));

function initSegment(movieTimescale, tracks) {
  return new Uint8Array(Buffer.concat([
    box("ftyp", Buffer.from("isom")),
    box("moov", mvhd(movieTimescale), ...tracks.map(([id, scale]) => trak(id, scale)),
      box("mvex", fullBox("mehd", 0, 0, u32(UNKNOWN)))),
  ]));
}

// One traf: per-sample durations in the trun, or a default duration in the tfhd.
function traf(trackId, decodeTime, durations, { defaultDuration } = {}) {
  const tfhd = defaultDuration === undefined
    ? fullBox("tfhd", 0, 0, u32(trackId))
    : fullBox("tfhd", 0, 0x08, u32(trackId), u32(defaultDuration));
  const tfdt = fullBox("tfdt", 0, 0, u32(decodeTime));
  const trun = defaultDuration === undefined
    ? fullBox("trun", 0, 0x101, u32(durations.length), u32(0), ...durations.map(u32))
    : fullBox("trun", 0, 0x001, u32(durations.length), u32(0));
  return box("traf", tfhd, tfdt, trun);
}

const fragment = (...trafs) =>
  new Uint8Array(Buffer.concat([box("moof", ...trafs), box("mdat", Buffer.alloc(16))]));

// Reads the duration of the first box of `type` in a v0 init segment.
function durationOf(bytes, type, nth = 0) {
  const buffer = Buffer.from(bytes);
  let index = -1;
  for (let i = 0; i <= nth; i++) index = buffer.indexOf(type, index + 1, "ascii");
  const body = index + 4;
  const offset = { mvhd: 16, mdhd: 16, tkhd: 20, mehd: 4 }[type];
  return buffer.readUInt32BE(body + offset);
}

test("rewrites every 0xFFFFFFFF duration from the fragments", () => {
  // Video at 90 kHz from 0; audio at 48 kHz starting 3252 ticks late, like the real sample.
  const spans = new Map();
  collectFragmentSpans(fragment(traf(256, 0, [3000, 3000]), traf(257, 3252, [1024, 1024])), spans);
  collectFragmentSpans(fragment(traf(256, 6000, [3000]), traf(257, 5300, [1024])), spans);

  const fixed = withFragmentDurations(initSegment(90000, [[256, 90000], [257, 48000]]), spans);

  assert.equal(durationOf(fixed, "mdhd", 0), 9000);
  assert.equal(durationOf(fixed, "mdhd", 1), 6324 - 3252);
  assert.equal(durationOf(fixed, "tkhd", 0), 9000);
  assert.equal(durationOf(fixed, "tkhd", 1), Math.round((6324 * 90000) / 48000));
  assert.equal(durationOf(fixed, "mvhd"), Math.round((6324 * 90000) / 48000));
  assert.equal(durationOf(fixed, "mehd"), durationOf(fixed, "mvhd"));
  assert.equal(Buffer.from(fixed).includes(u32(UNKNOWN)), false);
});

test("uses the tfhd default when the trun has no sample durations", () => {
  const spans = new Map();
  collectFragmentSpans(fragment(traf(1, 0, [0, 0, 0], { defaultDuration: 512 })), spans);
  const fixed = withFragmentDurations(initSegment(1000, [[1, 1000]]), spans);
  assert.equal(durationOf(fixed, "mdhd"), 1536);
  assert.equal(durationOf(fixed, "mvhd"), 1536);
});

test("leaves the header alone when there are no fragments", () => {
  const init = initSegment(90000, [[256, 90000]]);
  const fixed = withFragmentDurations(init, new Map());
  assert.deepEqual(Buffer.from(fixed), Buffer.from(init));
});

test("does not modify the init segment it was given", () => {
  const init = initSegment(90000, [[256, 90000]]);
  const before = Buffer.from(init);
  const spans = new Map();
  collectFragmentSpans(fragment(traf(256, 0, [3000])), spans);
  withFragmentDurations(init, spans);
  assert.deepEqual(Buffer.from(init), before);
});
