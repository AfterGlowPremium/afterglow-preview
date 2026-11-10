// d28zzg unit tests for the four feedback-review fixes. Run: node --test tests/
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = path.join(__dirname, "..");
const load = (ctx, f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });

// ---------- sandbox with the real model.js + obscheck.js + obs.js ----------
function sandbox(nowS, search = "") {
  const store = new Map();
  const localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), key: i => [...store.keys()][i] ?? null, get length() { return store.size; } };
  const w = { console, Math, JSON, Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(nowS * 1000); } static now() { return nowS * 1000; } },
    location: { search, pathname: "/afterglow-preview/app.html" }, localStorage, URLSearchParams, fetch: () => Promise.reject(new Error("offline test")), setTimeout, clearTimeout, Intl, TextDecoder, crypto: globalThis.crypto, Uint8Array, DataView, ArrayBuffer };
  w.window = w; w.globalThis = w; const ctx = vm.createContext(w);
  for (const f of ["model.js", "obscheck.js", "obs.js", "fbutil.js"]) load(ctx, f);
  return w;
}
// synthetic forecast: constant hourly cloud for 2 days around a sunset at T0
const T0 = Date.UTC(2026, 10, 4, 21, 50) / 1000;   // Windmill Point-ish sunset, 4:50 PM EST
function hourly(cl, extra = {}) { const time = [], n = 72, t0 = Math.floor((T0 - 36 * 3600) / 3600) * 3600; for (let i = 0; i < n; i++) time.push(t0 + i * 3600);
  const c = v => time.map(() => v), h = { time, cloud_cover: c(cl.total ?? Math.max(cl.low, cl.mid, cl.high)), cloud_cover_low: c(cl.low), cloud_cover_mid: c(cl.mid), cloud_cover_high: c(cl.high),
    relative_humidity_2m: c(55), relative_humidity_850hPa: c(40), relative_humidity_500hPa: c(40), relative_humidity_300hPa: c(50), temperature_2m: c(60), dew_point_2m: c(40), visibility: c(30000),
    wind_speed_10m: c(6), wind_gusts_10m: c(10), wind_direction_10m: c(270), precipitation: c(0), precipitation_probability: c(0), cape: c(0), weather_code: c(cl.total > 50 ? 3 : 0), pressure_msl: c(1018) };
  return Object.assign(h, extra); }
const SP = { id: "windmill", lat: 37.61, lng: -76.29, arc: [180, 330], obst: 0, water: true, type: "Beach" };
function inputs(spot, path) { const S = { hourly: hourly(spot), daily: { sunset: [T0], sunrise: [T0 - 10 * 3600] } }; const W = [0, 1, 2, 3].map(() => ({ hourly: hourly(path || spot) })); return [SP, S, W, { hourly: hourly(spot) }, 0, null]; }

test("B1 parseLayers / metarBands read the obs.js multi-station layer string", () => {
  const X = sandbox(T0).AGObsCheck;
  const L = X.parseLayers("KLFI:OVC140 KPHF:BKN130 OVC150 KORF:CLR");
  assert.deepEqual(Object.keys(L), ["KLFI", "KPHF", "KORF"]);
  assert.equal(L.KPHF.length, 2); assert.equal(L.KLFI[0].ft, 14000);
  const b = X.metarBands({ layers: "KLFI:OVC140 KPHF:OVC130" }); assert.equal(b.deck, 1); assert.equal(b.base, 13000); assert.equal(b.mid, 1); assert.equal(b.low, 0);
  assert.ok(X.metarBands({ layers: "KLFI:OVC140 KORF:CLR" }).deck < 0.9, "one overcast station of two is not 'overcast'");
});

