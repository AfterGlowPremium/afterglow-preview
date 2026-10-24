// d25r: measured waves (+ buoy wind) for past days. NDBC realtime2 files have no CORS, so this runs in the satcv Action and writes
// data/buoys.json: spot → nearest wave-reporting NDBC buoy (≤ 40 km; lower Chesapeake / Hampton Roads spots → 44087 Thimble Shoal),
// hourly for the last 31 days: [unixT, Hs ft, dominant period s, mean wave dir °, wind mph, wind dir °].
const fs = require("fs"), vm = require("vm");
const w = { console }; w.window = w; vm.createContext(w); vm.runInContext(fs.readFileSync("spots.js", "utf8") + ";window.S = SPOTS;", w);
const km = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return 6371 * Math.hypot(x, y); };
const bay = s => s.lat > 36.85 && s.lat < 37.6 && s.lng > -76.65 && s.lng < -76.0;   // lower bay / Hampton Roads / James mouth
(async () => {
  const xml = await (await fetch("https://www.ndbc.noaa.gov/activestations.xml")).text(), st = [];
  for (const m of xml.matchAll(/<station id="([^"]+)" lat="([^"]+)" lon="([^"]+)"[^>]*name="([^"]*)"[^>]*type="([^"]*)" met="y"/g)) st.push({ id: m[1], lat: +m[2], lng: +m[3], name: m[4], type: m[5] });
  const cand = {}; for (const s of w.S) { const near = st.map(b => ({ b, d: km(s.lat, s.lng, b.lat, b.lng) })).filter(x => x.d <= 40).sort((a, b) => a.d - b.d); cand[s.id] = bay(s) ? [{ b: st.find(b => b.id === "44087") || { id: "44087", name: "Thimble Shoal", lat: 37.043, lng: -76.129 }, d: km(s.lat, s.lng, 37.043, -76.129) }] : near.slice(0, 4); }
  const need = [...new Set(Object.values(cand).flat().map(x => x.b.id))], obs = {}, cut = Date.now() / 1000 - 31 * 86400;
  for (const id of need) { try { const r = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${id}.txt`); if (!r.ok) continue; const rows = {};
    for (const L of (await r.text()).split("\n")) { if (L[0] === "#" || !L.trim()) continue; const f = L.trim().split(/\s+/), t = Date.UTC(+f[0], f[1] - 1, +f[2], +f[3], +f[4]) / 1000; if (t < cut) continue;
      const v = k => f[k] === "MM" ? null : +f[k], hs = v(8); if (hs == null) continue; const hr = Math.round(t / 3600) * 3600; if (rows[hr] && Math.abs(rows[hr][0] - hr) <= Math.abs(t - hr)) continue;
      rows[hr] = [t, +(hs * 3.2808).toFixed(1), v(9), v(11), v(6) == null ? null : Math.round(v(6) * 2.237), v(5)]; }
    const a = Object.values(rows).sort((x, y) => x[0] - y[0]); if (a.length > 24) obs[id] = a; } catch (e) { console.warn(id, e.message); } }
  const spots = {}; for (const [sid, L] of Object.entries(cand)) { const h = L.find(x => obs[x.b.id]); if (h) spots[sid] = { id: h.b.id, name: h.b.name, km: Math.round(h.d) }; }
  fs.writeFileSync("data/buoys.json", JSON.stringify({ at: new Date().toISOString(), spots, obs }));
  console.log(`buoys: ${Object.keys(obs).length} stations with waves, ${Object.keys(spots).length} spots covered of ${Object.keys(cand).length} spots`);
})();
