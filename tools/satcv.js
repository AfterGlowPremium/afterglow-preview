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
const KM = [0, 20, 40, 80, 120, 200, 300], AKM = [20, 50, 100, 200];   // d24j: AKM = anti-sun (east at sunset) + ±45° side bearings
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
// d24t: NEXRAD composite reflectivity (IEM n0q, 0.005°, UL -126/50, 8-bit palette index → dBZ = idx/2 − 32.5), decoded with zlib only.
const zlib = require("zlib");
let radarF;
async function radar(t) {
  if (radarF !== undefined) return radarF; radarF = null;
  let s = Math.floor(Math.min(t, Date.now() / 1000 - 300) / 300) * 300;
  for (let k = 0; k < 4; k++, s -= 300) { const d = new Date(s * 1000), p = v => String(v).padStart(2, "0"), ymd = `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}`, st = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
    try { const r = await fetch(`https://mesonet.agron.iastate.edu/archive/data/${ymd}/GIS/uscomp/n0q_${st}.png`); if (!r.ok) continue; const b = Buffer.from(await r.arrayBuffer());
      const W = b.readUInt32BE(16), H = b.readUInt32BE(20); const idat = []; for (let o = 8; o < b.length;) { const n = b.readUInt32BE(o), ty = b.toString("ascii", o + 4, o + 8); if (ty === "IDAT") idat.push(b.subarray(o + 8, o + 8 + n)); o += 12 + n; }
      const raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(W * H), st2 = W + 1;
      for (let y = 0; y < H; y++) { const f = raw[y * st2], o = y * st2 + 1, q = y * W; for (let x = 0; x < W; x++) { const a = x ? px[q + x - 1] : 0, up = y ? px[q - W + x] : 0, ul = x && y ? px[q - W + x - 1] : 0; let v = raw[o + x];
        if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1; else if (f === 4) { const pp = a + up - ul, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - ul); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : ul; } px[q + x] = v & 255; } }
      return (radarF = { t: s, W, H, px }); } catch (e) {} }
  return null;
}
const dbzAt = (R, lat, lng) => { const x = Math.round((lng + 126) / 0.005), y = Math.round((50 - lat) / 0.005); let m = 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const v = R.px[(y + j) * R.W + x + i] || 0; if (v > m) m = v; } return m ? m / 2 - 32.5 : -99; };
// GOES IR count → brightness temperature (McIDAS 8-bit IR: c ≤ 176 → 330 − c/2, else 418 − c); cloud top ≈ (T_sfc − Tb) / 6.5 K/km
const topKmAt = (F, lat, lng, tSfc = 293) => { if (!F) return null; const x = Math.round((lng + 130) / 0.04), y = Math.round((52 - lat) / 0.04); let c = 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) c = Math.max(c, F.px[(y + j) * F.W + x + i] || 0);
  const tb = c <= 176 ? 330 - c / 2 : 418 - c; return Math.max(0, Math.min(17, (tSfc - tb) / 6.5)); };
