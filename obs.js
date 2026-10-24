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
  const O = g.AGObs = { st: {}, metar: {}, sat: {}, radar: {}, ready: false, errors: [] };
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const km = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return R * Math.hypot(x, y); };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  // window in which observations override the model: from 3 h before the event to 2.5 h after it
  const inWindow = tSet => { const n = NOW(); return tSet && n >= tSet - 3 * 3600 && n <= tSet + 2.5 * 3600; };

  // d23: every station within 40 km (max 4), nearest first — one automated station (KLFI "FEW043" under an 11,000 ft deck that
  // KPHF/KFAF/KJGG all reported) must not speak for the whole sky. station() keeps returning the nearest for old callers.
  async function stations(sp) {
    const C = O.stCache || (O.stCache = lsGet("ag-obs-stn-v2") || {});
    if (C[sp.id] !== undefined) return C[sp.id];
    try {
      const p = await (await fetch(`https://api.weather.gov/points/${sp.lat.toFixed(4)},${sp.lng.toFixed(4)}`, { headers: H })).json();
      const f = (await (await fetch(p.properties.observationStations, { headers: H })).json()).features || [];
      const all = f.slice(0, 8).map(x => ({ id: x.properties.stationIdentifier, name: x.properties.name, d: km(sp.lat, sp.lng, x.geometry.coordinates[1], x.geometry.coordinates[0]) })).filter(x => x.d <= 40).sort((a, b) => a.d - b.d).slice(0, 4);
      C[sp.id] = all.length ? all : null;
    } catch (e) { return null; }   // transient: don't cache
    lsSet("ag-obs-stn-v2", C); return C[sp.id];
  }
  const station = async sp => { const a = await stations(sp); return a ? a[0] : null; };
  // d23: blend several stations' reports: sky cover = ½ mean + ½ max (a deck seen by any station counts), layers from the cloudiest,
  // precip/dry from all of them, wind from the nearest station that reports one.
  function blend(list) {
    const L = list.filter(Boolean); if (!L.length) return null;
    const lms = L.map(x => x.lm), mean = lms.reduce((a, b) => a + b, 0) / lms.length, mx = Math.max(...lms);
    const cloudiest = L.slice().sort((a, b) => b.lm - a.lm)[0], ceils = L.map(x => x.ceil).filter(x => x != null);
    const wnd = L.find(x => x.mph != null);
    return Object.assign({}, L[0], { lm: 0.5 * mean + 0.5 * mx, ceil: ceils.length ? Math.min(...ceils) : null, layers: L.map(x => `${x.station}:${x.layers || "CLR"}`).join(" "),
      // d23: wet only if the nearest station (≤ 12 km) or most stations report precip — KORF rain 17 km away across the water must not gray Buckroe
      cloudiestLayers: cloudiest.layers, wx: L.some(x => x.wx), shower: L.some(x => x.shower), dry: !((L[0].dist <= 12 && L[0].dry === false) || L.filter(x => x.dry === false).length > L.length / 2), mph: wnd ? wnd.mph : null, gust: wnd ? wnd.gust : null, wdir: wnd ? wnd.wdir : null,
      station: L.map(x => x.station).join("+"), n: L.length });
  }
  // low/mid sky cover from one observation: layers below 20,000 ft (ASOS reports to 12,000 ft; "CLR" = nothing below 12k)
  function readOb(p) {
    const L = (p.cloudLayers || []).map(c => ({ cov: COV[c.amount] ?? 0, ft: c.base && c.base.value != null ? c.base.value * 3.281 : null, amt: c.amount }));
    let clear = 1, ceil = null;
    for (const l of L) { if (l.ft != null && l.ft > 20000) continue; clear *= 1 - l.cov * (l.ft != null && l.ft > 6500 ? 0.85 : 1); if (l.cov >= 0.75 && (ceil == null || l.ft < ceil)) ceil = l.ft; }
    // d23: present weather from the METAR body only (remarks like "RAB40E43" = a shower that already ended)
    const raw = p.rawMessage || "", body = raw.split(" RMK")[0], wx = raw ? /(^|\s)[-+]?(VC)?(SH|TS)?(RA|DZ|SN|FG|BR)\b/.test(body) : (p.presentWeather || []).length > 0;
    const vis = p.visibility && p.visibility.value != null ? p.visibility.value / 1609 : null;
    const kmh = q => q && q.value != null ? q.value / 1.609344 : null;
    const shower = /(^|\s)([-+]?(VC)?SH|[-+]?(TS)?RA\b|TS)/.test(body);   // d23p: rain or showers at / near (VC) the station
    return { shower, vis, mph: kmh(p.windSpeed), gust: kmh(p.windGust), wdir: p.windDirection ? p.windDirection.value : null, fog: /(^|\s)(FG|BR|HZ)\b/.test(raw),
      lm: clamp(1 - clear + (wx ? 0.1 : 0) + (vis != null && vis < 3 ? 0.15 : 0)), ceil, layers: L.map(l => l.amt + (l.ft != null ? Math.round(l.ft / 100).toString().padStart(3, "0") : "")).join(" "), wx, t: Date.parse(p.timestamp) / 1000, raw };
  }
  async function metar1(s, tSet, retry = 1) {
    const n = NOW(), a = new Date((Math.min(n, tSet) - 5400) * 1000).toISOString(), b = new Date(Math.min(n, tSet + 1800) * 1000).toISOString();
    try {
      const f = ((await (await fetch(`https://api.weather.gov/stations/${s.id}/observations?start=${a}&end=${b}`, { headers: H })).json()).features || []).map(x => x.properties).filter(p => (p.cloudLayers || []).length || p.rawMessage);
      if (!f.length) return null;
      const obs = f.map(readOb).sort((x, y) => Math.abs(x.t - tSet) - Math.abs(y.t - tSet));
      const near = obs.slice(0, 3), lm = near.reduce((q, o) => q + o.lm, 0) / near.length;   // average the 3 reports nearest the event
      const ref = Math.min(n, tSet), recent = obs.filter(o => o.t >= ref - 2400 && o.t <= ref + 900);   // d23: dry = no precip in the reports of the last ~40 min
      const w = obs.find(o => o.mph != null);
      return { station: s.id, name: s.name, dist: s.d, lm, ceil: obs[0].ceil, layers: obs[0].layers, wx: obs[0].wx, shower: obs.slice(0, 2).some(o => o.shower), dry: recent.length ? !recent.some(o => o.wx && !o.fog) : null,
        mph: w ? w.mph : null, gust: w ? w.gust : null, wdir: w ? w.wdir : null, t: obs[0].t, raw: obs[0].raw };
    } catch (e) { if (retry) { await new Promise(r => setTimeout(r, 1200)); return metar1(s, tSet, 0); } return null; }
  }
  async function metar(sp, tSet) {
    const L = await stations(sp); if (!L) return null;
    return blend(await Promise.all(L.map(s => metar1(s, tSet))));
  }
  // GOES tiles: per-point low/mid cloud estimate. Daytime: visible bright minus what the IR says is cold (high) cloud.
  // Night/twilight: IR only — grey (cooler than the surface) tops ≈ low/mid cloud, coloured (cold) tops ≈ high cloud.
  async function satPoint(lat, lng, day) {
    if (!g.Sat || !g.Sat.samplePt) return null;
    const ir = await g.Sat.samplePt("ir", lat, lng); if (!ir) return null;
    const hi = clamp(ir.cold + ir.deep);
    // night: grey tops = low/mid; cold tops are ambiguous (thick deck or thin cirrus) → half weight
    let lm = clamp(ir.coolGrey * 0.45 + hi * 0.5);   // d24: IEM's IR greys also cover cool clear land/sea at dusk (Oct 23: 100% 'coolGrey' at every point incl. the clear 300 km one) — weak evidence alone
    // day: visible brightness = optical thickness. Bright = thick (blocks, whatever the top temperature); dim-but-cold = thin cirrus (may glow)
    if (day) { const v = await g.Sat.samplePt("vis", lat, lng); if (v) lm = clamp(v.bright + v.thin * 0.35 + ir.coolGrey * 0.3); }
    return { lm, hi };
  }
  async function sat(sp, ev) {
    const n = NOW(); if (n - ev.tSet > 1800 || ev.tSet - n > 3 * 3600) return null;   // d23: tiles are NOW-only — after the event they show a later sky (8 PM IR said "cloud" over tonight's clear slot), so not used past tSet+30 min
    const day = g.Model.sunPos(n, sp.lat, sp.lng).elev > 3;   // d23: visible ch02 is still usable down to ~3° (was 8° → IR-only from ~5:40 PM tonight)
    try {
      const az = ev.sunsetAz, pts = [0, 40, 120, 200, 300].map(d => d ? g.Model.offset(sp.lat, sp.lng, az, d) : { lat: sp.lat, lng: sp.lng });
      const r = await Promise.all(pts.map(p => satPoint(p.lat, p.lng, day)));
      if (r.some(x => !x)) return null;
      // d24: low-sun visible read relative to the tile's clear background (canvas()) beats the IR-only fallback: thick = blocks, broken = mostly lets light by
      const C = O.cv[sp.id]; if (C && n - C.at < 3600 && Math.abs(C.tSet - ev.tSet) < 3600) [0, 40, 120, 200, 300].forEach((d, i) => { const j = C.km.indexOf(d); if (j >= 0) r[i].lm = clamp(C.thick[j] + 0.4 * C.cv[j]); });
      // d23 light-geometry weights: the sunset ray under a deck is lowest (and most blockable) 120–300 km out; 40 km is mostly the deck itself
      const path = 0.1 * r[1].lm + 0.3 * r[2].lm + 0.35 * r[3].lm + 0.25 * r[4].lm;
      return { here: r[0].lm, hereHi: r[0].hi, path, pts: r.map(x => +x.lm.toFixed(2)), day, at: n };
    } catch (e) { return null; }
  }
  // d23r: radar echoes opposite the sun (anti-solar azimuth, 8/18/30/40 km) from 3 h before to 30 min after the event — showers there with the
  // sun getting through = rainbow (Virginia Beach Oct 17: ocean showers east at sunset, model's single 12 km point was dry)
  async function radarAnti(sp, ev) {
    const n = NOW(); if (!g.Sat || !g.Sat.samplePt || n - ev.tSet > 1800 || ev.tSet - n > 3 * 3600) return null;
    const az = ((ev.sunsetAz || 270) + 180) % 360;
    const r = await Promise.all([8, 18, 30, 40].map(d => g.Sat.samplePt("radar", ...Object.values(g.Model.offset(sp.lat, sp.lng, az, d)))));
    const ok = r.filter(Boolean); if (!ok.length) return null;
    // d23p: per-point >= ~20 dBZ (rain, not drizzle/clutter) fractions; 'wide' = rain at >= 3 of the 4 points and >= 50% on average
    const rp = r.map(x => x ? x.rain : null), hits = rp.filter(v => v != null && v >= 0.2).length, mean = ok.reduce((a, x) => a + x.rain, 0) / ok.length;
    return { echo: Math.max(...ok.map(x => x.echo)), rain: mean, pts: rp, hits, wide: hits >= 3 && mean >= 0.5, heavy: Math.max(...ok.map(x => x.heavy)), at: n };
  }
  O.radarAnti = radarAnti;
  // Combine → block 0..1 (sun's light blocked) and gray 0..1 (how far the render/score go flat)
  function combine(ev, m, s) {
    const model = clamp(ev.geoBlock != null ? ev.geoBlock : ev.slotBlock || 0), modelLow = clamp(Math.max((ev.s.low || 0), 0.85 * (ev.s.mid || 0)) / 100);
    const path = s ? 0.6 * s.path + 0.4 * model : model;      // light path toward the horizon (satellite now + latest model at the event hour)
    const here = m ? m.lm : s ? s.here : modelLow;            // overhead: what you'd look up through
    // d23: a deck OVERHEAD does not block the sunset — it is the screen. Only when the path is shut too does the overhead deck make it gray.
    const open = 1 - clamp((path - 0.15) / 0.45);
    let block = Math.max(path, (0.5 * here + 0.5 * path) * (1 - open));
    // a low (< 10,000 ft) BKN/OVC ceiling overhead with no gap toward the sun hides any colour above it
    if (m && m.lm >= 0.85 && m.ceil != null && m.ceil < 10000 && open < 0.3) block = Math.max(block, 0.9);
    if (s && s.path >= 0.8) block = Math.max(block, s.path);
    block = clamp(block);
    const gray = clamp((block - 0.6) / 0.28);
    const src = [m && `METAR ${m.station} ${m.layers || "CLR"}${m.wx ? " precip" : ""}`, s && `GOES ${s.day ? "vis+IR" : "IR"} path ${Math.round(s.path * 100)}%`, !s && `model path ${Math.round(model * 100)}%`].filter(Boolean).join(" · ");
    return { block, gray, here, path, open, metar: m, sat: s, src };
  }
  // d24: satellite CLOUD CANVAS along the sun path (Fort Monroe, Oct 23 2026: HRRR/GFS had 0% mid/high and patchy low along the whole
  // sunset azimuth, GOES visible showed broken Ac/Cu from overhead to ~200 km with clear sky beyond 250 km — an epic lit-cloud sunset the
  // app scored as plain). Sampled while the sun is up (visible needs daylight), kept per spot+day so it still counts through the afterglow
  // and after a reload. Fed into the model as observed mid cloud wherever it exceeds the model's own low+mid cover.
  O.cv = lsGet("ag-obs-cv") || {};
  const CVK = [0, 20, 40, 80, 120, 200, 300];
  async function canvas(sp, ev) {
    const n = NOW(); if (!g.Sat || !g.Sat.canvasPt || n - ev.tSet > 1800 || ev.tSet - n > 14 * 3600) return O.cv[sp.id] || null;   // d24c: present day — re-read the latest visible all day, every refresh
    if (g.Model.sunPos(n, sp.lat, sp.lng).elev < 2.5) return O.cv[sp.id] || null;   // low sun: the visible image is too dim to trust → keep the last good-light read (or the snapshot's)
    const az = ev.sunsetAz, r = await Promise.all(CVK.map(d => { const p = d ? g.Model.offset(sp.lat, sp.lng, az, d) : { lat: sp.lat, lng: sp.lng }; return g.Sat.canvasPt(p.lat, p.lng, 18); }));
    if (r.filter(Boolean).length < 5) return O.cv[sp.id] || null;
    const v = r.map(x => x ? x.cv : 0), th = r.map(x => x ? x.thick : 0);
    const o = { tSet: ev.tSet, at: n, km: CVK, cv: v.map(x => +x.toFixed(2)), thick: th.map(x => +x.toFixed(2)),
      here: 0.3 * v[0] + 0.25 * v[1] + 0.25 * v[2] + 0.2 * v[3], west: (v[0] + v[1] + v[2] + v[3] + v[4]) / 5, far: 0.5 * v[5] + 0.5 * v[6], farThick: Math.max(th[5], th[6]) };
    const P = O.cv[sp.id]; if (P && P.irMid && P.tSet === o.tSet && n - P.at < 2400) Object.assign(o, { irCv: P.irCv, irMid: P.irMid, irLow: P.irLow }); if (P && P.storms && P.tSet === o.tSet) { o.storms = P.storms; if (P.stormsAnti) o.stormsAnti = P.stormsAnti; }   // d24t: radar storm cells from the snapshot if (P && P.antiIrMid && P.tSet === o.tSet && n - P.at < 2400) for (const k in P) if (/^(anti|side|over|storms)/.test(k)) o[k] = P[k];   // d24j: keep the opposite-sky/overhead reads too   // keep the 15-min snapshot's IR heights
    O.cv[sp.id] = o; const keep = {}; for (const k in O.cv) if (n - O.cv[k].tSet < 86400) keep[k] = O.cv[k]; lsSet("ag-obs-cv", keep);
    return o;
  }
  O.canvas = canvas;
  // d24k: satellite reads hours ahead are less predictive → weight ~0.25 at 9 h before the event, 1 within 1 h
  // d25b: satellite weight rises smoothly as the event nears — 0.12 at ≥8 h out (forecast dominates), 0.95 within 1 h (satellite dominates). Used for scores and the render cloud bump.
  O.satW = C => { const h = C && C.at ? Math.max(0, (C.tSet - C.at) / 3600) : 0; const u = Math.max(0, Math.min(1, (h - 1) / 7)); return (0.12 + 0.83 * (1 - u * u * (3 - 2 * u))) * (C.src === "goes-ir4km-only" ? 0.8 : 1); };   // d24l: IR-only reads miss some thin/low cloud
  O.satNote = C => { const h = Math.max(0, (C.tSet - C.at) / 3600); return ` (satellite read ${h < 1 ? Math.round(h * 60) + ' min' : h.toFixed(1) + ' h'} before the event${C.src === "goes-ir4km-only" ? ", infrared only, visible dark" : ""}, weight ${Math.round(O.satW(C) * 100)}%)`; };
  // d24j: opposite-sky/overhead lighting. Broken MID/HIGH tops overhead or 20-200 km opposite the sun (± 45°), not a closed low deck,
  // AND an open sun-path horizon (light gets in under them). Per-spot readings only; 0..1.
  O.oppGlow = C => { if (!C || !C.antiIrMid || !C.irCv) return 0; const cl = x => Math.max(0, Math.min(1, x));
    const deck = (cv, lo) => cv >= 0.9 && lo >= 0.5;
    const pts = C.antiIrMid.map((m, i) => ({ m: Math.max(m, 0.8 * (C.sideIrMid || [])[i] || 0), d: deck(C.antiIrCv[i], C.antiIrLow[i]) })).concat([{ m: C.overIrMid, d: deck(C.overIrCv, C.overIrLow) }]);
    const lit = Math.max(0, ...pts.filter(p => !p.d && p.m <= 0.9).map(p => p.m)), oppDeck = pts.filter(p => p.d).length / pts.length;
    const sunDeck = C.irLow.slice(0, 5).some((l, i) => C.irCv[i] >= 0.9 && l >= 0.5) ? 1 : 0, farOpen = cl(1 - (Math.max(C.irCv[5], C.irCv[6]) - 0.25) / 0.45);
    return cl((lit - 0.3) / 0.45) * farOpen * (1 - sunDeck) * (1 - 0.7 * oppDeck); };
  // snapshot (GitHub Actions, tools/satcv.js, ~every 15 min while sunsets are near): reads taken with the sun ~4° up, for first loads
  // and for opening the app after the in-browser read is no longer possible. A fresher in-browser read wins.
  const snap = () => /[?&]mode=sunrise/.test(location.search) ? Promise.resolve() : fetch(`data/satcv-sunset.json?_=${Math.floor(Date.now() / 300000)}`).then(r => r.ok ? r.json() : null).then(j => {
    if (!j || !j.spots) return; for (const id in j.spots) { const a = j.spots[id], b = O.cv[id]; if (!b || b.tSet !== a.tSet || (b.at || 0) < a.at) O.cv[id] = a; } }).catch(() => {});
  O.cvSnap = snap();
  // observed cloud → model inputs (hourly copies; only the hours either side of the event are touched)
  function withCanvas(args, ev, C) {
    const [sp, S, Wl] = args, tAt = ev.tSet;
    const bump = (H, frac, lowSh = 0) => { if (!H || !H.time || frac < 0.04) return H; const h = Object.assign({}, H), i = Math.max(0, Math.floor((tAt - H.time[0]) / 3600));
      if (lowSh > 0 && h.cloud_cover_low) { h.cloud_cover_low = h.cloud_cover_low.slice(); for (const j of [i, i + 1]) if (j < h.cloud_cover_low.length) h.cloud_cover_low[j] = Math.max(h.cloud_cover_low[j] || 0, 100 * Math.min(0.9, frac * lowSh * 1.1)); }   // d24x: satellite-seen LOW cloud (IR-warm tops: cumulus) → low layer, drawn as cumulus puffs
      frac *= 1 - lowSh;
      for (const k of ["cloud_cover_mid", "cloud_cover"]) if (h[k]) { h[k] = h[k].slice(); for (const j of [i, i + 1]) if (j < h[k].length) { const lo = (H.cloud_cover_low || [])[j] || 0, mdl = (H.cloud_cover_mid || [])[j] || 0;
        const want = 100 * Math.min(0.95, frac * 1.1); if (k === "cloud_cover_mid" && Math.max(lo, mdl) < want) h[k][j] = Math.max(mdl, want - 0.5 * lo); if (k === "cloud_cover") h[k][j] = Math.max(h[k][j] || 0, want); } }
      return h; };
    const pick = km => { const i = C.km.indexOf(km); return i >= 0 ? C.cv[i] : 0; };
    const sw = O.satW(C), lowSh = C.irLow && C.irCv ? Math.max(0, Math.min(1, C.irLow.slice(0, 4).reduce((a, v) => a + v, 0) / Math.max(0.01, C.irCv.slice(0, 4).reduce((a, v) => a + v, 0)))) : 0.5, S2 = Object.assign({}, S, { hourly: bump(S.hourly, sw * Math.min(0.75, 1.5 * Math.max(C.here, 0.9 * C.west)), lowSh) });   // the sky you see toward the sun (0–120 km) is the canvas, not just the zenith
    const W2 = Wl.map((w, k) => w && Object.assign({}, w, { hourly: bump(w.hourly, sw * [0.5 * pick(40) + 0.5 * pick(80), pick(120), 0.5 * pick(200) + 0.5 * pick(300)][k] || 0, lowSh) }));
    const a = Array.from(args); a[1] = S2; a[2] = W2; return a;
  }
  // Wrap Model.evaluate so EVERY caller (pins, list, day strip, detail, render) gets the observed override.
  const base = g.Model.evaluate;
  g.Model.evaluate = function (sp) {
    let ev = base.apply(this, arguments);
    try { const C = !/[?&](obs|sat)=0/.test(location.search) && ev && O.cv[sp.id];
      if (C && Math.abs(C.tSet - ev.tSet) < 3600 && Math.max(...C.cv.slice(0, 5)) >= 0.05) {   // d24x: was 0.15 — scattered small cumulus (5–15 %) were ignored const e2 = base.apply(this, withCanvas(arguments, ev, C));
        if (e2) { e2.satCanvas = C; e2.scoreNoSat = ev.score; (e2.reasons || (e2.reasons = [])).unshift(`Satellite (GOES ${C.src === "goes-ir4km-only" ? "infrared" : "visible+IR"}): broken cloud along the ${g.AG_MODE === "sunrise" ? "sunrise" : "sunset"} path — ${C.cv.slice(0, 5).map((v, i) => `${C.km[i]} km ${Math.round(v * 100)}%`).join(", ")}; ${C.far < 0.3 ? "open horizon beyond" : "cloud on the horizon too"}. The model had little mid cloud here; using the observed cloud${O.satNote(C)}.`); ev = e2;
          // broken cloud (not a solid deck) across the visible western sky + an open horizon = the lit-cloud sunset: 85–95
          let q;
          if (C.irMid) {   // d24b: visible + infrared. Light-catchers = broken MID/HIGH tops 20-120 km west; blockers = closed low deck or solid overhead.
            const mids = C.irMid.slice(1, 5).filter(m => m <= 0.88), lit = mids.length ? Math.max(...mids) : 0;
            const lowDeck = Math.max(...C.irLow.slice(0, 5).map((l, i) => (C.irCv[i] >= 0.9 && l >= 0.5) ? 1 : 0));
            const solid = clamp((Math.max(...C.irCv.slice(0, 2)) - 0.85) / 0.1), farOpen = clamp(1 - (C.irCv[6] - 0.2) / 0.4);
            q = clamp((lit - 0.4) / 0.45) * farOpen * (1 - solid) * (1 - lowDeck);
          } else {
            const brk = clamp(1 - Math.abs(C.west - 0.5) / 0.4), farOpen = clamp(1 - (C.far - 0.2) / 0.5) * (1 - clamp((C.farThick - 0.15) / 0.3)), solid = clamp((Math.max(...C.thick.slice(0, 4)) - 0.5) / 0.3);
            q = brk * farOpen * (1 - solid) * 0.8;
          }
          { const oq = O.oppGlow(C) * O.satW(C); if (oq > 0.05) { ev.oppGlow = +oq.toFixed(2); if (oq > q) { const sc = Math.round(ev.score + (88 - ev.score) * oq * 0.8); if (sc > ev.score) { ev.scoreSatModel = ev.scoreSatModel || ev.score; ev.score = sc; ev.oppBoost = ev.oppGlow; (ev.reasons || (ev.reasons = [])).unshift(`Satellite (GOES visible+IR): broken mid/high cloud overhead and ${g.AG_MODE === "sunrise" ? "west" : "east"} (opposite the sun) with the horizon toward the sun open — those clouds should light pink-red ${g.AG_MODE === "sunrise" ? "before sunrise" : "after sunset"}${O.satNote(C)}.`); } } } }
          q *= O.satW(C);
          if (C.west >= 0.15 && q > 0.2 * O.satW(C)) { const sc = Math.round(ev.score + (90 - ev.score) * q); if (sc > ev.score) { ev.scoreSatModel = ev.score; ev.score = sc; ev.satBoost = +q.toFixed(2); } } } } } catch (e) { console.warn("sat canvas", e); }
    try { const C = !/[?&](obs|sat)=0/.test(location.search) && ev && ev.oppGlow == null && O.cv[sp.id];   // d24j: clear sun path but lit clouds opposite/overhead still counts
      if (C && Math.abs(C.tSet - ev.tSet) < 3600) { const oq = O.oppGlow(C) * O.satW(C); if (oq > 0.05) { ev.oppGlow = +oq.toFixed(2); const sc = Math.round(ev.score + (85 - ev.score) * oq * 0.7); if (sc > ev.score) { ev.scoreSatModel = ev.score; ev.score = sc; ev.oppBoost = ev.oppGlow; (ev.reasons || (ev.reasons = [])).unshift(`Satellite (GOES visible+IR): broken mid/high cloud overhead / opposite the sun with an open horizon toward the sun — those clouds should light pink-red${O.satNote(C)}.`); } } } } catch (e) {}
    try { Object.defineProperty(ev, "_h", { value: arguments[1] && arguments[1].hourly, enumerable: false }); Object.defineProperty(ev, "_sp", { value: sp, enumerable: false }); } catch (e) {}   // d16: hourly clouds for grayAt(t)
    try {
      if (/[?&]obs=0/.test(location.search) || !ev) return ev;
      const inW = inWindow(ev.tSet), m0 = inW ? O.metar[sp.id] : null;
      // d23: stations say the rain has stopped (all reports in the last hour dry) → lift the model-rain gate and drop the rain card/drawing
      if (m0 && m0.dry && ev.scoreDry > ev.score) { ev.scoreRainModel = ev.score; ev.score = ev.scoreDry; ev.gates = (ev.gates || []).filter(x => !/rain/i.test(x)); ev.obsDry = true; }
      if (m0 && m0.dry && ev.wx && ev.wx.items) { ev.wx.items = ev.wx.items.filter(x => x.id !== "rain"); ev.obsDry = true; }
      { const mgE = Math.max(O.modelGray ? O.modelGray(ev, ev.tSet) : 0, clamp(((ev.geoBlock != null ? Math.min(ev.slotBlock || 0, ev.geoBlock + 0.25) : ev.slotBlock || 0) - 0.6) / 0.28));   // d16: score agrees with the gray render for any day (d23: gap-aware)
        if (mgE > 0) { const cap = Math.round(ev.score + (12 - ev.score) * mgE); if (cap < ev.score) { ev.scoreModel = ev.score; ev.score = cap; } } }
      // d23p: rainbow from OBSERVED evidence (stricter, data-driven). Needs ALL of: (1) rain opposite the sun 8–40 km out — NEXRAD >= ~20 dBZ
      // at >= 3 of 4 anti-solar points (>= 50% coverage), or, with no radar, a nearby METAR reporting rain/showers (RA/SHRA/VCSH) while the
      // model has rain there; (2) the sun's light path open (GOES or model); (3) sun 0–42°. Radar that shows NO rain there vetoes a model bow.
      { const R = inW && O.radar[sp.id], B = ev.bonus && ev.bonus.bow, M0 = inW && O.metar[sp.id];
        const S0 = O.sat[sp.id], op = S0 && S0.path != null ? 0.6 * (1 - clamp((S0.path - 0.15) / 0.45)) + 0.4 * (ev.gapOpen || 0) : ev.gapOpen || 0;
        const tb = ev.tSet - (g.AG_MODE === "sunrise" ? -900 : 900), el = g.Model.sunPos(tb, sp.lat, sp.lng).elev;
        if (B && R && R.hits === 0 && (B.p || 0) > 4) { B.pModel = B.p; B.p = 4; B.why = `Rainbow unlikely — radar shows no rain ${g.AG_MODE === "sunrise" ? "west" : "east"} of here (opposite the sun) near ${g.AG_MODE === "sunrise" ? "sunrise" : "sunset"}.`; if (ev.bow) ev.bow.p = 4; }
        const evid = R ? R.wide : !!(M0 && M0.shower && (B && B.rainEast > 0));
        if (B && evid && op >= 0.5 && el > 0 && el < 42) { const p = Math.round(100 * clamp(0.3 + 0.4 * clamp(R ? R.rain : 0.5) * clamp(op) + 0.15 * clamp(R ? R.heavy * 5 : 0)));
          if (p > (B.p || 0)) {
            B.p = p; B.t = tb; B.red = true; B.win = B.win && B.win.start ? B.win : { start: ev.tSet - (g.AG_MODE === "sunrise" ? 0 : 1800), end: ev.tSet + (g.AG_MODE === "sunrise" ? 1800 : 0) };
            B.why = `Rainbow ${p}% — ${R ? `radar shows rain ${g.AG_MODE === "sunrise" ? "west" : "east"} (opposite the sun) at ${R.hits} of 4 points 8–40 km out` : `nearby station reports showers and the model has rain ${g.AG_MODE === "sunrise" ? "west" : "east"}`} while the ${g.AG_MODE === "sunrise" ? "eastern" : "western"} light path is open (${Math.round(op * 100)}%); low sun = a tall, red-tinged bow. Look ${g.AG_MODE === "sunrise" ? "west" : "east"}.`;
            if (ev.bow) ev.bow.p = Math.max(ev.bow.p || 0, p); ev.bowObs = R || { metar: M0.station }; } } }
      if (!inW) return ev;
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
    try { const L = await stations(sp);
      if (L) { const one = async s => { const f = ((await (await fetch(`https://api.weather.gov/stations/${s.id}/observations?limit=4`, { headers: H })).json()).features || []).map(x => x.properties).filter(p => (p.cloudLayers || []).length || p.rawMessage);
          if (!f.length) return null; const os = f.map(readOb), o = os[0], w = os.find(x => x.mph != null), rec = os.filter(x => x.t >= n - 3600);   // d23: wind from the newest report that has one
          return Object.assign(o, { station: s.id, name: s.name, dist: s.d, dry: rec.length ? !rec.some(x => x.wx && !x.fog) : null, mph: w ? w.mph : null, gust: w ? w.gust : null, wdir: w ? w.wdir : null }); };
        const b = blend(await Promise.all(L.map(s => one(s).catch(() => null)))); if (b) out.metar = b; } } catch (e) {}
    try { out.sat = await sat(sp, Object.assign({}, ev, { tSet: n })); } catch (e) {}
    O.now[sp.id] = out; cb && cb(out); return out;
  };
  // model low/mid cloud at time t → gray. ≥ ~95% low/mid deck = fully gray; < 80% = no effect
  const modelLM = (ev, t) => { const h = ev._h; if (!h || !g.Model.at) return Math.max(ev.s.low || 0, 0.95 * (ev.s.mid || 0)) / 100;
    return Math.max(g.Model.at(h, "cloud_cover_low", t) || 0, 0.95 * (g.Model.at(h, "cloud_cover_mid", t) || 0)) / 100; };
  // ≥ 90% low/mid deck (mid weighted 0.95) = fully gray; ≤ 75% = no effect
  // d23: gap lighting — as the sun drops under the deck (≈6° → 2°) with an open path, the overhead deck stops reading as flat gray:
  // its bottoms and edges catch the light, then the undersides glow after sunset. Before that (sun high above the deck) it stays blue-gray.
  const gapW = (ev, t) => { const o = ev.gapOpen || 0; if (!o || !ev._sp) return 0; const e = g.Model.sunPos(t, ev._sp.lat, ev._sp.lng).elev;
    const S = O.sat[ev._sp.id] || (O.now[ev._sp.id] && O.now[ev._sp.id].sat), so = S && S.path != null ? 1 - clamp((S.path - 0.15) / 0.45) : null;
    const op = so != null && Math.abs(t - NOW()) < 3 * 3600 && NOW() - ev.tSet < 1800 ? 0.6 * o + 0.4 * so : o;
    return clamp(op * 1.15) * clamp((4.5 - e) / 4.5) * clamp((e + 7) / 2); };
  O.gapW = gapW;
  function modelGray(ev, t) { return clamp((modelLM(ev, t) - 0.75) / 0.15) * (1 - gapW(ev, t)); }
  O.modelGray = modelGray;
  // returns { gray 0..1, haze 0..1, src, metar } for the scene at time t
  O.sceneAt = (sp, ev, t) => {
    if (/[?&]obs=0/.test(location.search) || !ev) return { gray: 0, haze: 0 };
    let mg = modelGray(ev, t);
    if (ev.obs && Math.abs(t - ev.tSet) < 5400) mg = Math.max(mg, ev.obs.gray);          // event-window observed blend (d15)
    else if (Math.abs(t - ev.tSet) < 5400) mg = Math.max(mg, clamp(((ev.geoBlock != null ? Math.min(ev.slotBlock || 0, ev.geoBlock + 0.25) : ev.slotBlock || 0) - 0.6) / 0.28));
    const N = O.now[sp.id], dt = Math.abs(t - NOW()), w = N ? 1 - clamp((dt - 3600) / 7200) : 0;   // obs fully trusted ±1 h of now, fading out by ±3 h
    if (!w) return { gray: mg, haze: 0, src: "model", gapW: gapW(ev, t) };
    const m = N.metar, s = N.sat && N.at / 1000 <= t + 1800 ? N.sat : null;   // d23: a satellite sample taken well AFTER the shown time says nothing about it
    let ob = 0;
    if (m) { ob = clamp((m.lm - 0.6) / 0.28); if (m.lm >= 0.85 && m.ceil != null && m.ceil < 10000) ob = 1; }
    if (s) ob = Math.max(ob, m ? clamp((0.5 * s.path + 0.5 * s.here - 0.6) / 0.28) : clamp((Math.max(s.here, s.path) - 0.6) / 0.28));
    ob *= 1 - gapW(ev, t);                                   // d23: an overhead deck with the sun shining in underneath is lit, not gray
    ob = Math.max(ob, 0.6 * mg);                             // d23: observations can lower the model's gray, never erase it (KLFI FEW043 vs the 11k ft deck)
    const haze = m ? clamp((m.vis != null ? (3 - m.vis) / 2.5 : 0) + (m.wx ? 0.35 : 0) + (m.fog ? 0.35 : 0)) : 0;
    const broken = m ? (m.lm >= 0.3 && m.lm < 0.85 && !/OVC|VV/.test(m.cloudiestLayers || m.layers || "") ? 1 : 0) : null;   // d17: BKN/SCT deck with gaps
    const gapObs = s ? clamp(1 - s.path) : null;
    const haze2 = m && m.dry ? Math.min(haze, 0.15) : haze;   // d23: rain has stopped at every station → no rain haze
    return { gray: clamp(w * ob + (1 - w) * mg), haze: w * haze2, src: m ? `METAR ${m.station} ${m.layers || "CLR"}` : "GOES", metar: m, w, broken, gapObs, gapW: gapW(ev, t), dry: m ? !!m.dry : null };
  };
  O.refresh = async (spots, results, day) => {
    if (day === 0) await snap();   // d24c: pull the newest 15-min satellite snapshot each cycle
    if (day !== 0) return false;
    const pr = g.AGPrio || (() => 0), todo = results.filter(r => inWindow(r.ev.tSet)).sort((a, b) => pr(a) - pr(b));   // d24: open spot, then the map view, then the rest
    let q = 0;
    await Promise.all(todo.map(async r => { await new Promise(res => setTimeout(res, (q++) * 60));
      await canvas(r.spot, r.ev).catch(() => null); const [m, s, rd] = await Promise.all([metar(r.spot, r.ev.tSet), sat(r.spot, r.ev), radarAnti(r.spot, r.ev)]); O.metar[r.spot.id] = m; O.sat[r.spot.id] = s; O.radar[r.spot.id] = rd; }));
    O.ready = true; O.at = Date.now(); return todo.length > 0;
  };
})(window);