test("B1 overcastCap: observed deck + no gap caps; a real gap never caps", () => {
  const X = sandbox(T0).AGObsCheck, m = { layers: "KLFI:OVC140 KPHF:OVC130" };
  const evHi = { tSet: T0, s: { low: 0, mid: 0, high: 100 }, gapOpen: 1 };   // Buckroe Nov 5: model 100 % high, nothing low/mid
  const u = X.overcastCap(evHi, m, null, null); assert.equal(u.cap, 45); assert.ok(u.unverified, "model never saw the deck → its open path is not evidence");
  assert.equal(X.overcastCap(evHi, m, { path: 0.85, day: true }, null).cap, 30, "satellite: path shut");
  assert.equal(X.overcastCap(evHi, m, { path: 0.10, day: true }, null), null, "satellite: horizon open → no cap");
  const mid = X.overcastCap(evHi, m, { path: 0.45, day: true }, null); assert.ok(mid.cap > 30 && mid.cap < 100, "partial gap → partial cap " + mid.cap);
  assert.equal(X.overcastCap({ tSet: T0, s: { low: 0, mid: 95, high: 0 }, gapOpen: 0.9 }, m, null, null), null, "model saw the deck and an open path → gap exists");
  assert.equal(X.overcastCap({ tSet: T0, s: { low: 0, mid: 95, high: 0 }, gapOpen: 0.05 }, m, null, null).cap, 30);
  assert.equal(X.overcastCap(evHi, { layers: "KLFI:SCT045 KPHF:BKN250" }, null, null), null, "not overcast below 20k ft");
  assert.equal(X.overcastCap(evHi, { layers: "KLFI:OVC140 KPHF:OVC130" }, null, { tSet: T0, far: 0.05 }), null, "satellite canvas: 200–300 km clear → gap");
});

test("B2 nearClear flags model ~clear vs observed cloud; IR-only satellite is not enough", () => {
  const X = sandbox(T0).AGObsCheck, ev = { tSet: T0, s: { total: 1, low: 0, mid: 0, high: 1 } };
  const r = X.nearClear(ev, { layers: "KFYJ:SCT045 SCT065 FEW250 KXSA:SCT050" }, null, 1);   // Windmill Point Nov 4
  assert.ok(r); assert.ok(r.obs.low >= 0.44, "SCT below 6.5k → low ≥ 45 %"); assert.ok(r.obs.high > 0); assert.match(r.why, /Model says 1% cloud/);
  assert.equal(X.nearClear({ tSet: T0, s: { total: 40 } }, { layers: "KX:SCT045" }, null, 1), null, "only near-clear forecasts are checked");
  assert.equal(X.nearClear(ev, { layers: "KX:CLR" }, null, 1), null);
  assert.equal(X.nearClear(ev, null, { here: 0.6, hereHi: 0.1, day: false }, 1), null, "IR-only dusk read ignored");
  assert.ok(X.nearClear(ev, null, { here: 0.6, hereHi: 0.1, day: true }, 1), "visible satellite counts");
  const H = X.blendHourly({ time: [T0 - 3600, T0, T0 + 3600], cloud_cover_low: [0, 0, 0], cloud_cover_mid: [50, 50, 50], cloud_cover_high: [0, 0, 0], cloud_cover: [50, 50, 50] }, T0, { low: 0.45, mid: 0.2, high: 0.2 });
  assert.deepEqual(H.cloud_cover_low, [0, 45, 45]); assert.deepEqual(H.cloud_cover_mid, [50, 50, 50], "never lowers model cloud");
});

