// d25a nightly: pull unprocessed Supabase feedback (service key), measure each photo, compare with the prediction the app showed when the
// entry was saved (pred.raw score + forecast low/mid/high at the event), and write bounded, outlier-robust score offsets to data/calib.json.
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY. Writes data/feedback-history.json (metrics only, no photos), data/calib.json, data/calib-log.md.
const fs = require("fs"), jpeg = require("jpeg-js"), crypto = require("crypto");
const URL0 = (process.env.SUPABASE_URL || "").replace(/\/$/, ""), KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!URL0 || !KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing"); process.exit(1); }
const H = /^sb_/.test(KEY) ? { apikey: KEY } : { apikey: KEY, Authorization: "Bearer " + KEY };
const HIST = "data/feedback-history.json", CAL = "data/calib.json", LOG = "data/calib-log.md";
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return d; } };
const med = a => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[n >> 1] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function metrics(buf) {   // sky photo → brightness, saturation, warm-colour share, cloud share of the upper sky, "colour score" 0–100
  const im = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 256 }), { width: W, height: Ht, data: D } = im, st = Math.max(1, Math.floor(Math.sqrt(W * Ht / 40000)));
  let n = 0, L = 0, S = 0, warm = 0, vivid = 0, nu = 0, cl = 0;
  for (let y = 0; y < Ht; y += st) for (let x = 0; x < W; x += st) { const i = (y * W + x) * 4, r = D[i] / 255, g = D[i + 1] / 255, b = D[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1) + 1e-6);
    let h = 0; if (mx !== mn) h = mx === r ? ((g - b) / (mx - mn) + 6) % 6 * 60 : mx === g ? ((b - r) / (mx - mn) + 2) * 60 : ((r - g) / (mx - mn) + 4) * 60;
    n++; L += l; S += s; const w = (h < 55 || h > 300) && s > .3 && l > .12; if (w) warm++; if (w && s > .55 && l > .25) vivid++;
    if (y < Ht * .55 && l > .08) { nu++; if (s < .18 || (w && s < .5)) cl++; } }
  const out = { w: W, h: Ht, bright: +(L / n).toFixed(3), sat: +(S / n).toFixed(3), warm: +(warm / n).toFixed(3), vivid: +(vivid / n).toFixed(3), cloud: +(nu ? cl / nu : 0).toFixed(3) };
  // d25d: soft-saturating (was linear → 100 for any vivid shot). Checked on groundtruth/photos: gray decks 3–12, partial colour ~40–65, vivid batch2/07 ≈ 92.
  const x = Math.max(0, 1.6 * out.warm + 2.2 * out.vivid + .35 * out.sat - .05); out.colorScore = Math.round(100 * (1 - Math.exp(-1.6 * x))); return out;
}
(async () => {
  const hist = rd(HIST, []), seen = new Set(hist.map(h => h.id)), shas = new Set(hist.flatMap(h => [h.sha, h.jsha]).filter(Boolean)), log = [`## ${new Date().toISOString()}`];
  const r = await fetch(`${URL0}/rest/v1/feedback?processed_at=is.null&select=*&order=created_at.asc&limit=500`, { headers: H });
  if (!r.ok) throw new Error("list " + r.status + " " + await r.text()); const rows = await r.json(); log.push(`new rows: ${rows.length}`);
  for (const e of rows) {
    let m = null, jsha = null;
    if (e.photo_path) try { const p = await fetch(`${URL0}/storage/v1/object/feedback/${e.photo_path}`, { headers: H }); if (!p.ok) throw new Error(p.status); const buf = Buffer.from(await p.arrayBuffer()); jsha = crypto.createHash("sha256").update(buf).digest("hex"); m = metrics(buf); } catch (x) { log.push(`- ${e.id}: photo unreadable (${x.message})`); }
    const raw = e.pred && typeof e.pred.raw === "number" ? e.pred.raw : null, sky = e.pred && (e.pred.atShot || e.pred.sky);
    const rec = { group: (e.pred && e.pred.group) || e.id, id: e.id, at: e.shot_at || e.created_at, shot: e.shot_at || null, saved: e.created_at, spot: e.spot, mode: e.mode, rating: e.rating, raw, sky, photo: m, ver: e.app_version };
    if (raw != null && typeof e.rating === "number") rec.resid = Math.round(m ? .7 * (e.rating - raw) + .3 * (m.colorScore - raw) : e.rating - raw);
    if (m && sky && typeof sky.total === "number") rec.cloudErr = Math.round(100 * m.cloud - sky.total);
    if (e.spot === "test") rec.test = true;
    // d28zzg B3: duplicate photos (same original SHA-256 from the app, or byte-identical stored JPEG) are kept in the history but never calibrate twice;
    // sends without an actively moved rating slider (pred.rated === 0) don't calibrate either. Legacy rows (no flags) are unchanged.
    const sha = (e.pred && e.pred.sha) || e.photo_sha256 || null; if (sha) rec.sha = sha; if (jsha) rec.jsha = jsha;
    if (!seen.has(e.id) && ((sha && shas.has(sha)) || (jsha && shas.has(jsha)))) rec.dup = true; if (sha) shas.add(sha); if (jsha) shas.add(jsha);
    if (e.pred && e.pred.rated === 0) rec.unrated = true;
    if (!seen.has(e.id)) { hist.push(rec); seen.add(e.id); }
    log.push(`- ${e.spot} ${e.mode}: rating ${e.rating}, app ${raw}, photo colour ${m ? m.colorScore : "–"}, cloud photo/forecast ${m ? Math.round(100 * m.cloud) : "–"}/${sky ? sky.total : "–"} → resid ${rec.resid ?? "–"}`);
    await fetch(`${URL0}/rest/v1/feedback?id=eq.${encodeURIComponent(e.id)}`, { method: "PATCH", headers: Object.assign({ "Content-Type": "application/json", Prefer: "return=minimal" }, H), body: JSON.stringify({ processed_at: new Date().toISOString() }) });
  }
  // calibration: last 120 days, median residual, |resid| > 45 dropped as outliers, shrunk toward 0 by n/(n+k), min counts, hard bounds.
  const cut = Date.now() - 120 * 864e5, cal = { updated: new Date().toISOString(), note: "score offsets from user feedback; bounded ±8 global, ±5 per spot" };
  for (const mode of ["sunset", "sunrise"]) {
    const R0 = hist.filter(h => h.spot !== "test" && !h.test && h.mode === mode && h.resid != null && !h.dup && !h.unrated && Date.parse(h.at) > cut), G = {};
    R0.forEach(h => (G[h.group || h.id] = G[h.group || h.id] || []).push(h));   // d25e: multi-photo sends count once (median residual of the group)
    const R = Object.values(G).map(L => Object.assign({}, L[0], { resid: med(L.map(h => h.resid)) })).filter(h => Math.abs(h.resid) <= 45), o = { n: R.length, global: 0, spots: {} };
    if (R.length >= 6) o.global = Math.round(clamp(med(R.map(h => h.resid)) * R.length / (R.length + 12), -8, 8));
    const by = {}; R.forEach(h => (by[h.spot] = by[h.spot] || []).push(h.resid - o.global));
    for (const [s, a] of Object.entries(by)) if (a.length >= 4) { const v = Math.round(clamp(med(a) * a.length / (a.length + 8), -5, 5)); if (v) o.spots[s] = v; }
    const C = hist.filter(h => h.spot !== "test" && !h.test && !h.dup && h.mode === mode && h.cloudErr != null && Date.parse(h.at) > cut); o.cloudBias = C.length >= 6 ? Math.round(med(C.map(h => h.cloudErr))) : 0; o.cloudN = C.length;
    cal[mode] = o; log.push(`${mode}: n=${o.n} global ${o.global} spots ${JSON.stringify(o.spots)} cloudBias ${o.cloudBias} (n=${o.cloudN}, logged only)`);
  }
  fs.writeFileSync(HIST, JSON.stringify(hist, null, 1)); fs.writeFileSync(CAL, JSON.stringify(cal, null, 1));
  fs.writeFileSync(LOG, log.join("\n") + "\n\n" + (fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "").slice(0, 200000)); console.log(log.join("\n"));
})().catch(e => { console.error(e); process.exit(1); });