// storms in a ±60° sector around a bearing, 10–200 km: per 4° bin the nearest >= 40 dBZ echo, its peak dBZ and IR cloud-top height; a LINE = >= 4 adjacent bins
async function storms(sp, az, t, FI) {
  const R = await radar(t); if (!R) return null; const out = [];
  for (let db = -60; db <= 60; db += 4) { const b = (az + db + 360) % 360; for (let d = 10; d <= 200; d += 4) { const p = offset(sp.lat, sp.lng, b, d), z = dbzAt(R, p.lat, p.lng);
      if (z >= 40) { let mz = z; for (let d2 = d + 4; d2 <= d + 20; d2 += 4) { const q = offset(sp.lat, sp.lng, b, d2); mz = Math.max(mz, dbzAt(R, q.lat, q.lng)); }
        const tk = topKmAt(FI, p.lat, p.lng); out.push([db, d, Math.round(mz), tk == null ? null : +tk.toFixed(1)]); break; } } }
  let run = 0, best = 0; for (let db = -60, k = 0; db <= 60; db += 4) { if (out[k] && out[k][0] === db) { run++; k++; } else run = 0; best = Math.max(best, run); }
  return { t: R.t, cells: out, line: best >= 4 };
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
    const want = elevTime(sp.lat, sp.lng, tSet, 4);   // d24k: read all day with the newest frame (night-dark frames fail canvasAt → keep prev); obs.js weights early reads down
    if (now - tSet > 1800 && prev[sp.id]) { res[sp.id] = prev[sp.id]; continue; }
    const F = await frame(Math.min(want, now)); if (!F) { if (prev[sp.id]) res[sp.id] = prev[sp.id]; continue; }
    const az = sunPos(tSet, sp.lat, sp.lng).az, r = KM.map(d => { const p = d ? offset(sp.lat, sp.lng, az, d) : { lat: sp.lat, lng: sp.lng }; return canvasAt(F, p.lat, p.lng); });
    const f2 = x => +x.toFixed(2), FI = await frame(F.t, "ir"), ir = KM.map(d => { if (!FI || FI.t !== F.t) return null; const p = d ? offset(sp.lat, sp.lng, az, d) : { lat: sp.lat, lng: sp.lng }; return irAt(FI, p.lat, p.lng); });
    const irOk = ir.filter(Boolean).length >= 5, irOnly = r.filter(Boolean).length < 5;   // d24l: visible dark (night/dawn/dusk) → infrared-only read, cv from IR
    if (irOnly && !irOk) { if (prev[sp.id]) res[sp.id] = prev[sp.id]; continue; }
    const v = irOnly ? ir.map(x => x ? x.cv : 0) : r.map(x => x ? x.cv : 0), th = irOnly ? ir.map(x => x ? Math.max(0, x.mid - 0.5) : 0) : r.map(x => x ? x.thick : 0);
    const irx = irOk ? { irCv: ir.map(x => f2(x ? x.cv : 0)), irMid: ir.map(x => f2(x ? x.mid : 0)), irLow: ir.map(x => f2(x ? x.low : 0)) } : {};
    // d24j: the OPPOSITE sky + overhead — clouds east over the ocean / overhead that catch the last light after sunset (1st St VB)
    const at = (Fv, Fi, b, d) => { const p = offset(sp.lat, sp.lng, b, d); return [canvasAt(Fv, p.lat, p.lng), Fi && Fi.t === Fv.t ? irAt(Fi, p.lat, p.lng) : null]; };
    const anti = (az + 180) % 360, ax = {}, row = b => { const r2 = AKM.map(d => at(F, FI, b, d)); return { cv: r2.map(x => f2(irOnly ? (x[1] ? x[1].cv : 0) : x[0] ? x[0].cv : 0)), irCv: r2.map(x => f2(x[1] ? x[1].cv : 0)), irMid: r2.map(x => f2(x[1] ? x[1].mid : 0)), irLow: r2.map(x => f2(x[1] ? x[1].low : 0)) }; };
    { const A = row(anti), L = row((anti + 315) % 360), R = row((anti + 45) % 360), o0 = canvasAt(F, sp.lat, sp.lng), i0 = FI && FI.t === F.t ? irAt(FI, sp.lat, sp.lng) : null;
      Object.assign(ax, { antiKm: AKM, antiCv: A.cv, antiIrCv: A.irCv, antiIrMid: A.irMid, antiIrLow: A.irLow, sideCv: AKM.map((_, i) => f2((L.cv[i] + R.cv[i]) / 2)), sideIrMid: AKM.map((_, i) => f2((L.irMid[i] + R.irMid[i]) / 2)), sideIrLow: AKM.map((_, i) => f2((L.irLow[i] + R.irLow[i]) / 2)),
        overCv: f2(irOnly ? (i0 ? i0.cv : 0) : o0 ? o0.cv : 0), overIrCv: f2(i0 ? i0.cv : 0), overIrMid: f2(i0 ? i0.mid : 0), overIrLow: f2(i0 ? i0.low : 0) }); }
    const stS = await storms(sp, az, F.t, FI && FI.t === F.t ? FI : null), stA = await storms(sp, (az + 180) % 360, F.t, FI && FI.t === F.t ? FI : null);   // d24t: radar storm cells sun-side + opposite
    res[sp.id] = { tSet, at: F.t, km: KM, cv: v.map(f2), thick: th.map(f2), here: f2(0.3 * v[0] + 0.25 * v[1] + 0.25 * v[2] + 0.2 * v[3]), west: f2((v[0] + v[1] + v[2] + v[3] + v[4]) / 5),
      far: f2(0.5 * v[5] + 0.5 * v[6]), farThick: f2(Math.max(th[5], th[6])), ...irx, ...ax, hrsToEvent: +((tSet - F.t) / 3600).toFixed(2), ...(stS ? { storms: stS } : {}), ...(stA ? { stormsAnti: stA } : {}), src: irOnly ? "goes-ir4km-only" : irx.irCv ? "goes-vis+ir4km-archive" : "goes-vis4km-archive" };
  }
  fs.writeFileSync(out, JSON.stringify({ v: 1, day, gen: new Date().toISOString(), spots: res }));
  console.log("satcv", day, Object.keys(res).length, "spots ->", out);
})();