test("B1+B2 wired into Model.evaluate (real model.js + obs.js)", () => {
  // inside the observation window (1 h before sunset)
  const w = sandbox(T0 - 3600);
  const clear = w.Model.evaluate(...inputs({ total: 1, low: 0, mid: 0, high: 1 }));
  assert.ok(!clear.nearClear, "no observations → untouched");
  w.AGObs.metar.windmill = { station: "KFYJ+KXSA", layers: "KFYJ:SCT045 FEW250 KXSA:SCT050", lm: 0.4, ceil: null };
  const nc = w.Model.evaluate(...inputs({ total: 1, low: 0, mid: 0, high: 1 }));
  assert.ok(nc.nearClear, "near-clear flagged"); assert.equal(nc.nearClear.scoreModel, clear.score); assert.ok(nc.s.low >= 44, "observed low cloud blended into the inputs: " + nc.s.low);
  assert.match(nc.confDown, /Low confidence/); assert.ok(nc.gates.some(g => /observations see more/.test(g)));
  // Buckroe-like: model 100 % high cirrus, stations overcast at 13–14k ft, no satellite
  const w2 = sandbox(T0 - 3600); const hi = inputs({ total: 100, low: 0, mid: 0, high: 100 });
  const before = w2.Model.evaluate(...hi).score;
  w2.AGObs.metar.windmill = { station: "KLFI+KPHF", layers: "KLFI:OVC140 KPHF:OVC130", lm: 0.85, ceil: 13000 };
  const capped = w2.Model.evaluate(...hi);
  assert.ok(before > 45, "model alone scores the cirrus canvas high: " + before);
  assert.equal(capped.score, Math.min(before, 45)); assert.ok(capped.ovcCap.unverified);
  w2.AGObs.sat.windmill = { path: 0.9, here: 0.95, day: true, at: T0 - 3600 };
  const shut = w2.Model.evaluate(...hi); assert.equal(shut.ovcCap.cap, 30, "satellite confirms the path is shut"); assert.ok(shut.score <= 30, "existing observed-gray cap may go lower: " + shut.score);
  w2.AGObs.sat.windmill = { path: 0.05, here: 0.95, day: true, at: T0 - 3600 };
  assert.equal(w2.Model.evaluate(...hi).ovcCap, undefined, "satellite shows an open horizon → no cap");
  // the obs reads are kept per event, so revisiting after the window still applies the check
  w2.AGObs.sat.windmill = { path: 0.9, here: 0.95, day: true, at: T0 - 3600 }; w2.Model.evaluate(...hi);
  const keyed = [...Array(w2.localStorage.length).keys()].map(i => w2.localStorage.key(i)).filter(k => k.startsWith("ag_obs:"));
  assert.equal(keyed.length, 1);
});

test("B3 SHA-256 + EXIF capture time and GPS from original bytes", async () => {
  const F = sandbox(T0).AGFb;
  assert.equal(await F.sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const jpg = makeExifJpeg({ dto: "2026:11:04 16:58:12", lat: [37, 36, 36], latRef: "N", lng: [76, 17, 24], lngRef: "W", alt: 3 });
  const X = F.parseExif(jpg.buffer);
  assert.equal(X.t.getFullYear(), 2026); assert.equal(X.t.getHours(), 16); assert.equal(X.t.getMinutes(), 58);
  assert.deepEqual(JSON.parse(JSON.stringify(X.gps)), { lat: 37.61, lng: -76.29, alt: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(F.parseExif(new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]).buffer))), { t: null, off: null, gps: null }, "no EXIF → nulls");
  assert.deepEqual(F.parseExif(new Uint8Array([1, 2, 3]).buffer).gps, null, "not a JPEG");
});

