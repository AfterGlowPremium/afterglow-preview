// d24: GOES-East visible "cloud canvas" along each spot's SUNSET azimuth, for data/satcv-sunset.json (first loads + after the sun is
// too low for the in-browser read). Same rule as Sat.canvasPt(): a pixel is cloud when it is brighter than the local clear background
// (20th percentile of a ~280 km window) by >= 50% / +18 counts; "thick" when >= 2.6x / +70. Source: IEM's archived GOES-East 4 km
// visible GeoTIFF (every ~15 min, WGS84, 0.04 deg, UL -130/52). Each spot uses the frame nearest the time its sun was ~4 deg up
// (or the newest frame if that is still ahead), so the read is taken in good light, not in the dim last minutes.
// Usage: node tools/satcv.js [YYYY-MM-DD] [out.json]   (default: today in America/New_York, data/satcv-sunset.json)
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, ".."), win = {}; win.window = win;
const ctx = vm.createContext(win); for (const f of ["spots.js", "model.js"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx);
const { sunPos, offset } = win.Model;
const day = process.argv[2] || new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const out = process.argv[3] || path.join(root, "data/satcv-sunset.json");
const KM = [0, 20, 40, 80, 120, 200, 300];
const sunsetOf = (lat, lng) => { const [y, m, d] = day.split("-").map(Number); let t = Date.UTC(y, m - 1, d, 16) / 1000;   // scan 16Z..04Z
  for (; t < Date.UTC(y, m - 1, d + 1, 4) / 1000; t += 60) if (sunPos(t, lat, lng).elev < -0.833 && sunPos(t - 60, lat, lng).elev >= -0.833) return t; return null; };
const elevTime = (lat, lng, tSet, e) => { for (let t = tSet; t > tSet - 4 * 3600; t -= 60) if (sunPos(t, lat, lng).elev >= e) return t; return tSet - 1800; };
const frames = {};
async function frame(t, band = "vis") {   // nearest archived slot at/before t (15-min cadence, some missing)
  const now = Date.now() / 1000; let s = Math.floor(Math.min(t, now - 600) / 900) * 900;
  for (let k = 0; k < 6; k++, s -= 900) { const key = band + s; if (frames[key] !== undefined) { if (frames[key]) return frames[key]; continue; }
    const d = new Date(s * 1000), p = v => String(v).padStart(2, "0"), ymd = `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}`, hm = p(d.getUTCHours()) + p(d.getUTCMinutes());
    try { const r = await fetch(`https://mesonet.agron.iastate.edu/archive/data/${ymd}/GIS/sat/conus_goes_${band}4km_${hm}.tif`); if (!r.ok) throw 0;
      const b = Buffer.from(await r.arrayBuffer()), W = 1750, H = 750, off = b.readUInt32LE(b.readUInt32LE(4) + 2 + 12 * 0) && stripOff(b);
      frames[key] = { t: s, px: b.subarray(off, off + W * H), W, H }; return frames[key]; } catch (e) { frames[key] = null; } }
  return null;
}
function stripOff(b) { const ifd = b.readUInt32LE(4), n = b.readUInt16LE(ifd); for (let i = 0; i < n; i++) { const e = ifd + 2 + 12 * i; if (b.readUInt16LE(e) === 273) { const cnt = b.readUInt32LE(e + 4), v = b.readUInt32LE(e + 8); return cnt === 1 ? v : b.readUInt32LE(v); } } return 0; }
function canvasAt(F, lat, lng) {
  const x = Math.round((lng + 130) / 0.04), y = Math.round((52 - lat) / 0.04); if (x < 35 || y < 35 || x >= F.W - 35 || y >= F.H - 35) return null;
  const bgv = []; for (let j = -35; j <= 35; j += 2) for (let i = -35; i <= 35; i += 2) bgv.push(F.px[(y + j) * F.W + x + i]); bgv.sort((a, b) => a - b);
  const bg = bgv[Math.floor(bgv.length * 0.2)]; if (bg < 4) return null;
  const thr = Math.max(bg * 1.5, bg + 18), thick = Math.max(bg * 2.6, bg + 70); let n = 0, cl = 0, th = 0;
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { if (i * i + j * j > 20) continue; const v = F.px[(y + j) * F.W + x + i]; n++; if (v > thr) cl++; if (v > thick) th++; }
  return { cv: cl / n, thick: th / n };
}
// d24b: GOES-East IR (band 13, 4 km): pixel value rises as cloud tops get colder. Cloud = colder than the local clear/warm background
// (20th percentile of the window) by >= 8 counts; MID/HIGH tops (the cloud that lights up gold/pink at sunset) by >= 18 counts.
// Visible-bright cloud whose IR is only a little colder than the ground = LOW cloud; a near-solid low deck blocks the light.
function irAt(F, lat, lng) {
  const x = Math.round((lng + 130) / 0.04), y = Math.round((52 - lat) / 0.04); if (x < 35 || y < 35 || x >= F.W - 35 || y >= F.H - 35) return null;
  const bgv = []; for (let j = -35; j <= 35; j += 2) for (let i = -35; i <= 35; i += 2) bgv.push(F.px[(y + j) * F.W + x + i]); bgv.sort((a, b) => a - b);
  const bg = bgv[Math.floor(bgv.length * 0.2)]; let n = 0, cl = 0, mid = 0;
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { if (i * i + j * j > 20) continue; const v = F.px[(y + j) * F.W + x + i]; n++; if (v >= bg + 8) cl++; if (v >= bg + 18) mid++; }
  return { cv: cl / n, mid: mid / n, low: (cl - mid) / n };
}
(async () => {
  let prev = {}; try { const o = JSON.parse(fs.readFileSync(out, "utf8")); if (o.day === day) prev = o.spots || {}; } catch (e) {}
  const res = {}, now = Date.now() / 1000;
  for (const sp of win.SPOTS) {
    const tSet = sunsetOf(sp.lat, sp.lng); if (!tSet) continue;
    const want = elevTime(sp.lat, sp.lng, tSet, 4); if (want > now + 600 && prev[sp.id]) { res[sp.id] = prev[sp.id]; continue; }
    if (tSet - now > 3 * 3600) continue;   // too early for a meaningful read
    const F = await frame(Math.min(want, now)); if (!F) { if (prev[sp.id]) res[sp.id] = prev[sp.id]; continue; }
    const az = sunPos(tSet, sp.lat, sp.lng).az, r = KM.map(d => { const p = d ? offset(sp.lat, sp.lng, az, d) : { lat: sp.lat, lng: sp.lng }; return canvasAt(F, p.lat, p.lng); });
    if (r.filter(Boolean).length < 5) { if (prev[sp.id]) res[sp.id] = prev[sp.id]; continue; }
    const v = r.map(x => x ? x.cv : 0), th = r.map(x => x ? x.thick : 0), f2 = x => +x.toFixed(2);
    const FI = await frame(F.t, "ir"), ir = KM.map(d => { if (!FI || FI.t !== F.t) return null; const p = d ? offset(sp.lat, sp.lng, az, d) : { lat: sp.lat, lng: sp.lng }; return irAt(FI, p.lat, p.lng); });
    const irx = ir.filter(Boolean).length >= 5 ? { irCv: ir.map(x => f2(x ? x.cv : 0)), irMid: ir.map(x => f2(x ? x.mid : 0)), irLow: ir.map(x => f2(x ? x.low : 0)) } : {};
    res[sp.id] = { tSet, at: F.t, km: KM, cv: v.map(f2), thick: th.map(f2), here: f2(0.3 * v[0] + 0.25 * v[1] + 0.25 * v[2] + 0.2 * v[3]), west: f2((v[0] + v[1] + v[2] + v[3] + v[4]) / 5),
      far: f2(0.5 * v[5] + 0.5 * v[6]), farThick: f2(Math.max(th[5], th[6])), ...irx, src: irx.irCv ? "goes-vis+ir4km-archive" : "goes-vis4km-archive" };
  }
  fs.writeFileSync(out, JSON.stringify({ v: 1, day, gen: new Date().toISOString(), spots: res }));
  console.log("satcv", day, Object.keys(res).length, "spots ->", out);
})();
