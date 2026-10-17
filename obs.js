// d15: OBSERVED sky blocking for today / the near term. When observations say the sun is blocked, the score, label,
// pins and the render all go flat gray (no pink/orange glow, no backlight).
// Inputs (all browser-readable, CORS-enabled):
//   1) NWS/METAR via api.weather.gov — nearest station ≤ 40 km: sky condition layers (FEW/SCT/BKN/OVC/VV) + ceiling,
//      precipitation and visibility, for the hour around the event (history when the event just passed, latest when it's ahead).
//   2) GOES-East ABI via Iowa Environmental Mesonet tiles — IR ch13 (day+night) and visible ch02 (daytime) cloud fraction
//      at the spot AND along the sun's line of sight (40/120/200/300 km toward the sunrise/sunset azimuth). Tiles are
//      current-only, so satellite is used only within ±3 h of the event.
//   3) Open-Meteo/NOAA HRRR low+mid cloud at the event hour from the latest (≤45 min old) download — the model's
//      own light-path block (ev.slotBlock) is the fallback when the satellite isn't usable.
// Low/mid cloud blocking the horizon → gray; high thin cirrus with an open horizon is still allowed to glow.
(function (g) {
  const H = { Accept: "application/geo+json" }, NOW = () => Date.now() / 1000;
  const COV = { SKC: 0, CLR: 0, NCD: 0, NSC: 0, FEW: 0.2, SCT: 0.45, BKN: 0.75, OVC: 1, VV: 1 };
  const O = g.AGObs = { st: {}, metar: {}, sat: {}, ready: false, errors: [] };
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const km = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return R * Math.hypot(x, y); };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  // window in which observations override the model: from 3 h before the event to 2.5 h after it
  const inWindow = tSet => { const n = NOW(); return tSet && n >= tSet - 3 * 3600 && n <= tSet + 2.5 * 3600; };

  async function station(sp) {
    const C = O.stCache || (O.stCache = lsGet("ag-obs-stn-v1") || {});
    if (C[sp.id] !== undefined) return C[sp.id];
    try {
      const p = await (await fetch(`https://api.weather.gov/points/${sp.lat.toFixed(4)},${sp.lng.toFixed(4)}`, { headers: H })).json();
      const f = (await (await fetch(p.properties.observationStations, { headers: H })).json()).features || [];
      const best = f.slice(0, 4).map(x => ({ id: x.properties.stationIdentifier, name: x.properties.name, d: km(sp.lat, sp.lng, x.geometry.coordinates[1], x.geometry.coordinates[0]) })).sort((a, b) => a.d - b.d)[0];
      C[sp.id] = best && best.d <= 40 ? best : null;
    } catch (e) { return null; }   // transient: don't cache
    lsSet("ag-obs-stn-v1", C); return C[sp.id];
  }
  // low/mid sky cover from one observation: layers below 20,000 ft (ASOS reports to 12,000 ft; "CLR" = nothing below 12k)
  function readOb(p) {
    const L = (p.cloudLayers || []).map(c => ({ cov: COV[c.amount] ?? 0, ft: c.base && c.base.value != null ? c.base.value * 3.281 : null, amt: c.amount }));
    let clear = 1, ceil = null;
    for (const l of L) { if (l.ft != null && l.ft > 20000) continue; clear *= 1 - l.cov * (l.ft != null && l.ft > 6500 ? 0.85 : 1); if (l.cov >= 0.75 && (ceil == null || l.ft < ceil)) ceil = l.ft; }
    const raw = p.rawMessage || "", wx = /(^|\s)[-+]?(RA|DZ|SHRA|TSRA|SN|FG|BR)\b/.test(raw) || (p.presentWeather || []).length > 0;
    const vis = p.visibility && p.visibility.value != null ? p.visibility.value / 1609 : null;
    const kmh = q => q && q.value != null ? q.value / 1.609344 : null;
    return { vis, mph: kmh(p.windSpeed), gust: kmh(p.windGust), wdir: p.windDirection ? p.windDirection.value : null, fog: /(^|\s)(FG|BR|HZ)\b/.test(raw),
      lm: clamp(1 - clear + (wx ? 0.1 : 0) + (vis != null && vis < 3 ? 0.15 : 0)), ceil, layers: L.map(l => l.amt + (l.ft != null ? Math.round(l.ft / 100).toString().padStart(3, "0") : "")).join(" "), wx, t: Date.parse(p.timestamp) / 1000, raw };
  }
  async function metar(sp, tSet) {
    const s = await station(sp); if (!s) return null;
    const n = NOW(), a = new Date((Math.min(n, tSet) - 5400) * 1000).toISOString(), b = new Date(Math.min(n, tSet + 1800) * 1000).toISOString();
    try {
      const f = ((await (await fetch(`https://api.weather.gov/stations/${s.id}/observations?start=${a}&end=${b}`, { headers: H })).json()).features || []).map(x => x.properties).filter(p => (p.cloudLayers || []).length || p.rawMessage);
      if (!f.length) return null;
      const obs = f.map(readOb).sort((x, y) => Math.abs(x.t - tSet) - Math.abs(y.t - tSet));
      const near = obs.slice(0, 3), lm = near.reduce((q, o) => q + o.lm, 0) / near.length;   // average the 3 reports nearest the event
      return { station: s.id, name: s.name, dist: s.d, lm, ceil: obs[0].ceil, layers: obs[0].layers, wx: obs[0].wx, t: obs[0].t, raw: obs[0].raw };
    } catch (e) { return null; }
  }
  // GOES tiles: per-point low/mid cloud estimate. Daytime: visible bright minus what the IR says is cold (high) cloud.
  // Night/twilight: IR only — grey (cooler than the surface) tops ≈ low/mid cloud, coloured (cold) tops ≈ high cloud.
  async function satPoint(lat, lng, day) {
    if (!g.Sat || !g.Sat.samplePt) return null;
    const ir = await g.Sat.samplePt("ir", lat, lng); if (!ir) return null;
    const hi = clamp(ir.cold + ir.deep);
    // night: grey tops = low/mid; cold tops are ambiguous (thick deck or thin cirrus) → half weight
    let lm = clamp(ir.coolGrey * 1.15 + hi * 0.5);
    // day: visible brightness = optical thickness. Bright = thick (blocks, whatever the top temperature); dim-but-cold = thin cirrus (may glow)
    if (day) { const v = await g.Sat.samplePt("vis", lat, lng); if (v) lm = clamp(v.bright + v.thin * 0.35 + ir.coolGrey * 0.3); }
    return { lm, hi };
  }
  async function sat(sp, ev) {
    const n = NOW(); if (Math.abs(n - ev.tSet) > 3 * 3600) return null;
    const day = g.Model.sunPos(n, sp.lat, sp.lng).elev > 8;
    try {
      const az = ev.sunsetAz, pts = [0, 40, 120, 200, 300].map(d => d ? g.Model.offset(sp.lat, sp.lng, az, d) : { lat: sp.lat, lng: sp.lng });
      const r = await Promise.all(pts.map(p => satPoint(p.lat, p.lng, day)));
      if (r.some(x => !x)) return null;
      const path = 0.35 * r[1].lm + 0.3 * r[2].lm + 0.2 * r[3].lm + 0.15 * r[4].lm;
      return { here: r[0].lm, hereHi: r[0].hi, path, pts: r.map(x => +x.lm.toFixed(2)), day, at: n };
    } catch (e) { return null; }
  }
  // Combine → block 0..1 (sun's light blocked) and gray 0..1 (how far the render/score go flat)
  function combine(ev, m, s) {
    const model = clamp(ev.slotBlock || 0), modelLow = clamp(Math.max((ev.s.low || 0), 0.85 * (ev.s.mid || 0)) / 100);
    const path = s ? 0.6 * s.path + 0.4 * model : model;      // light path toward the horizon (satellite now + latest model at the event hour)
    const here = m ? m.lm : s ? s.here : modelLow;            // overhead: what you'd look up through
    let block = Math.max(path, 0.5 * here + 0.5 * path);
    // a low or mid (< 10,000 ft) BKN/OVC ceiling overhead hides any colour above it, whatever the horizon does
    if (m && m.lm >= 0.85 && m.ceil != null && m.ceil < 10000) block = Math.max(block, 0.9);
    if (s && s.path >= 0.8) block = Math.max(block, s.path);
    block = clamp(block);
    const gray = clamp((block - 0.6) / 0.28);
    const src = [m && `METAR ${m.station} ${m.layers || "CLR"}${m.wx ? " precip" : ""}`, s && `GOES ${s.day ? "vis+IR" : "IR"} path ${Math.round(s.path * 100)}%`, !s && `model path ${Math.round(model * 100)}%`].filter(Boolean).join(" · ");
    return { block, gray, here, path, metar: m, sat: s, src };
  }
  // Wrap Model.evaluate so EVERY caller (pins, list, day strip, detail, render) gets the observed override.
  const base = g.Model.evaluate;
  g.Model.evaluate = function (sp) {
    const ev = base.apply(this, arguments);
    try { Object.defineProperty(ev, "_h", { value: arguments[1] && arguments[1].hourly, enumerable: false }); } catch (e) {}   // d16: hourly clouds for grayAt(t)
    try {
      if (/[?&]obs=0/.test(location.search) || !ev) return ev;
      { const mgE = Math.max(O.modelGray ? O.modelGray(ev, ev.tSet) : 0, clamp(((ev.slotBlock || 0) - 0.6) / 0.28));   // d16: score agrees with the gray render for any day
        if (mgE > 0) { const cap = Math.round(ev.score + (12 - ev.score) * mgE); if (cap < ev.score) { ev.scoreModel = ev.score; ev.score = cap; } } }
      if (!inWindow(ev.tSet)) return ev;
      const m = O.metar[sp.id], s = O.sat[sp.id];
      if (m === undefined && s === undefined) return ev;
      const ob = ev.obs = combine(ev, m, s);
      if (ob.gray > 0) {
        const cap = Math.round(ev.score + (12 - ev.score) * ob.gray);   // fully blocked → ~12 ("Poor"), label follows the score
        if (cap < ev.score) { ev.scoreModel = ev.score; ev.score = cap; }
        ev.slotBlock = Math.max(ev.slotBlock, ob.block);
        (ev.reasons || (ev.reasons = [])).unshift(`Observed: sun blocked (${Math.round(ob.block * 100)}%) — ${ob.src}. Expect flat gray light, no glow.`);
      }
    } catch (e) { console.warn("obs", e); }
    return ev;
  };
  // ---- d16: conditions AT THE TIME SHOWN (any hour, incl. now) ----
  // now-obs for the opened spot: latest METAR (ceiling, sky cover, visibility, rain/fog, wind) + GOES at the spot and toward the sun
  O.now = {};
  O.ensureNow = async (sp, ev, cb) => {
    const c = O.now[sp.id]; if (c && Date.now() - c.at < 10 * 60e3) return c;
    const n = NOW(), out = { at: Date.now() };
    try { const s = await station(sp);
      if (s) { const f = ((await (await fetch(`https://api.weather.gov/stations/${s.id}/observations?limit=4`, { headers: H })).json()).features || []).map(x => x.properties).filter(p => (p.cloudLayers || []).length || p.rawMessage);
        if (f.length) { const o = readOb(f[0]); Object.assign(out, { metar: Object.assign(o, { station: s.id, name: s.name, dist: s.d }) }); } } } catch (e) {}
    try { out.sat = await sat(sp, Object.assign({}, ev, { tSet: n })); } catch (e) {}
    O.now[sp.id] = out; cb && cb(out); return out;
  };
  // model low/mid cloud at time t → gray. ≥ ~95% low/mid deck = fully gray; < 80% = no effect
  const modelLM = (ev, t) => { const h = ev._h; if (!h || !g.Model.at) return Math.max(ev.s.low || 0, 0.95 * (ev.s.mid || 0)) / 100;
    return Math.max(g.Model.at(h, "cloud_cover_low", t) || 0, 0.95 * (g.Model.at(h, "cloud_cover_mid", t) || 0)) / 100; };
  // ≥ 90% low/mid deck (mid weighted 0.95) = fully gray; ≤ 75% = no effect
  function modelGray(ev, t) { return clamp((modelLM(ev, t) - 0.75) / 0.15); }
  O.modelGray = modelGray;
  // returns { gray 0..1, haze 0..1, src, metar } for the scene at time t
  O.sceneAt = (sp, ev, t) => {
    if (/[?&]obs=0/.test(location.search) || !ev) return { gray: 0, haze: 0 };
    let mg = modelGray(ev, t);
    if (ev.obs && Math.abs(t - ev.tSet) < 5400) mg = Math.max(mg, ev.obs.gray);          // event-window observed blend (d15)
    else if (Math.abs(t - ev.tSet) < 5400) mg = Math.max(mg, clamp(((ev.slotBlock || 0) - 0.6) / 0.28));
    const N = O.now[sp.id], dt = Math.abs(t - NOW()), w = N ? 1 - clamp((dt - 3600) / 7200) : 0;   // obs fully trusted ±1 h of now, fading out by ±3 h
    if (!w) return { gray: mg, haze: 0, src: "model" };
    const m = N.metar, s = N.sat;
    let ob = 0;
    if (m) { ob = clamp((m.lm - 0.6) / 0.28); if (m.lm >= 0.85 && m.ceil != null && m.ceil < 10000) ob = 1; }
    if (s) ob = Math.max(ob, m ? clamp((0.5 * s.path + 0.5 * s.here - 0.6) / 0.28) : clamp((Math.max(s.here, s.path) - 0.6) / 0.28));
    const haze = m ? clamp((m.vis != null ? (3 - m.vis) / 2.5 : 0) + (m.wx ? 0.35 : 0) + (m.fog ? 0.35 : 0)) : 0;
    return { gray: clamp(w * ob + (1 - w) * mg), haze: w * haze, src: m ? `METAR ${m.station} ${m.layers || "CLR"}` : "GOES", metar: m, w };
  };
  O.refresh = async (spots, results, day) => {
    if (day !== 0) return false;
    const todo = results.filter(r => inWindow(r.ev.tSet));
    let q = 0;
    await Promise.all(todo.map(async r => { await new Promise(res => setTimeout(res, (q++) * 60));
      const [m, s] = await Promise.all([metar(r.spot, r.ev.tSet), sat(r.spot, r.ev)]); O.metar[r.spot.id] = m; O.sat[r.spot.id] = s; }));
    O.ready = true; O.at = Date.now(); return todo.length > 0;
  };
})(window);