test("B4 locked forecast: full event + provenance; compact pred fits the 2000-byte column", () => {
  const w = sandbox(T0 - 3600), ev = w.Model.evaluate(...inputs({ total: 60, low: 5, mid: 30, high: 50 }, { total: 10, low: 5, mid: 5, high: 10 }));
  ev.con = { p: 250, T: -52, rhi: 104, cat: "high", wind: { p: 300, mph: 92, from: 265, u: 40, v: 3, src: "ECMWF" }, shear: { su: 1, sv: 0, layer: "250-300" }, levels: [{ p: 300, T: -45, rhi: 98 }] };
  const data = { at: (T0 - 4000) * 1000, fcModel: "noaa", prefetch: true };
  const L = w.AGFb.fitLock(w.AGFb.lockedForecast({ ev, data, build: "d28zzg", mode: "sunset", spot: "windmill", obs: { m: { layers: "KX:SCT045" } }, cv: null, path: null }));
  assert.equal(L.build, "d28zzg"); assert.equal(L.fc.model, "noaa"); assert.equal(L.fc.src, "prefetch"); assert.equal(L.fc.fetchedAt, new Date(data.at).toISOString());
  for (const k of ["score", "sky", "s", "path", "comp", "gates", "slotBlock", "geoBlock", "gapOpen", "timing", "con"]) assert.ok(k in L.ev, "has " + k);
  assert.equal(L.ev.con.wind.from, 265, "300 hPa wind kept"); assert.ok(JSON.stringify(L).length <= 60000);
  const big = w.AGFb.fitLock(Object.assign({}, L, { ev: Object.assign({}, L.ev, { windSer: Array(5000).fill({ t: 1, wind: 2, gust: 3 }) }) }), 60000);
  assert.ok(JSON.stringify(big).length <= 60000 && big.trimmed.includes("windSer") && big.ev.s, "oversize: drops display series, keeps inputs");
  const P = w.AGFb.predExtras({ group: "g", gi: 0, gn: 1, score: ev.score, raw: ev.score, tSet: T0, sky: { total: 60, low: 5, mid: 30, high: 50 } }, { ev, data, build: "d28zzg", rated: true, sha: "a".repeat(64), gps: { lat: 37.61, lng: -76.29 }, cap: { t: "2026-11-04T16:58:00-05:00", src: "exif" } });
  assert.equal(P.rated, 1); assert.equal(P.b, "d28zzg"); assert.equal(P.ua.w[0], 265); assert.equal(P.fc.m, "noaa"); assert.ok(JSON.stringify(P).length <= 1800);
});

test("B3/B4 nightly calibration skips duplicate photos and unrated sends", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/calibrate-feedback.js"), "utf8");
  assert.match(src, /!h\.dup && !h\.unrated/); assert.match(src, /createHash\("sha256"\)/);
  const sql = fs.readFileSync(path.join(ROOT, "tools/supabase-setup.sql"), "utf8");
  assert.match(sql, /add column if not exists snap jsonb/); assert.match(sql, /unique index if not exists feedback_photo_sha256_uq/);
});

// minimal little-endian TIFF/EXIF JPEG builder: IFD0 {ExifIFD ptr, GPS ptr}, ExifIFD {DateTimeOriginal}, GPS {refs, lat, lng, alt}
function makeExifJpeg(o) {
  const b = new ArrayBuffer(1024), v = new DataView(b); let p = 0; const u8 = x => v.setUint8(p++, x), u16 = x => { v.setUint16(p, x, true); p += 2; }, u32 = x => { v.setUint32(p, x, true); p += 4; };
  const T = 0; u8(0x49); u8(0x49); u16(42); u32(8);
  const ent = (tag, type, cnt, val) => { u16(tag); u16(type); u32(cnt); if (type === 2 && cnt <= 4) { for (let i = 0; i < 4; i++) u8(i < val.length ? val.charCodeAt(i) : 0); } else u32(val); };
  // IFD0 at 8: 2 entries
  u16(2); ent(0x8769, 4, 1, 100); ent(0x8825, 4, 1, 200); u32(0);
  p = 100; u16(1); ent(0x9003, 2, 20, 300); u32(0);
  p = 300; for (const c of o.dto) u8(c.charCodeAt(0)); u8(0);
  p = 200; u16(6); ent(1, 2, 2, o.latRef); ent(2, 5, 3, 400); ent(3, 2, 2, o.lngRef); ent(4, 5, 3, 430); ent(5, 1, 1, 0); ent(6, 5, 1, 460); u32(0);
  const rat = (at, arr) => { p = at; for (const x of arr) { u32(x); u32(1); } }; rat(400, o.lat); rat(430, o.lng); rat(460, [o.alt]);
  const tiff = new Uint8Array(b, 0, 480), app1Len = 2 + 6 + tiff.length, out = new Uint8Array(2 + 2 + app1Len + 2); let q = 0;
  out.set([0xFF, 0xD8, 0xFF, 0xE1, app1Len >> 8, app1Len & 255], 0); q = 6; out.set([0x45, 0x78, 0x69, 0x66, 0, 0], q); q += 6; out.set(tiff, q); q += tiff.length; out.set([0xFF, 0xD9], q);
  return out;
}
