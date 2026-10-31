// DRAFT extras: wave ≥3 ft icon (Open-Meteo Marine), NWS severe triangle + tornado flag (api.weather.gov),
// default-facing (water side) per spot, photo upload + feedback panel (localStorage, exportable).
(function (g) {
  const FACE_EAST = new Set(["hatteraslh","saltponds","grandview","plumtree","capehenry","avalonpier","jennettes","frisco","buxton","avon",
    "ditchplains","rockaway","manasquan","narragansett","hamptonnh","ocmd","vb1st","sandbridge","sturns","rodanthe","wrightsville","folly","tybee","jaxpier","newsmyrna","sebastian","cocoa"]);
  // d13: shore-facing angle (direction the beach faces, toward open water, degrees true) — drives offshore/onshore/cross-shore.
  // Wind FROM normal±60° = onshore, FROM normal+180±60° = offshore, otherwise cross-shore. Measured from the OSM coastline / charts.
  const SHORE_NORMAL = { saltponds: 100, windmillpt: 95, jennettes: 75, rodanthe: 100, sturns: 85, vb1st: 85, sandbridge: 80,
    frisco: 165, pensacola: 170, galveston: 140 };
  const normal = sp => SHORE_NORMAL[sp.id] != null ? SHORE_NORMAL[sp.id] : FACE_EAST.has(sp.id) ? 90 : (sp.arc ? (sp.arc[0] + sp.arc[1]) / 2 : 270);
  const BAYPT = { saltponds: [37.04, -76.2], buckroecoffee: [37.04, -76.2] }, WMIN = { saltponds: 1.5, buckroecoffee: 1.5 };   // d28z5: Buckroe — nearest open-bay marine grid (the default sea cell snaps to sheltered Hampton Roads), rideable bay windswell from 1.5 ft
  const LAT = s => (BAYPT[s.id] || [s.lat])[0], LNG = s => (BAYPT[s.id] || [0, s.lng])[1];
  const M = {}, AL = {}, PM = {};   // d25p: PM = past-day marine hourly (archived), filled per past chunk
  const MV = "wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,wind_wave_height,wind_wave_direction,secondary_swell_wave_height,secondary_swell_wave_direction";
  const hrs = h => ({ t: h.time.map(x => Date.parse(x) / 1000), wh: h.wave_height, wd: h.wave_direction, wp: h.wave_period, sh: h.swell_wave_height, sd: h.swell_wave_direction, sp: h.swell_wave_period, ww: h.wind_wave_height, s2: h.secondary_swell_wave_height, d2: h.secondary_swell_wave_direction });
  // marine values at time t from live or archived hours (nearest hour within 2 h); null = no data for that time (caller hides wave/swell)
  // d25r: past hours use MEASURED data only — NDBC buoy (data/buoys.json, written by the satcv Action) for waves, IEM ASOS for wind.
  // No model hindcast is ever shown as a past reading; with no representative measurement the line is hidden.
  let BU = null, BUp = null, MH = null; const PW = {}, PWp = {}, BS = {}, MZ = {}, DATA = "https://afterglowpremium.github.io/afterglow-preview/data/";
  const isPast = t => t < Date.now() / 1000 - 3600, hz = () => "?h=" + Math.floor(Date.now() / 9e5);
  const lazy = (C, k, url) => { if (!(k in C)) { C[k] = null; fetch(url + hz()).then(r => r.ok ? r.json() : 0).then(j => { C[k] = j || 0; window.__agQueue && window.__agQueue(); }).catch(() => { C[k] = 0; }); } return C[k]; };
  function nearest(A, t, max) { let r = null, b = max; for (const x of A) { const d = Math.abs(x[0] - t); if (d <= b) { b = d; r = x; } } return r; }
  // priority for a past hour: measured buoy (±90 min) > NWS archived marine forecast in force then (issued ≤ t, ≤ 12 h old) > nothing (hidden)
  function buoyAt(id, t) { const s = BU && BU.spots[id]; if (!s) return null; const A = lazy(BS, s.id, DATA + "buoys/" + s.id + ".json"); if (!A) return null; const r = nearest(A, t, 5400);
    return r && r[1] != null ? { now: r[1], sw: r[1], swPer: r[2], per: r[2], swDir: r[3], dir: r[3], wd: r[3], src: s, measured: true, bt: r[0], bmph: r[4], bwdir: r[5] } : null; }
  function nwsAt(id, t) { const z = MH && MH.zones[id]; if (!z || !MH.have.includes(z.id)) return null; const A = lazy(MZ, z.id, DATA + "marine/" + z.id + ".json"); if (!A) return null;
    let r = null; for (const x of A) if (x[0] <= t && t - x[0] <= 12 * 3600) r = x; if (!r) return null; const mid = (r[1] + r[2]) / 2;
    return { now: mid, sw: mid, lo: r[1], hi: r[2], swPer: r[3], per: r[3], swDir: r[4], dir: r[4], wd: r[4], nws: z, it: r[0] }; }
  function pastSea(id, t) { return buoyAt(id, t) || nwsAt(id, t); }
  function mAt(id, t) { if (isPast(t)) { if (!BU && X.loadBuoys) X.loadBuoys().then(() => window.__agQueue && window.__agQueue()); return pastSea(id, t); }
    for (const H of [M[id] && M[id].h]) { if (!H || !H.t.length) continue; let i = -1, b = 7200; for (let k = 0; k < H.t.length; k++) { const d = Math.abs(H.t[k] - t); if (d <= b) { b = d; i = k; } }
      if (i >= 0 && H.wh[i] != null) return { now: H.wh[i], dir: H.sd[i] ?? H.wd[i], per: H.wp[i], swPer: H.sp ? H.sp[i] : null, sw: H.sh[i], ww: H.ww[i], s2: H.s2[i], d2: H.d2[i], swDir: H.sd[i], wd: H.wd[i] }; } return null; }
  const SEV = /Tornado|Severe Thunderstorm|Hurricane|Tropical Storm|Storm Surge|Flash Flood|Extreme Wind|Hurricane Force Wind/;
  async function marine(spots) {
    const pts = spots.filter(s => s.water !== undefined);
    for (let i = 0; i < pts.length; i += 40) {
      const b = pts.slice(i, i + 40), p = new URLSearchParams({ latitude: b.map(LAT).join(","), longitude: b.map(LNG).join(","),
        hourly: MV, forecast_days: "3", timezone: "America/New_York", length_unit: "imperial", cell_selection: "sea" });
      try { const r = await fetch("https://marine-api.open-meteo.com/v1/marine?" + p); if (!r.ok) continue; let j = await r.json(); if (!Array.isArray(j)) j = [j];
        j.forEach((d, k) => { const h = d.hourly; if (!h) return; const now = Date.now(), idx = Math.max(0, h.time.findIndex(t => Date.parse(t) >= now - 3600e3));
          const hs = h.wave_height.slice(idx, idx + 48).filter(x => x != null), max = hs.length ? Math.max(...hs) : null;
          M[b[k].id] = { max, now: h.wave_height[idx], dir: h.swell_wave_direction[idx] ?? h.wave_direction[idx], per: h.wave_period[idx], h: hrs(h), sw: h.swell_wave_height[idx], ww: h.wind_wave_height[idx], s2: h.secondary_swell_wave_height[idx], d2: h.secondary_swell_wave_direction[idx] }; });
      } catch (e) { console.warn("marine", e); }
    }
    for (const id in WMIN) if (!M[id] || M[id].max == null) { const n = nwsAt(id, Date.now() / 1000); if (n) M[id] = Object.assign(M[id] || {}, { max: n.hi, now: n.now, dir: n.dir, per: n.per, nws: true }); }   // NWS Chesapeake Bay CWF fallback
  }
  async function alerts(spots) {
    let q = 0; await Promise.all(spots.map(async s => { await new Promise(r => setTimeout(r, (q++) * 80));
      try { const r = await fetch(`https://api.weather.gov/alerts/active?point=${s.lat.toFixed(4)},${s.lng.toFixed(4)}`, { headers: { Accept: "application/geo+json" } }); if (!r.ok) return;
        const f = (await r.json()).features.map(x => x.properties).filter(p => SEV.test(p.event));
        AL[s.id] = f.length ? { events: [...new Set(f.map(p => p.event))], tornado: f.some(p => /Tornado Warning/.test(p.event)) } : null; } catch (e) {} }));
  }
  const offshore = (sp, wdir) => { const face = normal(sp); const d = Math.abs(((wdir - face + 540) % 360) - 180); return d > 120; };
  // Wind → wave look (rules from Surfline's Live Wind guide + surf-forecast primers): impact = speed × onshore/offshore component.
  // < 5 kt ≈ glassy/clean · 5–10 kt textured · onshore > 10 kt blown out (crumbly, whitewater, chop) · cross-shore = ruffled/chop
  // offshore holds faces open (steeper, clean, groomed); strong offshore (> ~15 kt) = heavy spray off the lips, hard to paddle.
  function windLook(sp, wd, mph, sw, gust) {
    // d26i: gusts add cat's-paws — effective speed = mean + 35% of the gust excess
    mph = (mph || 0) + (gust > mph ? 0.35 * (gust - mph) : 0);
    const face = normal(sp), kt = (mph || 0) / 1.15;
    const on = Math.cos((wd - face) * Math.PI / 180), cross = Math.abs(Math.sin((wd - face) * Math.PI / 180));   // on > 0: wind from the sea
    const tex = Math.max(0, Math.min(1, (kt - 5) / 5));
    let chop = Math.min(1, tex * (Math.max(0, on) * 1.2 + cross * 0.8) + Math.max(0, -on) * 0.06 * Math.min(1, kt / 15));
    // d26i: local wind ripples on the water you look at, whatever the direction (offshore/bay wind still roughens the surface):
    // glassy below ~3.5 mph, visible ripples from ~5 mph, cat's-paws/texture rising to ~0.55 chop by ~18 mph
    const rip = Math.max(0, Math.min(1, (mph - 3.5) / 14.5)); chop = Math.max(chop, 0.55 * Math.pow(rip, 0.8));
    const off = Math.max(0, -on) * Math.min(1, kt / 13), caps = Math.max(0, on + cross * 0.5) * Math.max(0, (kt - 10) / 12);
    const look = mph < 4 ? "glassy" : kt < 5 ? "light ripples" : on < -0.5 ? (kt > 15 ? "strong offshore — spray, hard paddle" : "offshore — clean, groomed") : on > 0.5 ? (kt > 10 ? "onshore — blown out" : "light onshore — textured") : (kt > 10 ? "cross-shore — choppy" : "cross-shore — textured");
    // d25o: wind vs SWELL too — wind blowing against the swell (from where it is heading) holds faces up and grooms lines; with the swell it
    // crumbles them. Long period = cleaner lines, bigger surf = more spray/whitecaps when onshore. Light wind (< 5 kt) is glassy regardless.
    const perK = sw && sw.per ? Math.max(0, Math.min(1, (sw.per - 6) / 8)) : .3, ftK = sw && sw.ft ? Math.min(1, sw.ft / 6) : .3;
    const vsSw = sw && sw.dir != null ? Math.cos((wd - sw.dir) * Math.PI / 180) : 0, against = Math.max(0, -vsSw), withSw = Math.max(0, vsSw);
    const chop2 = Math.min(1, chop * (1 - .3 * perK - .2 * against * tex + .2 * withSw * tex)), off2 = Math.min(1, off * (1 + .3 * against)), caps2 = Math.min(1, caps * (1 + .4 * ftK));
    // thresholds from /workspace/surf-conditions-research.md (Surfline/SE Surf): <5 kt glassy, 5–10 textured, >10 onshore blown out, offshore great to ~13 kt
    const per = sw && sw.per, gs = per >= 12, wsw = per && per < 8, expo = sw && sw.dir != null ? Math.abs(((sw.dir - face + 540) % 360) - 180) : 0;
    let q = mph < 4 ? "glassy" : kt < 5 ? "light ripples" : on < -0.5 ? (kt > 13 ? "strong offshore, spray off the lips, hard to take off" : gs ? "clean, groomed lines" : "clean") : on > 0.5 ? (kt > 10 ? "choppy, blown out" : "textured, crumbly") : (kt > 10 ? "bumpy, side-chop" : "textured");
    if (gs) q += " · groundswell"; else if (wsw) q += " · windswell"; if (expo > 70) q += " · sheltered, small";
    const rel = kt < 5 ? "Light" : on < -0.5 ? "Offshore" : on > 0.5 ? "Onshore" : "Cross-shore";
    return { chop: chop2, off: off2, caps: caps2, look, kt, q, rel, vsSw: +vsSw.toFixed(2) };
  }
  const X = g.AGX = {
    marine: M, alerts: AL,
    // d25o: swell at a given time (nearest marine hour; falls back to the combined wave field). null for land/lake spots without marine data.
    swellAt(id, t) { const m = mAt(id, t); if (!m) return null; const sw = m.sw != null && m.swDir != null, ft = sw ? m.sw : m.now, dir = sw ? m.swDir : m.wd, per = sw && m.swPer != null ? m.swPer : m.per;
      if (m.nws) { const it = new Date(m.it * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
        return { ft, dir: m.swDir, per: m.per, nws: true, txt: `Waves ${m.lo === m.hi ? m.hi : m.lo + "–" + m.hi} ft${m.per ? ` @ ${m.per} s` : ""}${m.swDir != null ? ` from the ${"N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW".split(" ")[Math.round(m.swDir / 22.5) % 16]}` : ""} · NWS marine forecast ${m.nws.id} (issued ${it} ET)` }; }
      return ft == null || dir == null ? null : { ft, dir, per, kind: m.measured ? `Waves (buoy ${m.src.id}, ${m.src.km} km)` : sw ? "Swell" : "Waves" }; },
    loadBuoys() { return BU ? Promise.resolve(BU) : BUp || (BUp = Promise.all([fetch(DATA + "buoys.json" + hz()).then(r => r.ok ? r.json() : null), fetch(DATA + "marine-history.json" + hz()).then(r => r.ok ? r.json() : null).catch(() => null)]).then(([j, m]) => { MH = m; return (BU = j); }).catch(() => (BUp = null))); },
    nwsAt, pastSea,
    buoyAt,
    // measured wind for a past hour: nearest ASOS/METAR (≤ 40 km) from the IEM archive, else the spot's buoy anemometer; null = hide
    pastWind(sp, t) { const k = sp.id + "|" + Math.round(t / 3600); if (k in PW) return PW[k]; const b = buoyAt(sp.id, t);
      if (!PWp[k]) PWp[k] = (async () => { try { const L = window.AGObs && AGObs.stations ? await AGObs.stations(sp) : null; for (const st of (L || []).slice(0, 3)) {
        const a = new Date((t - 5400) * 1000), z = new Date((t + 5400) * 1000), q = new URLSearchParams({ station: st.id.replace(/^K/, ""), tz: "Etc/UTC", format: "onlycomma", latlon: "no", missing: "M", year1: a.getUTCFullYear(), month1: a.getUTCMonth() + 1, day1: a.getUTCDate(), hour1: a.getUTCHours(), minute1: a.getUTCMinutes(), year2: z.getUTCFullYear(), month2: z.getUTCMonth() + 1, day2: z.getUTCDate(), hour2: z.getUTCHours(), minute2: z.getUTCMinutes() });
        const tx = await (await fetch("https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?" + q + "&data=drct&data=sknt&data=gust")).text();
        const R = tx.trim().split("\n").slice(1).map(l => l.split(",")).map(f => ({ t: Date.parse(f[1].replace(" ", "T") + "Z") / 1000, d: +f[2], k: +f[3], g: +f[4] })).filter(o => isFinite(o.k)).sort((x, y) => Math.abs(x.t - t) - Math.abs(y.t - t));
        if (R.length) { const o = R[0]; PW[k] = { wind: Math.round(o.k * 1.151), gust: isFinite(o.g) ? Math.round(o.g * 1.151) : null, wdir: isFinite(o.d) && o.k > 0 ? o.d : null, src: `${st.id} ASOS`, measured: true }; return; } } } catch (e) {}
        PW[k] = b && b.bmph != null ? { wind: b.bmph, gust: null, wdir: b.bwdir, src: `buoy ${b.src.id}`, measured: true } : null; })().then(() => window.__agQueue && window.__agQueue());
      return undefined; },
    mAt,
    // archived marine for a past date range (one request per 40 spots, 20 s cap, merged into PM; used by mAt/swellAt/sea for past days)
    async pastMarine(spots, start, end) { const pts = spots.filter(s => s.water !== undefined);
      await Promise.all(Array.from({ length: Math.ceil(pts.length / 40) }, (_, q) => pts.slice(q * 40, q * 40 + 40)).map(async b => {
        const p = new URLSearchParams({ latitude: b.map(LAT).join(","), longitude: b.map(LNG).join(","), hourly: MV, start_date: start, end_date: end, timezone: "America/New_York", length_unit: "imperial", cell_selection: "sea" });
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000);
        try { const r = await fetch("https://marine-api.open-meteo.com/v1/marine?" + p, { signal: ctl.signal }); if (!r.ok) return; let j = await r.json(); if (!Array.isArray(j)) j = [j];
          j.forEach((d, k) => { if (!d.hourly) return; const H = hrs(d.hourly), id = b[k].id, o = PM[id]; if (!o) { PM[id] = H; return; }
            const map = new Map(o.t.map((x, i) => [x, i])); H.t.forEach((x, i) => { if (map.has(x)) return; for (const f of Object.keys(H)) (o[f] = o[f] || []).push(f === "t" ? x : H[f][i]); }); });
        } catch (e) { console.warn("past marine", e); } finally { clearTimeout(to); } })); },
    normal, startTurned: (id, rise) => { const G1 = ((window.GEO180 || {})[id] || {})[rise ? "rise" : "set"]; return G1 ? !!G1.turn : !rise && FACE_EAST.has(id); },   // d28d: open toward the water side from the geography survey faceEast: id => FACE_EAST.has(id),
    badges: sp => { let h = ""; const m = M[sp.id], a = AL[sp.id]; if (m && m.max >= (WMIN[sp.id] || 3)) h += `<em class="pb wave" title="Waves to ${m.max.toFixed(1)} ft">🌊</em>`; if (a) h += `<em class="pb sev" title="${a.events.join(", ")}"></em>`; return h; },
    tip: sp => { const m = M[sp.id], a = AL[sp.id]; return (m && m.max != null ? `<br>🌊 Waves ${m.now != null ? m.now.toFixed(1) : "?"} ft now · up to ${m.max.toFixed(1)} ft / 48 h${m.per ? ` · ${Math.round(m.per)} s` : ""}` : "") + (a ? `<br><b style="color:#ff5a4a">▲ ${a.events.join(", ")}</b>` : ""); },
    sea: (sp, wind) => { const dq = new URLSearchParams(location.search).get("demo") || ""; const qp = new URLSearchParams(location.search);
      if (/surf/.test(dq)) { const ft = +qp.get("wave") || 5, mph = qp.get("wind") != null ? +qp.get("wind") : null, wd = qp.get("dir") != null ? +qp.get("dir") : null;
        const wl = wd != null ? windLook(sp, wd, mph || 0) : null; return { demo: true, ft, per: +qp.get("period") || 11, dir: qp.get("swelldir") != null ? +qp.get("swelldir") : 80, combo: /combo/.test(dq), off: wl ? wl.off > 0.2 : !/onshore/.test(dq), wl, surf: true, mph, wdir: wd }; } const tv = wind && wind.t != null ? wind.t : g.__agSeaT, past = tv && tv < Date.now() / 1000 - 3 * 3600, m = (tv && mAt(sp.id, tv)) || (past ? {} : M[sp.id] || {}); const wd = wind && wind.dir != null ? wind.dir : null;   // d25p: values at the viewed time; past day without archived data → no waves (not today's)
      return { ft: m.now || 0, per: m.per || 8, dir: m.dir, combo: !!(m.s2 && m.s2 > 1 && m.d2 != null && m.dir != null && Math.abs(((m.d2 - m.dir + 540) % 360) - 180) > 25), off: wd != null && offshore(sp, wd), wl: wd != null ? windLook(sp, wd, wind.mph || 0, m.dir != null ? { dir: m.sw != null ? m.dir : m.dir, per: m.per, ft: m.sw ?? m.now } : null, wind.gust) : null, surf: FACE_EAST.has(sp.id) || sp.type === "Beach" || sp.type === "Pier" }; },
    async refresh(spots) { g.__agSpots = spots; await Promise.all([marine(spots), alerts(spots)]); g.__agRender && g.__agRender(); },
  };
  // ---- photo upload + feedback side panel ----
  const FK = "afterglow-feedback";
  const load = () => { try { return JSON.parse(localStorage.getItem(FK)) || [] } catch (e) { return [] } };
  // d25a: Supabase upload + offline retry queue. Entries stay in localStorage with up:false until both the photo and the row are accepted;
  // retried on Save, on app open and when the phone comes back online. Uploaded photos are dropped locally to free space.
  const UP = {
    cfg: () => g.AG_CONFIG || {}, on: () => !!(UP.cfg().SUPABASE_URL && UP.cfg().SUPABASE_ANON_KEY), busy: null, err: "",
    async one(e) { const C = UP.cfg(), base = C.SUPABASE_URL.replace(/\/$/, ""), H = { apikey: C.SUPABASE_ANON_KEY }; if (!/^sb_/.test(C.SUPABASE_ANON_KEY)) H.Authorization = "Bearer " + C.SUPABASE_ANON_KEY;   // new sb_publishable keys go in apikey only
      let path = e.photoPath || null;
      if (e.photo && !path) { const p = `${(e.at || "").slice(0, 10)}/${String(e.spot).toLowerCase().replace(/[^a-z0-9_-]/g, "")}-${e.id}.jpg`, blob = await (await fetch(e.photo)).blob();
        const r = await fetch(`${base}/storage/v1/object/feedback/${p}`, { method: "POST", headers: Object.assign({ "Content-Type": "image/jpeg", "x-upsert": "false" }, H), body: blob });
        const t = r.ok ? "" : await r.text().catch(() => ""); if (!r.ok && r.status !== 409 && !/Duplicate|already exists/i.test(t)) throw new Error(`photo upload ${r.status} ${t.slice(0, 120)}`);
        path = e.photoPath = p; }
      const row = { id: e.id, spot: e.spot, mode: e.mode === "sunrise" ? "sunrise" : "sunset", saved_at: e.at, shot_at: e.shot || null, view_t: e.viewT ? new Date(e.viewT * 1000).toISOString() : null, day: e.day,
        rating: e.actual, accuracy: e.acc, notes: (e.note || "").slice(0, 2000), photo_path: path, app_version: String(e.ver || "").slice(0, 20), pred: e.pred };   // group id rides in pred.group (no schema change)
      const r2 = await fetch(`${base}/rest/v1/feedback`, { method: "POST", headers: Object.assign({ "Content-Type": "application/json", Prefer: "return=minimal" }, H), body: JSON.stringify(row) });
      if (!r2.ok && r2.status !== 409) throw new Error(`feedback ${r2.status} ${(await r2.text().catch(() => "")).slice(0, 160)}`); },
    // queued sends run one after another (a send started while another runs waits for it, then runs again so the new entry is included)
    flush(extra, prog) { if (extra && !Array.isArray(extra)) extra = [extra]; if (!UP.on()) return Promise.resolve({ fail: load().filter(e => !e.up).length, off: true });
      const run = async () => { const a = load(); let fail = 0; UP.err = ""; (extra || []).forEach(x => { const k = a.findIndex(e => e.id === x.id); if (k < 0) a.push(x); else if (!a[k].photo && x.photo) a[k].photo = x.photo; }); const todo = a.filter(e => !e.up && e.id); let done = 0;
        for (const e of todo) { done++; prog && prog(done, todo.length); try { await UP.one(e); e.up = true; e.photo = null; } catch (x) { fail++; UP.err = String(x.message || x); console.warn("feedback send", x); } }
        const cur = load(), by = new Map(a.map(e => [e.id, e])); const out = cur.map(e => { const d = by.get(e.id); return d && d.up ? Object.assign({}, e, { up: true, photo: null, photoPath: d.photoPath }) : d && d.photoPath ? Object.assign({}, e, { photoPath: d.photoPath }) : e; });
        try { localStorage.setItem(FK, JSON.stringify(out)); } catch (x) {} return { fail, err: UP.err }; };
      return UP.busy = (UP.busy || Promise.resolve()).catch(() => {}).then(run); }
  };
  g.addEventListener("online", () => UP.flush()); setTimeout(() => UP.flush(), 4000);
  const pad = n => String(n).padStart(2, "0"), tzLab = d => (new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(d).find(p => p.type === "timeZoneName") || {}).value || "";
  const isoOff = d => { const o = -d.getTimezoneOffset(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${o >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`; };
  function panel(o) {
    o = o && o.spot ? o : {}; const sp = (g.__agSpots || []).find(s => s.id === (o.spot || g.__agSpot));
    let el = document.getElementById("fb-panel"); if (!el) { el = document.createElement("aside"); el.id = "fb-panel"; document.body.appendChild(el); }
    el.innerHTML = `<button class="fb-x" aria-label="Close">✕</button><h3>Photo & feedback</h3>
      <label>Location<select id="fb-spot">${(g.__agSpots || []).map(s => `<option value="${s.id}"${sp && s.id === sp.id ? " selected" : ""}>${s.name}, ${s.state}</option>`).join("")}</select></label>
      <label class="fb-file">📷 Add photos (up to 6)<input id="fb-photo" type="file" accept="image/*" multiple></label><div id="fb-thumbs"></div>
      <label><span id="fb-dtl">Date &amp; time</span> <span id="fb-tz" class="fine"></span><span class="fb-dt"><input id="fb-date" type="date"> <input id="fb-time" type="time"></span><span id="fb-src" class="fine"></span></label>
      <label>How was it really? (0–100)<input id="fb-score" type="range" min="0" max="100" value="60"><output id="fb-o">60</output></label>
      <label>Forecast was<select id="fb-acc"><option>about right</option><option>too high</option><option>too low</option><option>wrong cloud type/placement</option></select></label>
      <label>Notes<textarea id="fb-note" rows="3" placeholder="e.g. cirrus lit up pink 10 min after sunset, water glassy"></textarea></label>
      <button id="fb-send" class="btn">Send feedback</button><p id="fb-msg" class="fine" role="status" aria-live="polite"></p>
      <p class="fine"><a href="#" id="fb-dl">Download my feedback backup</a></p>`;
    let img = null; const $ = s => el.querySelector(s), msg = t => { $("#fb-msg").textContent = t; };
    $(".fb-x").onclick = () => el.classList.remove("open"); $("#fb-score").oninput = e => $("#fb-o").textContent = e.target.value;
    // d25d: forecast cloud at the event (ev.s — ev.sky is a text summary, which is why low/mid/high were missing) and at the photo time from the spot's hourly forecast
    const predFor = (id, ev, t) => { if (!ev) return null; const st = g.__agState, k = (g.__agSpots || []).findIndex(s => s.id === id), S = st && st.data && st.data.S && st.data.S[k], M = g.Model, r1 = v => v == null ? null : Math.round(v);
      const cl = (h, tt) => h && M && M.at ? { total: r1(M.at(h, "cloud_cover", tt)), low: r1(M.at(h, "cloud_cover_low", tt)), mid: r1(M.at(h, "cloud_cover_mid", tt)), high: r1(M.at(h, "cloud_cover_high", tt)), precip: M.at(h, "precipitation", tt) } : null;
      const s = ev.s || {}, A = st && st.arch; return { past: !!A, pastDay: A ? A.key : undefined, score: ev.score, raw: ev.scoreRaw != null ? ev.scoreRaw : ev.score, tSet: ev.tSet,
        sky: { total: r1(s.total), low: r1(s.low), mid: r1(s.mid), high: r1(s.high), precip: s.precip ?? null }, atShot: t && S ? Object.assign({ t: Math.round(t) }, cl(S.hourly, t)) : null }; };
    const evFor = id => { const st = g.__agState, r = st && st.results && st.results.find(x => x.spot.id === id); return r && r.ev; };
    const setDT = (d, src) => { $("#fb-date").value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; $("#fb-time").value = `${pad(d.getHours())}:${pad(d.getMinutes())}`; $("#fb-tz").textContent = "(" + tzLab(d) + ")"; $("#fb-src").textContent = src; };
    let dtUser = false, dtExif = false; const dflt = () => { if (dtUser || dtExif) return; const ev = evFor($("#fb-spot").value); setDT(ev && ev.tSet ? new Date(ev.tSet * 1000) : new Date(), ev && ev.tSet ? "Set to this day's " + (g.AG_MODE === "sunrise" ? "sunrise" : "sunset") + " — change it if needed" : ""); };
    if (o.t > 1e9) { dtUser = true; setDT(new Date(o.t * 1000), "From the preview slider — change it if needed"); } else dflt(); $("#fb-spot").onchange = () => { dtUser = false; dflt(); }; $("#fb-date").oninput = $("#fb-time").oninput = () => { dtUser = true; $("#fb-src").textContent = ""; };
    // photo: EXIF capture time read from the original bytes (re-encoding strips EXIF) fills date & time; decoded via object URL, downscaled to 1280 px JPEG
    // d25e: up to 6 photos; each gets its own date & time (EXIF capture time, else the form's date & time), editable under its thumbnail.
    const MAXP = 6, P = []; const exifT = f => f.slice(0, 262144).arrayBuffer().then(b => { const m = /(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(new TextDecoder("latin1").decode(b)); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : null; }).catch(() => null);
    const shrink = f => new Promise((ok, no) => { const u = URL.createObjectURL(f), im = new Image();
      im.onload = () => { try { const c = document.createElement("canvas"), k = Math.min(1, 1280 / Math.max(im.naturalWidth, im.naturalHeight)); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL("image/jpeg", 0.72)); } catch (x) { URL.revokeObjectURL(u); no(x); } };
      im.onerror = () => { URL.revokeObjectURL(u); no(new Error("unreadable")); }; im.src = u; });
    const formD = () => { const d = new Date(`${$("#fb-date").value}T${$("#fb-time").value || "12:00"}`); return isNaN(d) ? new Date() : d; };
    const dStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, tStr = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const drawThumbs = () => { const box = $("#fb-thumbs"); box.innerHTML = P.map((p, k) => `<div class="fb-th" data-k="${k}"><img src="${p.img}" alt="Photo ${k + 1}"><button class="fb-rm" aria-label="Remove photo ${k + 1}">✕</button>
        <input type="date" class="fb-pd" value="${dStr(p.d)}"><input type="time" class="fb-pt" value="${tStr(p.d)}"><span class="fine">${p.src === "exif" ? "from photo" : "form time"}</span></div>`).join("");
      box.querySelectorAll(".fb-th").forEach(n => { const p = P[+n.dataset.k]; n.querySelector(".fb-rm").onclick = () => { P.splice(+n.dataset.k, 1); drawThumbs(); };
        const upd = () => { const d = new Date(`${n.querySelector(".fb-pd").value}T${n.querySelector(".fb-pt").value || "12:00"}`); if (!isNaN(d)) { p.d = d; p.src = "user"; } }; n.querySelector(".fb-pd").oninput = n.querySelector(".fb-pt").oninput = upd; });
      $("#fb-dtl").textContent = P.length ? "Date & time (for notes / photos without a time)" : "Date & time"; $("#fb-photo").parentElement.style.display = P.length >= MAXP ? "none" : ""; };
    $("#fb-photo").onchange = async e => { const fs = [...e.target.files]; e.target.value = ""; if (!fs.length) return; let bad = 0, over = Math.max(0, P.length + fs.length - MAXP);
      for (const [k, f] of fs.slice(0, MAXP - P.length).entries()) { msg(`Reading photo ${k + 1} of ${Math.min(fs.length, MAXP - P.length)}…`);
        try { const [img, d] = await Promise.all([shrink(f), exifT(f)]); P.push({ img, d: d || formD(), src: d ? "exif" : "form" }); drawThumbs(); } catch (x) { bad++; } }
      // d25j: photo taken on a different day than the one being viewed → offer to switch (past cards cover the last 7 days)
      { const st = g.__agState, cur = st && st.arch ? st.arch.key : dStr(new Date()), ex = P.find(p => p.src === "exif" && dStr(p.d) !== cur);
        if (ex) { const k = dStr(ex.d), can = (g.__agPastKeys ? g.__agPastKeys() : []).includes(k) || k === dStr(new Date()); setTimeout(() => { const m = $("#fb-msg"); if (!m) return;
          m.innerHTML = `This photo was taken ${ex.d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${can ? ` — <a href="#" id="fb-sw">switch to that day</a>?` : " (older than the last 7 days — its own date is kept)."}`;
          const a = $("#fb-sw"); if (a) a.onclick = async e => { e.preventDefault(); m.textContent = "Switching…"; try { if (k === dStr(new Date())) { const t = document.querySelector('.day[data-day="0"]'); t && t.click(); } else await g.__agGoPast(k); m.textContent = `Now showing ${k}. Your photos keep their own times.`; } catch (x) { m.textContent = "Couldn't load that day."; } }; }, 50); } }
      msg((bad ? `${bad} photo${bad > 1 ? "s" : ""} couldn't be read here (HEIC on a computer?) — try JPEG or pick on the iPhone. ` : "") + (over ? `Only ${MAXP} photos per send — ${over} left out.` : "")); };
    $("#fb-send").onclick = async () => { const btn = $("#fb-send"); if (btn.disabled) return; btn.disabled = true; btn.textContent = "Sending…"; msg("");
      try { const a = load(), id = $("#fb-spot").value, ev = evFor(id), st = g.__agState, uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));
        const grp = uid(), list = P.length ? P.map(p => ({ d: p.d, src: p.src, img: p.img })) : [{ d: formD(), src: dtUser ? "user" : "default", img: null }];
        const mine = list.map((p, k) => { const pr = predFor(id, ev, p.d.getTime() / 1000); const appTag = /afterglow-premium/.test(location.pathname) ? "premium" : /afterglow-preview/.test(location.pathname) ? "preview" : location.pathname.split("/")[1] || "local"; if (pr) { pr.group = grp; pr.gi = k; pr.gn = list.length; pr.app = appTag; }
          return { id: uid(), group: grp, up: false, ver: g.AG_BUILD || "", day: st ? st.day : null, pred: pr || { group: grp, gi: k, gn: list.length, app: appTag },
            at: new Date().toISOString(), shot: isoOff(p.d), shotSrc: p.src, mode: g.AG_MODE, spot: id, viewT: g.__agPvT || null, actual: +$("#fb-score").value, acc: $("#fb-acc").value, note: $("#fb-note").value, photo: p.img }; });
        a.push(...mine); let mem = [];
        try { localStorage.setItem(FK, JSON.stringify(a)); } catch (e) { mem = mine; a.splice(a.length - mine.length); try { localStorage.setItem(FK, JSON.stringify(a.concat(mine.map(m => Object.assign({}, m, { photo: null }))))); } catch (e2) {} }
        const n = await UP.flush(mem, (k, t) => { btn.textContent = t > 1 ? `Sending ${k} of ${t}…` : "Sending…"; });
        if (!n.fail) { msg(mine.length > 1 ? `Sent ✓ ${mine.length} photos — thanks!` : "Sent ✓ thanks!"); P.length = 0; drawThumbs(); $("#fb-note").value = ""; dtUser = dtExif = false; dflt(); }
        else msg(navigator.onLine === false ? "Saved on phone — will send when you're online." : `Saved on phone, will send automatically. (${!n.err || /fetch|Load failed|NetworkError|network/i.test(n.err) ? "no connection right now" : "Send failed: " + n.err})`);
      } catch (x) { msg("Something went wrong: " + (x.message || x)); console.warn(x); }
      btn.disabled = false; btn.textContent = "Send feedback"; };
    $("#fb-dl").onclick = ev => { ev.preventDefault(); const b = new Blob([JSON.stringify(load(), null, 1)], { type: "application/json" }), u = URL.createObjectURL(b), l = document.createElement("a"); l.href = u; l.download = "afterglow-feedback.json"; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
    el.classList.add("open");
  }
  X.panel = panel;
  // d25g: recent photo colour score per spot from the public metrics-only history (no Supabase reads). Fetched once, cached.
  let HP = null; X.colorScore = id => (HP = HP || fetch("https://afterglowpremium.github.io/afterglow-preview/data/feedback-history.json?_=" + Math.floor(Date.now() / 3600000)).then(r => r.ok ? r.json() : []).catch(() => []))
    .then(h => { const cut = Date.now() - 30 * 864e5, G = {};
      (h || []).forEach(r => { const c = r.photo && r.photo.colorScore; if (r.spot !== id || r.test || r.spot === "test" || typeof c !== "number" || !(Date.parse(r.at || r.saved) > cut)) return; (G[r.group || r.id] = G[r.group || r.id] || []).push(c); });
      const v = Object.values(G).map(a => a.reduce((x, y) => x + y, 0) / a.length); return v.length ? { avg: Math.round(v.reduce((x, y) => x + y, 0) / v.length), n: v.length } : null; });
})(window);
