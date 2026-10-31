(function () {
  const rainQ = {};   // d23y: radar-at-spot answers keyed spot:5-min slot
  // Mode: ?mode=sunrise | ?mode=sunset. No mode → the "Welcome to Afterglow" homepage (index.html) handles the choice.
  const MODE = new URLSearchParams(location.search).get("mode");
  if (MODE !== "sunrise" && MODE !== "sunset") return;
  const RISE = MODE === "sunrise";
  window.AG_MODE = MODE;
  document.body.classList.add("mode-" + MODE);
  const EV = RISE ? "sunrise" : "sunset", Ev = RISE ? "Sunrise" : "Sunset", DIRW = RISE ? "East" : "West", dirw = RISE ? "east" : "west";
  const { evaluate, label, likely, offset, sunPos } = window.Model;
  // Same spots in both modes; sunrise swaps in each spot's EAST-facing view (arc / obstruction / water / note).
  // Geography-matched views (spots.js SCENE): what is really on the horizon in the direction you face, plus what is
  // behind you (for the 180° Turn). Sunrise may use a nearby east-facing vantage (e.g. Avon Pier vs. the soundside harbor).
  const SPOTS = window.SPOTS.map(sp0 => { const sp = sp0, G1 = ((window.GEO180 || {})[sp0.id] || {})[RISE ? "rise" : "set"], fixB = o => { if (G1 && G1.behind && !(window.Ground && Ground.GEO[sp0.id])) o.behind = Object.assign({}, o.behind, { water: !!G1.behind.water, type: G1.behind.water ? o.behind.type : (G1.behind.town > .4 ? "Town" : G1.behind.near === 1 ? "Dunes" : "Woods") }); return o; }; return fixB((() => {
    const v = (window.SUNRISE_VIEW || {})[sp.id] || [60, 150, 2, false, ""], sc = (window.SCENE || {})[sp.id] || ["lowshore", sp.type, "lowshore"], at = sc[3];
    const coastal = x => /Beach|Pier|Boardwalk|Dunes/.test(x);
    if (RISE) {
      // behind you at sunrise = west: the sunset view from the same spot, or the island/town behind a relocated beach vantage
      const behind = at ? (coastal(sc[1]) ? { type: "Dunes", far: "town", water: false } : { type: "Town", far: "trees", water: false }) : { type: sp.type, far: sc[0], water: sp.water };
      return Object.assign({}, sp, { arc: [v[0], v[1]], obst: v[2], water: v[3], note: v[4] || sp.note, setNote: sp.note, type: sc[1], far: sc[2], behind,
        vantage: at ? { name: at[0], lat: at[1], lng: at[2] } : null });
    }
    // behind you at sunset = east: the sunrise view from this same spot (land/town when the sunrise vantage is elsewhere)
    const behind = at ? { type: "Town", far: "trees", water: false } : { type: sc[1], far: sc[2], water: v[3] };
    return Object.assign({}, sp, { far: sc[0], behind, vantage: null });
  })()); });
  // v21: desktop (wide screen + mouse) — docked detail panel, higher render quality, wheel zoom, keyboard shortcuts. Phones unchanged.
  const DESK_Q = window.matchMedia ? matchMedia("(min-width:1024px) and (pointer:fine), (min-width:1024px) and (pointer:none)") : { matches: false };
  const isDesk = () => !!DESK_Q.matches;
  const deskTop = () => { const t = document.querySelector(".top"); document.documentElement.style.setProperty("--ag-dtop", (t ? Math.round(t.getBoundingClientRect().bottom + Math.max(0, window.scrollY)) : 0) + "px"); };
  const syncDesk = () => { document.documentElement.classList.toggle("ag-desk", isDesk()); deskTop(); };
  syncDesk(); if (DESK_Q.addEventListener) DESK_Q.addEventListener("change", syncDesk); addEventListener("resize", deskTop);
  const vPos = sp => sp.vantage ? [sp.vantage.lat, sp.vantage.lng] : [sp.lat, sp.lng];
  const PLAY = "▶ Play";   // d21L: compact label for the right-hand control rail
  // phase names from the canvas preview are sunset-worded; mirror them for mornings
  const phaseName = p => !RISE ? p : ({ "Sunset": "Sunrise", "Afterglow": "First color", "Blue hour": "Blue hour (dawn)" }[p] || p);
  const REGIONS = {
    all: { name: "All coast", states: null },
    ne: { name: "New England", states: ["ME", "NH", "MA", "RI", "NY"] },
    ma: { name: "Mid-Atlantic", states: ["NJ", "DE", "MD", "VA"] },
    se: { name: "Carolinas & GA", states: ["NC", "SC", "GA"] },
    fl: { name: "Florida", states: ["FL"] },
  };
  const state = window.__agState = { day: 0, region: "all", spot: null, data: null, results: [], userLoc: null, overlay: "none" };
  const $ = s => document.querySelector(s);
  const dayIs = i => !state.arch && state.day === i;
  const API = "https://api.open-meteo.com/v1/forecast";
  const SPOT_VARS = "cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,dew_point_2m,temperature_2m,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability,weather_code,cape,pressure_msl,relative_humidity_850hPa,relative_humidity_500hPa,relative_humidity_300hPa";
  const SPOT_VARS_LITE = "cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,visibility,wind_speed_10m,wind_direction_10m,precipitation,weather_code";   // d22f fallback
  const WEST_VARS = "cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation";
  const EAST_VARS = "precipitation,precipitation_probability,weather_code,cloud_cover_low,cloud_cover_mid";

  // Sample points ~80 km toward the sunset (sun's path through the horizon) and ~25 km opposite (rainbow side)
  const nowT = Date.now() / 1000;
  SPOTS.forEach(sp => {
    // azimuth at approx local sunset today: search for elevation crossing
    let t = Math.floor(nowT / 86400) * 86400 + (RISE ? 5 : 12) * 3600, az = RISE ? 90 : 270;
    for (let k = 0; k < 160; k++) { const p = sunPos(t + k * 300, sp.lat, sp.lng); if (RISE ? (p.elev > 0 && k > 0) : (p.elev < 0 && k > 0)) { az = p.az; break; } }
    sp.az = az; sp.west = offset(sp.lat, sp.lng, az, 80); sp.path = [40, 120, 200].map(km => offset(sp.lat, sp.lng, az, km)); sp.far = offset(sp.lat, sp.lng, az, 350);   // d28: cirrus grazing point (optional, model treats as missing if absent)
    sp.east = offset(sp.lat, sp.lng, (az + 180) % 360, 12); sp.eastPts = [10, 30].map(km => offset(sp.lat, sp.lng, (az + 180) % 360, km));   // d23r: rain opposite the sun 5–40 km (rainbows)
  });

  // Open-Meteo free tier: 600 weighted calls/min, 5000/hour per IP. One mode load is ~300 weighted calls
  // (55 spots + 165 path points + AQ), so we share spot data across modes, cache longer, back off on errors,
  // and never dead-end: stale cache -> best-match -> baked NOAA snapshot shipped with the site.
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  // d23r: two anti-solar points per spot (10 + 30 km) merged into one series: rain/showers anywhere 5–40 km opposite the sun count
  // (Virginia Beach Oct 17: ocean showers east at sunset, the single 12 km point was dry → no rainbow flag). Keeps E length = spots.
  function mergeE(A) {
    if (!A || A.length !== SPOTS.length * 2) return A;
    return SPOTS.map((_, i) => { const a = A[2 * i], b = A[2 * i + 1], h = JSON.parse(JSON.stringify(a.hourly)), hb = b.hourly;
      for (const k of Object.keys(h)) { if (k === "time" || !hb[k]) continue; h[k] = h[k].map((v, j) => { const w = hb[k][j]; if (v == null) return w; if (w == null) return v;
        return k === "weather_code" ? ((w >= 80 && w <= 82) || w >= 95 ? Math.max(v, w) : Math.max(v, w) === w && !((v >= 80 && v <= 82) || v >= 95) ? w : v) : /cloud/.test(k) ? (v + w) / 2 : Math.max(v, w); }); }
      return Object.assign({}, a, { hourly: h, merged: 2 }); });
  }
  async function fetchBatch(points, hourly, daily, base = API, models, tries = 3, extra) {
    const p = new URLSearchParams({
      latitude: points.map(x => x.lat).join(","), longitude: points.map(x => x.lng).join(","),
      hourly, timezone: "auto", timeformat: "unixtime", forecast_days: "7",
      temperature_unit: "fahrenheit", wind_speed_unit: "mph", precipitation_unit: "mm",
    });
    if (daily) p.set("daily", daily);
    if (models) p.set("models", models);
    if (extra) for (const k in extra) p.set(k, extra[k]);
    if (extra && extra.start_date) p.delete("forecast_days");
    if (base !== API) ["temperature_unit", "wind_speed_unit", "precipitation_unit"].forEach(k => p.delete(k));
    let last = null, rl = 0;
    for (let attempt = 0; attempt < tries; attempt++) {
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 45000);   // d22f: 30 s -> 45 s (88-spot batch is ~1.4 MB; slow cellular)
        try {
          const r = await fetch(`${base}?${p}`, { signal: ctl.signal });
          if (r.ok) { const j = await r.json(); return Array.isArray(j) ? j : [j]; }
          last = new Error("Open-Meteo HTTP " + r.status); last.status = r.status;
          if (r.status === 400) break;                     // bad variable/model: caller falls back to fewer variables
          if (r.status === 429 && ++rl > 1) break;         // rate-limited: one slow retry only (minute window), then give up
        } finally { clearTimeout(to); }
      } catch (e) { last = e; }                            // network / CORS-less 429 / timeout
      if (attempt < tries - 1) await sleep((last && last.status === 429 ? 8000 : 1500 * 2 ** attempt) + Math.random() * 600);   // exp backoff + jitter
    }
    throw last || new Error("Open-Meteo request failed");
  }
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  // d22f: base + sunset + sunrise + marine caches are ~5 M chars together (over Safari's quota once the Sunrise|Sunset toggle is used).
  // The old quota handler wiped EVERY afterglow-v* key, so each toggle threw away the shared base and forced a cold live load.
  // Now evict in order: other versions -> other mode -> marine -> everything but base; keep the key being written.
  const lsSet = (k, v) => { const s = JSON.stringify(v), put = () => { localStorage.setItem(k, s); return true; };
    try { return put(); } catch (e) {}
    const other = RISE ? "sunset" : "sunrise", keys = () => Object.keys(localStorage).filter(x => x.startsWith("afterglow-v") && x !== k);
    for (const drop of [x => !x.startsWith("afterglow-v15-"), x => x.endsWith("-" + other), x => x.includes("-marine-"), x => x !== "afterglow-v15-base", () => true]) {
      try { keys().filter(drop).forEach(x => localStorage.removeItem(x)); return put(); } catch (e) {}
    }
    return false; };
  const FRESH_AUTO = 28 * 60 * 1000;   // d24: auto-refresh refetches the model every other 15-min cycle (HRRR/Open-Meteo update hourly; 86 spots x 6 points per fetch must stay inside Open-Meteo's free per-hour quota)
  const FRESH = 45 * 60 * 1000, STALE_OK = 12 * 3600 * 1000;

  async function loadData(force) {
    if (/[?&]demo=offline/.test(location.search)) throw new Error("demo offline");
    // Cache is keyed to the exact spot list: adding/reordering spots must never reuse old index-aligned arrays.
    const sig = SPOTS.map(s => s.id).join("|"), n = SPOTS.length;
    const BK = "afterglow-v15-base", DK = "afterglow-v15-" + MODE;
    Object.keys(localStorage).filter(k => k.startsWith("afterglow-v") && !k.startsWith("afterglow-v15-")).forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    const okB = c => c && c.sig === sig && c.S && c.S.length === n;
    const okD = c => c && c.sig === sig && c.W && c.W.length === n * 3 && c.E && c.E.length === n;
    let B = lsGet(BK), D = lsGet(DK);
    const fresh = c => c && Date.now() - c.at < (force ? FRESH_AUTO : FRESH);
    const join = (b, dd, extra) => Object.assign({ at: Math.min(b.at, dd.at), sig, S: b.S, AQ: b.AQ, fcModel: b.fcModel, W: dd.W, E: dd.E, WF: dd.WF }, extra || {});
    if (okB(B) && okD(D) && fresh(B) && fresh(D)) return join(B, D);
    // Primary: NOAA HRRR (0–48 h, 3 km) blended into NOAA GFS (days 3–7) — Open-Meteo "gfs_seamless" mirror of NOAA NOMADS output.
    const getB = async (models, lite) => {
      const S = await fetchBatch(SPOTS, lite ? SPOT_VARS_LITE : SPOT_VARS, "sunset,sunrise", API, models, lite ? 2 : 3);
      let AQ = null; try { AQ = await fetchBatch(SPOTS, "aerosol_optical_depth,pm2_5,dust", null, "https://air-quality-api.open-meteo.com/v1/air-quality", null, 1); } catch (e) { console.warn("AQ unavailable", e); }
      return { at: Date.now(), sig, S, AQ, fcModel: models ? "noaa" : "fallback", lite: !!lite };
    };
    const getD = async models => { const [W, E, WF] = await Promise.all([fetchBatch(SPOTS.flatMap(s => s.path), WEST_VARS, null, API, models), fetchBatch(SPOTS.flatMap(s => s.eastPts), EAST_VARS, null, API, models).then(mergeE), fetchBatch(SPOTS.map(s => s.far), "cloud_cover_low,cloud_cover_mid,cloud_cover_high", null, API, models, 1).catch(() => null)]); return { at: Date.now(), sig, W, E, WF }; };
    const tryLive = async (models, lite) => {
      const [b, dd] = await Promise.all([okB(B) && fresh(B) ? B : getB(models, lite), okD(D) && fresh(D) ? D : getD(models)]);
      if (b !== B && !b.lite) lsSet(BK, b); if (dd !== D) lsSet(DK, dd);   // never cache the lite set over a full one
      return join(b, dd, b.lite ? { lite: true } : null);
    };
    // d25y: never show a forecast whose first day isn't today (a 7-day-old baked snapshot was shown as "Today Oct 17")
    const cur = c => { try { const S0 = c.S[0]; return ymd(S0.daily.time[0] + 43200, S0.timezone) === ymd(Date.now() / 1000, S0.timezone); } catch (e) { return false; } };
    // d25z: server prefetch FIRST (preview Pages, refreshed every 20 min by the prefetch workflow; CDN-cached, costs no Open-Meteo quota).
    // One app load is ~600 weighted Open-Meteo calls (88 spots × 19 vars + 264 path + 176 east points), i.e. the whole free per-minute
    // quota of the user's IP — that is why phones saw 429 / "Forecast unavailable".
    const PF = "https://afterglowpremium.github.io/afterglow-preview/data/", pre = async maxAge => { try {
        const v = Math.floor(Date.now() / 120000), ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000);
        const [sb, sd] = await Promise.all(["base", MODE].map(x => fetch(`${PF}snap-${x}.json?_=${v}`, { signal: ctl.signal }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }))); clearTimeout(to);
        if (okB(sb) && okD(sd) && cur(sb) && Date.now() - Math.min(sb.at, sd.at) < maxAge) return join(sb, sd, { prefetch: true }); } catch (e) { console.warn("prefetch unavailable", e); } return null; };
    const PREFETCH_RUN = /[?&]prefetch=1/.test(location.search);
    if (!PREFETCH_RUN) { const lsAge = okB(B) && okD(D) && cur(B) ? Date.now() - Math.min(B.at, D.at) : Infinity, P0 = lsAge < 20 * 60e3 ? null : await pre(3 * 3600e3);
      if (P0 && Date.now() - P0.at < lsAge) { lsSet(BK, Object.assign({}, P0, { W: undefined, E: undefined, prefetch: undefined })); lsSet(DK, { at: P0.at, sig, W: P0.W, E: P0.E });
        if (Date.now() - P0.at > 40 * 60e3 && !force) { P0.bg = tryLive("gfs_seamless"); P0.bg.catch(() => {}); } return P0; } }
    // d25y: instant start — a same-day cache (< 12 h) renders at once; the live NOAA fetch refreshes it in the background (d.bg)
    if (!force && okB(B) && okD(D) && cur(B) && Date.now() - Math.min(B.at, D.at) < STALE_OK) { const d = join(B, D, { stale: true }); d.bg = tryLive("gfs_seamless").catch(() => tryLive(null)); d.bg.catch(() => {}); return d; }
    let err;
    // Live budget: if Open-Meteo hasn't answered in 10 s, show cached/snapshot data now; the live fetch keeps going and refreshes the cache.
    const live = tryLive("gfs_seamless");
    try { return await Promise.race([live, sleep(10000).then(() => { const e = new Error("Open-Meteo too slow"); e.slow = true; throw e; })]); }
    catch (e) { err = e; console.warn("NOAA HRRR/GFS mirror failed/slow", e); live.catch(() => {}); }
    // 1) recent cache (even if past the 45-min refresh window)
    if (okB(B) && okD(D) && cur(B) && Date.now() - Math.min(B.at, D.at) < STALE_OK) return join(B, D, { stale: true });
    // 2) NOAA snapshot baked into the site (d22f: tried before more live calls — instant, and costs no quota)
    let snap = null;
    try {
      const v = Math.floor(Date.now() / 600000);
      const [sb, sd] = await Promise.all(["base", MODE].map(x => fetch(`data/snap-${x}.json?_=${v}`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })));
      if (okB(sb) && okD(sd)) snap = join(sb, sd, { snapshot: true }); else console.warn("snapshot does not match spot list");
    } catch (e) { console.warn("snapshot unavailable", e); }
    if (snap && cur(snap) && Date.now() - snap.at < STALE_OK) return snap;
    // 3) d22f: slow is not failed — keep waiting for the live NOAA fetch (it has its own 45 s timeout + retries) instead of dead-ending
    if (err && err.slow) { try { return await Promise.race([live, sleep(40000).then(() => { throw Object.assign(new Error("Open-Meteo no answer in 50 s"), { slow: true }); })]); } catch (e) { err = e; console.warn("NOAA HRRR/GFS mirror failed", e); } }
    // 4) Open-Meteo best-match (skip if rate-limited — it hits the same quota)
    if (err.status !== 429) { try { return await tryLive(null); } catch (e) { console.warn("best-match fallback failed", e); if (e.status) err = e; } }
    // 5) d22f: fewer variables (10 per point = half the weighted quota; drops cape/pressure/upper-level RH) after a pause
    try { await sleep(err.status === 429 ? 6000 : 1000); return await tryLive(null, true); } catch (e) { console.warn("lite fallback failed", e); }
    // 6) an older snapshot, then any cache at all
    if (snap && cur(snap)) return snap;
    // d25z: before giving up — a slightly older server prefetch (still today), then live retries with backoff (lite set = half the quota)
    if (!PREFETCH_RUN) { const P1 = await pre(8 * 3600e3); if (P1) return P1; }
    for (const ms of [2000, 5000, 10000]) { await sleep(ms); try { return await tryLive(null, true); } catch (e) { console.warn("retry", ms, e); } }
    if (okB(B) && okD(D) && cur(B)) return join(B, D, { stale: true });
    throw err;
  }


  // ---------- Marine (wave height) for the water surface animation ----------
  // Open-Meteo Marine (ECMWF WAM / NOAA GFS-Wave blend), sampled ~6 km out toward the sun so it's the water you're looking at.
  // Optional: if it fails/slow, the water is driven by the wind & gusts alone.
  async function loadMarine() {
    const sig = SPOTS.map(s => s.id).join("|"), K = "afterglow-v15-marine-" + MODE, c = lsGet(K);
    if (c && c.sig === sig && Date.now() - c.at < 3 * 3600 * 1000 && c.M && c.M.length === SPOTS.length) return c.M;
    try {
      const pts = SPOTS.map(sp => offset(sp.lat, sp.lng, sp.az, 6));
      const M = await Promise.race([fetchBatch(pts, "wave_height", null, "https://marine-api.open-meteo.com/v1/marine", null, 1), sleep(8000).then(() => null)]);
      if (M && M.length === SPOTS.length) { lsSet(K, { at: Date.now(), sig, M }); return M; }
    } catch (e) { console.warn("marine waves unavailable", e); }
    return c && c.sig === sig && c.M ? c.M : null;
  }
  function applyMarine(d, M) {
    if (!M) return;
    SPOTS.forEach((sp, i) => { const h = d.S[i] && d.S[i].hourly, m = M[i] && M[i].hourly; if (!h || !m || !m.wave_height) return;
      const by = new Map(m.time.map((t, k) => [t, m.wave_height[k]]));
      h.wave_m = h.time.map(t => { const v = by.get(t); return v == null ? null : v; });
      if (!h.wave_m.some(v => v != null)) delete h.wave_m; });
  }

  // ---------- NOAA direct data (written by noaa/fetch_noaa.py on the host) ----------
  async function loadNoaa() {
    try { const r = await fetch("data/noaa.json?_=" + Math.floor(Date.now() / 60000), { cache: "no-store" }); if (!r.ok) throw new Error(r.status); const j = await r.json(); if (!j.generated_utc || Date.now() - Date.parse(j.generated_utc) > 6 * 3600e3) { console.warn("NOAA direct feed stale", j.generated_utc); return null; } return j; }
    catch (e) { console.warn("NOAA direct feed unavailable", e); return null; }
  }
  // Overwrite model hours with HRRR values pulled straight from NOAA's HRRR grib2 (AWS Open Data); GOES-19 AOD for tonight.
  function applyNoaa(d, N) {
    d.prov = {};
    if (!N) return;
    const hrs = N.hrrr && N.hrrr.hours || {};
    const setH = (h, k, t, v) => { if (v == null || !h[k]) return false; const i = h.time.indexOf(+t); if (i < 0) return false; h[k][i] = v; return true; };
    SPOTS.forEach((sp, i) => {
      const P = d.prov[sp.id] = { hrrrHours: [] };
      for (const [t, pts] of Object.entries(hrs)) {
        const x = pts[sp.id]; if (!x) continue;
        const h = d.S[i].hourly; let ok = false;
        ok = setH(h, "cloud_cover_low", t, x.low) | setH(h, "cloud_cover_mid", t, x.mid) | setH(h, "cloud_cover_high", t, x.high) | setH(h, "cloud_cover", t, x.total);
        setH(h, "visibility", t, x.vis_m); setH(h, "relative_humidity_2m", t, x.rh2m); setH(h, "precipitation", t, x.prate_mmh);
        if (!RISE) [40, 120, 200].forEach((km, k) => { const y = pts[`${sp.id}@${km}`], w = d.W[i * 3 + k] && d.W[i * 3 + k].hourly; if (y && w) { setH(w, "cloud_cover_low", t, y.low); setH(w, "cloud_cover_mid", t, y.mid); setH(w, "cloud_cover_high", t, y.high); setH(w, "precipitation", t, y.prate_mmh); } });
        if (ok) P.hrrrHours.push(+t);
      }
      // GOES-19 ABI AOD (observed today) → tonight's haze input
      let g = N.goes && N.goes.points && N.goes.points[sp.id], aodWhere = "at the spot";
      if (g && (g.aod == null || (g.aod_n || 0) < 5)) {   // cloud over the spot: use nearest clear-pixel retrievals along the sunset line
        const alt = RISE ? [] : [40, 120, 200].map(km => [km, N.goes.points[`${sp.id}@${km}`]]).filter(([, x]) => x && x.aod != null && x.aod_n >= 5);
        if (alt.length) { g = { aod: alt[0][1].aod, aod_n: alt[0][1].aod_n }; aodWhere = `${alt[0][0]} km toward ${EV} (spot cloud-covered)`; } else g = null;
      }
      if (g && g.aod != null && (g.aod_n || 0) >= 5) {
        if (!d.AQ) d.AQ = [];
        if (!d.AQ[i]) d.AQ[i] = { hourly: { time: d.S[i].hourly.time.slice(), aerosol_optical_depth: d.S[i].hourly.time.map(() => null), pm2_5: d.S[i].hourly.time.map(() => null), dust: d.S[i].hourly.time.map(() => null) } };
        const ah = d.AQ[i].hourly, t0 = d.S[i].daily[EV][0];
        ah.time.forEach((t, k) => { if (Math.abs(t - t0) <= 3 * 3600) ah.aerosol_optical_depth[k] = g.aod; });
        P.goesAod = { v: g.aod, t0, where: aodWhere };
      }
    });
  }
  // Where each number for this spot/day came from
  function provenance(r) {
    const P = (state.data.prov || {})[r.spot.id] || {}, N = state.noaa, tSet = r.ev.tSet;
    const direct = (P.hrrrHours || []).some(t => Math.abs(t - tSet) < 3600);
    const fb = state.data.fcModel === "fallback";
    const cyc = N && N.hrrr ? new Date(N.hrrr.cycle_utc).toISOString().slice(11, 13) + "Z" : "";
    const clouds = fb ? { k: "fb", t: "Open-Meteo best-match (fallback, not NOAA)" } : direct ? { k: "model", t: `NOAA HRRR ${cyc} run — direct grib2 (AWS)` } : (!state.arch && state.day <= 1) ? { k: "model", t: "NOAA HRRR via Open-Meteo mirror" } : { k: "model", t: "NOAA GFS via Open-Meteo mirror" };
    const aod = P.goesAod && dayIs(0) ? { k: "obs", t: `NOAA GOES-19 ABI AOD ${P.goesAod.where} (observed ${fmtClock(N.goes.products.AOD.scan_utc)})` } : r.ev.s.aod != null ? { k: "fb", t: "CAMS forecast (fallback, not NOAA)" } : { k: "est", t: "not available — visibility/RH used instead" };
    return { clouds, path: clouds, vis: clouds, rh: clouds, aod, pm: r.ev.s.pm25 != null ? { k: "fb", t: "CAMS forecast (fallback, not NOAA)" } : { k: "est", t: "n/a" },
      sun: { k: "calc", t: "NOAA solar position algorithm (astronomical)" }, types: dayIs(0) && N && N.goes ? { k: "obs", t: "NOAA GOES-19 cloud phase + top height (observed now) + HRRR" } : { k: "est", t: "Estimated from HRRR/GFS layer cover" },
      front: { k: "est", t: "Estimate from NOAA model dew-point/pressure series" } };
  }
  const fmtClock = iso => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
  const tag = p => p ? `<span class="src ${p.k === "demo" ? "fb" : p.k}" title="${p.t}">${{ obs: "NOAA obs", model: "NOAA model", calc: "Astronomical", est: "Estimate", fb: "Fallback", demo: "Demo sky" }[p.k]}</span>` : "";
  // d19: ?sky= / ?wx= demo skies — the same layer values the renderer is forced to (app.js wOpt / photostage DEMO), in %, so the cards and caption match the picture
  function demoSky() {
    const q = new URLSearchParams(location.search), sk = q.get("sky"), wx = q.get("wx");
    const SK = { clear: { high: 12, mid: 0, low: 0, block: 0 }, overcast: { high: 40, mid: 95, low: 85, block: 1 }, partly: { high: 35, mid: 30, low: 20, block: 0.15 }, broken: { high: 30, mid: 75, low: 45, block: 0.12 } };
    const WX = { haze: { high: 25, mid: 15, low: 10, block: 0.3 }, partly: { high: 35, mid: 30, low: 20, block: 0.15 }, fog: { low: 50, block: 0.6 }, rain: { high: 50, mid: 90, low: 95, block: 1 }, storm: { high: 70, mid: 90, low: 90, block: 0.85 } };
    if (!SK[sk] && !WX[wx]) return null;
    const o = Object.assign({ high: 12, mid: 0, low: 0, block: 0 }, SK[sk] || {}, WX[wx] || {});
    o.gray = sk === "overcast" || wx === "rain" || wx === "storm" ? 1 : 0;
    o.types = { high: o.high >= 5 ? (o.high > 75 ? "Cirrostratus" : "Cirrus") : "", mid: o.mid >= 5 ? (o.mid < 50 ? "Altocumulus" : "Altostratus") : "", low: o.low >= 5 ? (wx === "fog" ? "Fog / mist" : o.low < 50 ? "Cumulus / stratocumulus" : "Stratus / stratocumulus") : "" };
    return o;
  }
  // Cloud genus from NOAA observations (tonight): GOES-19 phase + cloud-top height, HRRR cloud base
  function noaaCloudTypes(r) {
    const N = state.noaa; if (state.day !== 0 || !N || !N.goes) return null;
    const g = N.goes.points[r.spot.id] || {}, s = r.ev.s, out = [];
    const ph = g.phase || {}, ice = ph.ice || 0, liq = (ph.liquid || 0) + (ph.supercooled || 0);
    if (s.high >= 5) out.push({ level: "High", type: g.cth_km_med >= 6 && ice > 0.5 ? (s.high > 75 ? "Cirrostratus (GOES: ice, tops " + g.cth_km_med.toFixed(1) + " km)" : "Cirrus (GOES: ice, tops " + g.cth_km_med.toFixed(1) + " km)") : (s.high > 75 ? "Cirrostratus" : "Cirrus") + " (not seen by GOES now)", cover: s.high });
    if (s.mid >= 5) out.push({ level: "Mid", type: (s.mid < 50 ? "Altocumulus" : "Altostratus") + ((g.obs_mid || 0) > 0.2 ? ` (GOES: ${(ph.mixed || 0) + (ph.supercooled || 0) > 0.3 ? "mixed/supercooled" : "mid"} tops)` : ""), cover: s.mid });
    if (s.low >= 5 || g.low_stratus_fog) out.push({ level: "Low", type: g.low_stratus_fog ? "Stratus / fog (GOES: liquid tops < 2 km)" : r.ev.clouds.find(c => c.level.startsWith("Low"))?.type || "Stratocumulus", cover: s.low });
    return out.length ? out : null;
  }
  const fmtTime = (t, tz) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short" }).format(new Date(t * 1000));
  const fmtDay = (t, tz, i) => state.arch && ymd(t, tz) === ymd(Date.now() / 1000 - 86400, "America/New_York") ? "Yesterday" : state.arch ? new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date(t * 1000)) : i === 0 ? (RISE ? "Today" : "Tonight") : i === 1 ? "Tomorrow" : new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date(t * 1000));
  const fmtDate = (t, tz) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(new Date(t * 1000));
  const heroWind = wl => !wl || wl.kt < 5 || /^(offshore|strong offshore|glassy)/.test(wl.look);   // v16: barrel only when offshore or calm
  const compass = d => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(d / 22.5) % 16];
  const confidence = i => state.arch ? { t: "Past prediction · model replay", c: "md" } : i === 0 ? { t: "Higher confidence", c: "hi" } : i <= 2 ? { t: "Moderate confidence", c: "md" } : { t: "Low confidence (day " + (i + 1) + ")", c: "lo" };
  const dist = (a, b) => { const R = 3958.8, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

  // ---------- Bonus: rainbows & sun dogs ----------
  const BONUS_MIN = 10;   // below this the odds are "near zero" → greyed / hidden
  const bonusCls = p => p >= 40 ? "hi" : p >= 22 ? "md" : p >= BONUS_MIN ? "lo" : "no";
  const bonusWord = p => p >= BONUS_MIN ? likely(p) : "Near zero";
  const durTxt = m => m >= 60 ? (m / 60).toFixed(m % 60 ? 1 : 0).replace(/\.0$/, "") + " h" : m + " min";
  const hm = (t, tz) => fmtTime(t, tz).replace(/ [A-Z]{2,4}$/, "");
  function bonusCard(b, r, opts = {}) {
    const c = bonusCls(b.p), when = b.p >= BONUS_MIN && b.t ? fmtTime(b.t, r.tz) : null;
    return `<div class="bcard ${b.id} ${c}${b.red ? " red" : ""}"${opts.spot ? ` data-id="${r.spot.id}"` : ""}>
      <div class="bc-ic">${b.icon}</div>
      <div class="bc-main"><div class="bc-k">${opts.kicker || "Bonus"}</div><div class="bc-n">${b.name}${opts.spot ? ` <small>· ${r.spot.name}, ${r.spot.state}</small>` : ""}</div>
      <div class="bc-why">${opts.short ? (b.p >= BONUS_MIN ? (b.win ? `Starts ${hm(b.win.start, r.tz)} · lasts ~${durTxt(b.win.min)} · look ${b.look.split(",")[0]}` : `Look ${b.look}${when ? " ~" + when : ""}`) : (b.id === "bow" ? `Too little rain opposite the sun — rainbow odds near zero everywhere` : "Not enough thin ice cloud near a low sun — sun-dog odds near zero everywhere")) : b.why + (when ? ` <em>Best ~${when}</em>` : "")}</div></div>
      ${!opts.short && b.win && b.p >= BONUS_MIN ? `<div class="bc-win"><div><span>Starts</span><b>${hm(b.win.start, r.tz)}</b></div><div><span>Lasts</span><b>~${durTxt(b.win.min)}</b></div><div><span>Ends</span><b>${hm(b.win.end, r.tz)}</b></div><div><span>Look</span><b>${b.look.split(",")[0]}</b></div></div>` : ""}
      <div class="bc-p"><b>${b.p}%</b><span>${bonusWord(b.p)}</span></div>
      <div class="bc-bar"><i style="width:${Math.max(2, b.p)}%"></i></div></div>`;
  }
  function renderBonus(list) {
    const box = $("#bonus"); if (!box) return;
    const best = id => list.slice().sort((a, b) => b.ev.bonus[id].p - a.ev.bonus[id].p)[0];
    const bw = best("bow"), dg = best("dog"); if (!bw) { box.innerHTML = ""; return; }
    const nb = list.filter(r => r.ev.bonus.bow.p >= BONUS_MIN).length, nd = list.filter(r => r.ev.bonus.dog.p >= BONUS_MIN).length;
    box.innerHTML = `<div class="bonus-h">✨ Special bonus · ${dayIs(0) ? (RISE ? "this morning" : "tonight") : dayIs(1) ? (RISE ? "tomorrow morning" : "tomorrow night") : fmtDay(list[0].ev.tSet, list[0].tz, state.day)}<small>${nb} spot${nb === 1 ? "" : "s"} with rainbow odds · ${nd} with sun dogs</small></div>
      ${bonusCard(bw.ev.bonus.bow, bw, { spot: true, short: true, kicker: "Best rainbow odds" })}
      ${bonusCard(dg.ev.bonus.dog, dg, { spot: true, short: true, kicker: "Best sun-dog odds" })}
      ${(() => { const tri = list.filter(r => r.ev.tri.on); if (tri.length) return tri.slice(0, 3).map(r => trifectaCard(r, { spot: true })).join("");
        const c = list.slice().sort((a, b) => (b.ev.tri.n - a.ev.tri.n) || ((b.ev.score / EP.color + b.ev.tri.bow / EP.bow + b.ev.tri.bolt / EP.bolt) - (a.ev.score / EP.color + a.ev.tri.bow / EP.bow + a.ev.tri.bolt / EP.bolt)))[0];
        return trifectaCard(c, { spot: true }); })()}`;
    box.querySelectorAll(".bcard[data-id],.tricard[data-id]").forEach(el => el.addEventListener("click", () => openDetail(el.dataset.id)));
  }

  // ---------- Weather during the event + Trifecta ----------
  // Little icons under each map pin: 🌈 rainbow odds ≥ 10% (bold at ≥ 22%), ⚡ lightning odds ≥ 25% in the event window,
  // then rain / wind / fog / overcast / snow if forecast during the window.
  function pinIcons(r) {
    const B = r.ev.bonus, out = [];
    if (B.bow.p >= BONUS_MIN) out.push({ i: "🌈", c: "bow " + bonusCls(B.bow.p), t: `Rainbow ${B.bow.p}%` });
    r.ev.wx.items.forEach(w => out.push({ i: w.icon, c: w.id + (w.id === "bolt" && w.p >= 40 ? " hi" : ""), t: w.name }));
    return out.slice(0, 3);
  }
  const wxChip = w => `<span class="tag wx ${w.id}">${w.icon} ${w.name}${w.p ? " " + w.p + "%" : ""}</span>`;
  const EP = window.Model.EPIC;
  const legTxt = T => `${T.legs.color ? "✓" : "✗"} ${Ev} ${T.color}/${EP.color} · ${T.legs.bow ? "✓" : "✗"} Rainbow ${T.bow}%/${EP.bow}% · ${T.legs.bolt ? "✓" : "✗"} Lightning ${T.bolt}%/${EP.bolt}%`;
  function trifectaCard(r, opts = {}) {
    const T = r.ev.tri;
    if (T.on) return `<div class="tricard on"${opts.spot ? ` data-id="${r.spot.id}"` : ""}><div class="tri-ic">✦</div><div><div class="tri-k">Trifecta${opts.spot ? ` · ${r.spot.name}, ${r.spot.state}` : ""}</div>
      <div class="tri-n">Epic ${EV} + epic rainbow + epic lightning</div><div class="tri-w">${hm(T.start, r.tz)}–${hm(T.end, r.tz)} · ${legTxt(T)}</div></div><div class="tri-badge">🌅🌈⚡</div></div>`;
    return `<div class="tricard"${opts.spot ? ` data-id="${r.spot.id}"` : ""}><div class="tri-ic off">✦</div><div><div class="tri-k">Trifecta watch${opts.spot ? ` · closest: ${r.spot.name}, ${r.spot.state}` : ""}</div>
      <div class="tri-n">${T.n}/3 epic${T.n === 3 && !T.lined ? " — but rainbow & lightning don't overlap in time" : ""}</div><div class="tri-w">${legTxt(T)}</div></div></div>`;
  }

  // ---------- Map ----------
  const map = window.__agMap = L.map("map", { zoomControl: false, attributionControl: true, minZoom: 4 }).setView([34.5, -77.5], 5);
  { const mc = document.getElementById("map"); map.on("movestart zoomstart", () => mc.classList.add("moving")); map.on("moveend zoomend", () => mc.classList.remove("moving")); }   // d14: pause pin animations while panning
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors", maxZoom: 16, updateWhenZooming: false, keepBuffer: 3 }).addTo(map);
  map.createPane("labels"); map.getPane("labels").style.zIndex = 450; map.getPane("labels").style.pointerEvents = "none";
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { pane: "labels", maxZoom: 16, updateWhenZooming: false, keepBuffer: 3 }).addTo(map);
  const overlays = {
    vis: L.tileLayer(Sat.tileUrl("vis"), { opacity: 0.7, attribution: "GOES-East via Iowa Env. Mesonet", maxNativeZoom: 8, updateWhenZooming: false }),
    cirrus: L.tileLayer(Sat.tileUrl("cirrus"), { opacity: 0.7, attribution: "GOES-East via Iowa Env. Mesonet", maxNativeZoom: 8, updateWhenZooming: false }),
    ir: L.tileLayer(Sat.tileUrl("ir"), { opacity: 0.6, attribution: "GOES-East via Iowa Env. Mesonet", maxNativeZoom: 8, updateWhenZooming: false }),
    radar: L.tileLayer(Sat.tileUrl("radar"), { opacity: 0.7, attribution: "NEXRAD via Iowa Env. Mesonet", maxNativeZoom: 8, updateWhenZooming: false }),
  };
  document.querySelectorAll("[data-overlay]").forEach(b => b.addEventListener("click", () => {
    const o = b.dataset.overlay; state.overlay = o;
    Object.values(overlays).forEach(l => map.removeLayer(l)); if (state.est) { map.removeLayer(state.est); state.est = null; }
    // Draft: Low/Mid/High tabs, and Visible/IR/Radar on future days, are ESTIMATED from the forecast at event time.
    const estK = { low: "cloud_cover_low", mid: "cloud_cover_mid", high: "cloud_cover_high" }[o] || ((state.day > 0 || state.arch) && { vis: "cloud_cover", cirrus: "cloud_cover_high", ir: "cloud_cover_high", radar: "precipitation" }[o]);   // d25p: past days never show live satellite/radar tiles
    if (estK && state.data) { const col = { cloud_cover_low: "#c9ccd4", cloud_cover_mid: "#e8e2d4", cloud_cover_high: "#ffffff", cloud_cover: "#ffffff", precipitation: "#3fd06a" }[estK];
      // d24w: ESTIMATED forecast field — inverse-distance blend of every spot's already-fetched hourly value at its event time (no extra fetches),
      // faded out ~220 km from any spot, drawn as one semi-transparent image above the dark base; cached per day/mode/layer.
      const ck = `${state.day}|${MODE}|${estK}|${o}|${state.data.at || ""}`; state.estCache = state.estCache || {};
      let F = state.estCache[ck];
      if (!F) { const pts = state.results.map(r => { const k = SPOTS.findIndex(x => x.id === r.spot.id), H = state.data.S[k] && state.data.S[k].hourly; if (!H || !H[estK] || !H.time) return null;
          let i = 0, bd = 1e12; H.time.forEach((t, j) => { const dd = Math.abs(t - r.ev.tSet); if (dd < bd) { bd = dd; i = j; } }); const v = H[estK][i] || 0, p = vPos(r.spot);
          return { lat: p[0], lng: p[1], a: estK === "precipitation" ? Math.min(1, v / 3) : v / 100, v }; }).filter(Boolean);
        if (pts.length) { const la = pts.map(p => p.lat), ln = pts.map(p => p.lng), M = 4, b = [[Math.min(...la) - M, Math.min(...ln) - M], [Math.max(...la) + M, Math.max(...ln) + M]], GW = 120, GH = 160;
          const cv2 = document.createElement("canvas"); cv2.width = GW; cv2.height = GH; const cx = cv2.getContext("2d"), im = cx.createImageData(GW, GH), hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
          for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const lat = b[1][0] - (y + 0.5) / GH * (b[1][0] - b[0][0]), lng = b[0][1] + (x + 0.5) / GW * (b[1][1] - b[0][1]); let sw = 0, sv = 0, dmin = 1e9;
            for (const p of pts) { const dy = (lat - p.lat) * 111, dx = (lng - p.lng) * 111 * Math.cos(lat * Math.PI / 180), d2 = dx * dx + dy * dy + 400, w = 1 / d2; sw += w; sv += w * p.a; if (d2 < dmin) dmin = d2; }
            const a = sv / sw, fade = Math.max(0, Math.min(1, (220 * 220 - dmin) / (120 * 120))), c = hex(o === "ir" ? (a > 0.6 ? "#e04aff" : "#4ab0ff") : o === "radar" ? "#3fd06a" : col), q = (y * GW + x) * 4;
            im.data[q] = c[0]; im.data[q + 1] = c[1]; im.data[q + 2] = c[2]; im.data[q + 3] = Math.round(255 * fade * (a > 0.02 ? 0.12 + 0.6 * a : 0)); }
          cx.putImageData(im, 0, 0); F = state.estCache[ck] = { url: cv2.toDataURL(), b, max: Math.max(...pts.map(p => p.v)) }; } }
      if (F) { state.est = L.imageOverlay(F.url, F.b, { opacity: 1, interactive: false, className: "est-field" }).addTo(map); state.estMax = F.max; } }
    else if (overlays[o]) overlays[o].addTo(map);
    document.querySelectorAll("[data-overlay]").forEach(x => x.classList.toggle("on", x === b));
    setTimeout(() => { const n = $("#overlay-note"); if (n && estK && state.est) { const mx = Math.round((state.estMax || 0) * 10) / 10, u = estK === "precipitation" ? " mm" : "%"; n.textContent = `Estimated · forecast — ${{ cloud_cover_low: "low cloud", cloud_cover_mid: "mid cloud", cloud_cover_high: "high cloud (cirrus)", cloud_cover: "total cloud", precipitation: "forecast precipitation" }[estK]} at ${EV}${state.day > 0 ? " on " + fmtDay(state.results[0].ev.tSet, state.results[0].tz, state.day) : ""}, not satellite. Max ${mx}${u}${mx < 3 ? " (essentially none — map stays clear)" : ""}.`; } }, 0);   // d24w
    $("#overlay-note").textContent = { none: "", vis: "Live GOES-East visible (daytime only) — bright = thick cloud.", cirrus: "Live GOES-East band 4 cirrus — bright = thin high ice cloud (the good canvas). Daytime only.", ir: "Live GOES-East infrared — colored = cold, high cloud tops.", radar: "Live NEXRAD radar — rain now.", low: "ESTIMATED from forecast: low cloud (stratus/cumulus, below 6,500 ft) at event time.", mid: "ESTIMATED from forecast: mid cloud (altocumulus/altostratus, 6,500–20,000 ft) at event time.", high: "ESTIMATED from forecast: high cloud (cirrus, above 20,000 ft) at event time." }[o] + (state.day > 0 && ["vis","cirrus","ir","radar"].includes(o) ? " · Future day → ESTIMATED from forecast, not satellite." : "");
  }));
  const markers = {};
  window.__agRender = () => renderMarkers();
  function renderMarkers() {
    // 95+ pins pulse; ?demo=hot shows the pulse on the top 3 spots (pin label forced to ≥ 96 for the demo only — scores elsewhere untouched)
    const hotDemo = /[?&]demo=hot\b/.test(location.search) ? new Set(state.results.slice().sort((a, b) => b.ev.score - a.ev.score).slice(0, 3).map(x => x.spot.id)) : null;
    state.results.forEach(r => {
      const pScore = hotDemo && hotDemo.has(r.spot.id) ? Math.max(96, r.ev.score) : r.ev.score, hot = pScore >= 95;
      const lb = label(pScore);
      const B = r.ev.bonus, T = r.ev.tri, ic = pinIcons(r);
      const bx = (B.dog.p >= BONUS_MIN ? `<em class="pb dog" title="Sun dogs ${B.dog.p}%">◉</em>` : "") + ((!state.arch && window.AGX && AGX.badges(r.spot)) || "");
      const html = `<div class="pin${T.on ? " tri" : ""}${hot ? " hot" : ""}" style="--c:${lb.c}"${hot ? ` title="${pScore} — top-tier sky"` : ""}><span>${pScore}</span>${bx}${T.on ? `<em class="ptri" title="Trifecta">✦</em>` : ""}${ic.length ? `<div class="pwx">${ic.map(x => `<i class="${x.c}" title="${x.t}">${x.i}</i>`).join("")}</div>` : ""}</div>`;
      const icon = L.divIcon({ className: "pin-wrap", html, iconSize: [32, 32], iconAnchor: [16, 16] });
      if (markers[r.spot.id]) { if (markers[r.spot.id]._agHtml !== html) markers[r.spot.id].setIcon(icon); }   // d14: skip unchanged pins (was rebuilding all ~70 pin DOM nodes on every refresh)
      else markers[r.spot.id] = L.marker(vPos(r.spot), { icon, riseOnHover: true }).addTo(map)
        .on("click", () => openDetail(r.spot.id))
        .bindTooltip("", { direction: "top", offset: [0, -13], className: "tip" });
      markers[r.spot.id]._agHtml = html;
      markers[r.spot.id].setTooltipContent(`<b>${r.spot.name}</b>${r.spot.vantage ? `<br><small>☀ from ${r.spot.vantage.name}</small>` : ""}<br>${lb.t} · ${fmtTime(r.ev.tSet, r.tz)}${r.ev.bonus.bow.p >= BONUS_MIN ? `<br>🌈 ${r.ev.bonus.bow.name} ${r.ev.bonus.bow.p}%` : ""}${r.ev.bonus.dog.p >= BONUS_MIN ? `<br>◉ Sun dogs ${r.ev.bonus.dog.p}% — 22° either side of the sun, needs thin cirrus/cirrostratus with the sun under ~${RISE?"20":"20"}° up` : ""}${(!state.arch && window.AGX && AGX.tip(r.spot)) || ""}${r.ev.wx.items.map(w => `<br>${w.icon} ${w.name}${w.p ? " " + w.p + "%" : ""}`).join("")}${r.ev.tri.on ? `<br><b class="tt-tri">✦ TRIFECTA</b>` : ""}`);
      if (markers[r.spot.id].setZIndexOffset) markers[r.spot.id].setZIndexOffset(r.ev.tri.on ? 1000 : hot ? 900 : ic.length ? 200 : 0);
    });
  }

  // ---------- Compute ----------
  function compute() {
    const { S, W, E, AQ } = state.data;
    state.results = SPOTS.map((spot, i) => ({ spot, i, tz: S[i].timezone, ev: evaluate(spot, S[i], [W[i * 3], W[i * 3 + 1], W[i * 3 + 2], state.data && state.data.WF && state.data.WF[i]], E[i], state.day, AQ && AQ[i]) })); window.__agState = state;
  }

  // ---------- Render ----------
  // d25j: one chronological day row — past days (lazy replay, scores fill in) to the LEFT of Tonight/Today, live days to the right.
  // On load the row scrolls so Tonight is the first visible card; swipe right to see past days. Tapping a past card swaps in that day's replay.
  const bestOf = (D, i) => Math.max(...SPOTS.map((sp, k) => evaluate(sp, D.S[k], [D.W[k * 3], D.W[k * 3 + 1], D.W[k * 3 + 2], D.WF && D.WF[k]], D.E[k], i, D.AQ && D.AQ[k]).score));
  const pastBest = {};
  function renderDays() {
    const L = state.arch ? state.live.data : state.data, S0 = L.S[0], card = (cls, attr, d1, d2, sc) => {
      const lb = typeof sc === "number" ? label(sc) : null;
      return `<button class="day ${cls}" ${attr}><span class="d1">${d1}</span><span class="d2">${d2}</span><span class="d3"${lb ? ` style="--c:${lb.c}"` : ""}>${typeof sc === "number" ? "best " + sc : sc}</span></button>`; };
    const keys = pastKeys().slice(0, PAST).reverse(), pb = pbLoad();
    const past = keys.map(k => { const c = CH[chunkOf(k)] || {}, D = c.data; let sc = typeof pb[k] === "number" ? pb[k] : c.err && !c.retrying ? "↻ retry" : "…";
      if (D && typeof pb[k] !== "number") { const S1 = D.S[0], idx = S1.daily.time.findIndex(t => ymd(t + 43200, S1.timezone) === k); if (idx < 0) sc = "—"; else try { sc = bestOf(D, idx); } catch (e) { sc = "—"; } }
      const t = Date.parse(k + "T12:00:00Z") / 1000, yest = k === ymd(Date.now() / 1000 - 86400, "America/New_York");
      return card(`past${state.arch && state.arch.key === k ? " on" : ""}`, `data-past="${k}"${sc === "…" ? ' aria-busy="true"' : ""}`, yest ? "Yesterday" : new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(t * 1000)), fmtDate(t, "UTC"), sc); }).join("");
    const live = S0.daily.time.map((t, i) => card(`${!state.arch && i === state.day ? "on" : ""}${i === 0 ? " today" : ""}`, `data-day="${i}"`, (() => { const a = state.arch; state.arch = null; const v = fmtDay(t + 43200, S0.timezone, i); state.arch = a; return v; })(), fmtDate(t + 43200, S0.timezone), bestOf(L, i))).join("");
    const box = $("#days"), keep = box.scrollLeft, first = !box.dataset.ready; box.innerHTML = past + live + `<button id="day-home" class="day-home" hidden aria-label="Back to ${RISE ? "today" : "tonight"}">↩ ${RISE ? "Today" : "Tonight"}</button>`;
    // initial scroll: Tonight first. iOS may not have laid out the row yet (loading screen up) → retry on the next frames until it sticks.
    const td = box.querySelector(".day.today"), toToday = () => { const x = td.offsetLeft - box.firstElementChild.offsetLeft; if (x > 0) { box.scrollLeft = x; if (box.scrollLeft > 0) box.dataset.ready = 1; } };
    if (first && td) { toToday(); if (!box.dataset.ready) { let n = 0; const tick = () => { if (box.dataset.ready || n++ > 40) return; toToday(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); } } else box.scrollLeft = keep;
    box.querySelectorAll(".day[data-day]").forEach(b => b.addEventListener("click", () => { if (state.arch) exitArchive(true); state.day = +b.dataset.day; state.autoDay = false; update(); { const ob = state.overlay && state.overlay !== "none" && document.querySelector(`[data-overlay="${state.overlay}"]`); if (ob) ob.click(); } }));   // d24w: re-draw the active layer for the new day
    box.querySelectorAll(".day[data-past]").forEach(b => b.addEventListener("click", () => enterArchive(b.dataset.past, b)));
    // "↩ Tonight" pill (sticky at the row's right edge): shown when scrolled away from today or on a past day; selects today, scrolls back
    const home = $("#day-home"), homeX = () => td ? td.offsetLeft - box.firstElementChild.offsetLeft : 0, homeUpd = () => { home.hidden = !(state.arch || Math.abs(box.scrollLeft - homeX()) > 60); };
    home.onclick = () => { if (state.arch) exitArchive(true); state.day = 0; state.autoDay = false; update(); const b2 = $("#days"); const t2 = b2.querySelector(".day.today"); if (t2) b2.scrollTo({ left: t2.offsetLeft - b2.firstElementChild.offsetLeft, behavior: "smooth" }); };
    if (!box.dataset.sc) { box.dataset.sc = 1; let to = 0; box.addEventListener("scroll", () => { const h = $("#day-home"); if (h) h.hidden = !(state.arch || Math.abs(box.scrollLeft - ((box.querySelector(".day.today") || {}).offsetLeft - box.firstElementChild.offsetLeft || 0)) > 60); clearTimeout(to); to = setTimeout(pastNear, 150); }, { passive: true }); }
    homeUpd(); setTimeout(pastNear, 50);
  }
  function filtered() {
    const reg = REGIONS[state.region].states;
    let list = state.results.filter(r => !reg || reg.includes(r.spot.state));
    if (state.userLoc) list.forEach(r => r.mi = dist(state.userLoc, r.spot));
    list.sort((a, b) => b.ev.score - a.ev.score);
    return list;
  }
  function renderHero(list) {
    const b = list[0]; if (!b) return;
    const lb = label(b.ev.score), conf = confidence(state.day);
    $("#hero").innerHTML = `
      <div class="hero-movie" title="Tap to open ${b.spot.name}"><canvas id="hero-cv"></canvas><div class="hm-cap"><b>${b.spot.name}</b><span>${b.ev.score} · ${lb.t}</span></div><div class="hm-t" id="hero-t"></div></div>
      <div class="hero-k">Best ${dayIs(0) ? (RISE ? "this morning" : "tonight") : "on " + fmtDay(b.ev.tSet, b.tz, state.day)} · ${REGIONS[state.region].name}</div>
      <div class="hero-row"><div><div class="hero-name">${b.spot.name}</div><div class="hero-sub">${b.spot.state} · ${EV} ${fmtTime(b.ev.tSet, b.tz)}</div></div>
      <div class="ring" style="--p:${b.ev.score};--c:${lb.c}"><b>${b.ev.score}</b><i>${lb.t}</i></div></div>
      <div class="hero-why">${b.ev.reasons[0]} Best minute ~${fmtTime(b.ev.timing.peak, b.tz)}.</div><div class="conf ${conf.c}">${conf.t}</div>`;
    $("#hero").onclick = () => openDetail(b.spot.id);
    heroMovie(b);
  }
  // d26n: hero "movie" — the top spot's forecast scene playing golden hour → afterglow (sunrise: blue hour → golden), looped, ~12 fps,
  // low resolution; starts after the forecast is ready, pauses off-screen, in a hidden tab or while a spot is open.
  let HM = { raf: 0, io: null, vis: true, b: null, off: null, fails: 0, twoD: false };
  // d26y: the movie owns NO persistent WebGL context. Frames are rendered into an offscreen WebGL canvas that exists only while the movie is visible
  // and no spot is open, then copied into a plain 2D <canvas> in the card (2D never loses its context; the last good frame stays). The offscreen
  // renderer is destroyed when a spot opens and rebuilt ~300 ms after it closes; black output is detected and retried 3x, then a 2D sky fallback.
  function hmDrop() { if (HM.off) { relGL(HM.off); HM.off = null; } }
  function heroMovie(b) {
    HM.b = b; const cv = document.getElementById("hero-cv"); if (!cv || !window.PhotoStage) return; HM.fails = 0; HM.twoD = false; hmDrop();
    if (HM.io) { HM.io.disconnect(); HM.io = null; } HM.paused = false;
    const T = b.ev.timing, a0 = RISE ? (T.civilEnd || T.sunset - 1800) : (T.golden || T.sunset - 2700), a1 = RISE ? (T.golden || T.sunset + 2700) : (T.civilEnd || T.glowEnd || T.sunset + 1800);
    const t0 = Math.min(a0, a1), t1 = Math.max(a0, a1), DUR = 14000; let last = 0, n = 0; const start = performance.now();
    const fr = now => { HM.raf = 0; if (HM.b !== b || !document.body.contains(cv)) return;
      if (document.body.classList.contains("detail-open")) { hmDrop(); return; }
      if (document.hidden || HM.paused) return;
      HM.raf = requestAnimationFrame(fr); if (now - last < 80) return;
      { const r = cv.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || !r.width) { hmDrop(); return; } }   // off-screen: keep ticking cheaply, no drawing
      last = now;
      const f = ((now - start) % DUR) / DUR, tt = t0 + (t1 - t0) * f, dpr = Math.min(1.5, window.devicePixelRatio || 1), W = Math.max(64, Math.round(cv.clientWidth * dpr)), H = Math.max(40, Math.round(cv.clientHeight * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const c2 = cv.getContext("2d");
      try {
        if (HM.twoD || !PhotoStage.live()) { const tmp = HM.tmp || (HM.tmp = document.createElement("canvas")); tmp.width = W; tmp.height = H; Preview.draw(tmp, b.spot, b.ev, tt); c2.drawImage(tmp, 0, 0, W, H); }
        else {
          if (!HM.off) { HM.off = document.createElement("canvas"); }
          const off = HM.off; PhotoStage.draw(off, b.spot, b.ev, tt, { w: Math.round(W / 1.6), h: Math.round(H / 1.6), fast: 1 });
          const g = off._pr && off._pr.gl; if (!g || g.isContextLost()) throw new Error("ctx");
          c2.drawImage(off, 0, 0, W, H);
          if (++n % 25 === 1) { const d = c2.getImageData(W >> 1, H >> 2, 4, 4).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; if (s / 48 < 4) throw new Error("black"); else HM.fails = 0; }
        }
      } catch (e) { hmDrop(); if (++HM.fails >= 3) HM.twoD = true; }
      const el = document.getElementById("hero-t"); if (el) el.textContent = fmtTime(tt, b.tz); };
    const go = () => { if (!HM.raf) HM.raf = requestAnimationFrame(fr); };
    HM.go = go; setTimeout(go, 600); clearInterval(HM.wd); HM.wd = setInterval(go, 1500);   // watchdog: restart the loop if anything stopped it
  }
  function relGL(c) { try { const g = c && c._pr && c._pr.gl; const x = g && g.getExtension("WEBGL_lose_context"); if (x && !g.isContextLost()) x.loseContext(); } catch (e) {} }
  window.__agRelGL = relGL; window.__agHM = HM;
  document.addEventListener("visibilitychange", () => HM.go && HM.go());
  new MutationObserver(() => HM.go && HM.go()).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  function renderList(list) {
    $("#list").innerHTML = list.map((r, k) => {
      const lb = label(r.ev.score);
      const B = r.ev.bonus, btag = [B.bow, B.dog].filter(b => b.p >= BONUS_MIN).map(b => `<span class="tag bonus ${b.id} ${bonusCls(b.p)}">${b.icon} ${b.name} ${b.p}%</span>`);
      if (r.ev.tri.on) btag.unshift(`<span class="tag tri">✦ Trifecta</span>`);
      r.ev.wx.items.slice(0, 2).forEach(w => btag.push(wxChip(w)));
      const tags = btag.concat(r.ev.badges.filter(b => b.p >= 22 && b.id !== "bow" && b.id !== "dog").sort((a, b) => b.p - a.p).slice(0, Math.max(0, 4 - btag.length)).map(b => `<span class="tag ${b.id}">${b.icon} ${b.name.toLowerCase()} ${likely(b.p).toLowerCase()}</span>`));
      return `<li class="item" data-id="${r.spot.id}" style="--c:${lb.c};animation-delay:${k * 18}ms">
        <div class="rank">${k + 1}</div>
        <div class="meta"><div class="nm">${r.spot.name} <span class="st">${r.spot.state}</span></div>
        <div class="sub">${fmtTime(r.ev.tSet, r.tz)} · ${r.spot.type}${r.mi != null ? ` · ${Math.round(r.mi)} mi` : ""}</div>
        <div class="bar"><i style="width:${r.ev.score}%"></i></div>${tags.length ? `<div class="tags">${tags.join("")}</div>` : ""}</div>
        <div class="sc"><b>${r.ev.score}</b><span>${lb.t}</span></div></li>`;
    }).join("");
    document.querySelectorAll(".item").forEach(li => {
      li.addEventListener("click", () => openDetail(li.dataset.id));
      li.addEventListener("mouseenter", () => markers[li.dataset.id] && markers[li.dataset.id].openTooltip());
      li.addEventListener("mouseleave", () => markers[li.dataset.id] && markers[li.dataset.id].closeTooltip());
    });
  }
  function update() {
    compute(); if (!state.arch) archViewed(); renderDays(); const list = filtered(); renderHero(list); renderBonus(list); renderList(list); renderMarkers();
    if (state.spot) openDetail(state.spot, true);
  }

  // ---------- Detail ----------
  function barRow(lbl, v) { v = Math.round(v ?? 0); return `<div class="brow"><span>${lbl}</span><div class="btrack"><i style="width:${v}%"></i></div><b>${v}%</b></div>`; }
  function timeline(r) {
    const { S, W } = state.data, h = S[r.i].hourly, w = W[r.i * 3].hourly, t0 = r.ev.tSet - (RISE ? 1 : 4) * 3600, t1 = r.ev.tSet + (RISE ? 4 : 1) * 3600;
    const idx = h.time.map((t, i) => [t, i]).filter(([t]) => t >= t0 - 1800 && t <= t1 + 1800);
    const cw = 100 / idx.length;
    const cols = idx.map(([t, i]) => {
      const lo = h.cloud_cover_low[i], md = h.cloud_cover_mid[i], hi = h.cloud_cover_high[i], wl = w.cloud_cover_low[i];
      const isSet = Math.abs(t - r.ev.tSet) < 1800;
      return `<div class="tcol ${isSet ? "set" : ""}" style="width:${cw}%">
        <div class="tstack"><i class="hi" style="opacity:${hi / 100}"></i><i class="md" style="opacity:${md / 100}"></i><i class="lo" style="opacity:${lo / 100}"></i><i class="wl" style="opacity:${wl / 100}" title="${DIRW} horizon low cloud"></i></div>
        <div class="tlab">${new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: r.tz }).format(new Date(t * 1000)).replace(" ", "")}</div></div>`;
    }).join("");
    return `<div class="timeline">${cols}</div><div class="tlegend"><span><i class="hi"></i>High</span><span><i class="md"></i>Mid</span><span><i class="lo"></i>Low overhead</span><span><i class="wl"></i>Low, 40 km toward ${EV}</span></div>`;
  }
  // Sun elevation curve (§1.1) with timing markers
  function sunChart(r) {
    const T = r.ev.timing, sp = r.spot, [t0, t1] = RISE ? [(T.civilEnd || T.sunset - 1800) - 300, (T.golden || T.sunset + 3600) + 1200] : [(T.golden || T.sunset - 3600) - 1200, (T.civilEnd || T.sunset + 1800) + 300];
    const W = 520, H = 130, eMin = -8, eMax = 10;
    const X = t => (t - t0) / (t1 - t0) * W, Y = el => H - (el - eMin) / (eMax - eMin) * H;
    let d = ""; for (let t = t0; t <= t1; t += 120) { const el = sunPos(t, sp.lat, sp.lng).elev; d += (d ? "L" : "M") + X(t).toFixed(1) + "," + Y(Math.max(eMin, Math.min(eMax, el))).toFixed(1); }
    const mk = (t, c, lbl, up) => t ? `<line x1="${X(t)}" x2="${X(t)}" y1="0" y2="${H}" stroke="${c}" stroke-dasharray="3 3" opacity=".7"/><text x="${X(t) + 3}" y="${up ? 12 : H - 4}" fill="${c}" font-size="10">${lbl}</text>` : "";
    return `<svg class="sunchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347" stop-opacity=".25"/><stop offset=".55" stop-color="#ff4f9a" stop-opacity=".15"/><stop offset="1" stop-color="#3b2a6b" stop-opacity=".3"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#skyg)"/>
      <rect y="${Y(6)}" width="${W}" height="${Y(0) - Y(6)}" fill="#ffb347" opacity=".08"/>
      <line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="#fff" opacity=".35"/>
      <line x1="0" x2="${W}" y1="${Y(-6)}" y2="${Y(-6)}" stroke="#7b5cff" opacity=".5" stroke-dasharray="2 4"/>
      <path d="${d}" fill="none" stroke="#ffd29a" stroke-width="2.5"/>
      ${mk(T.golden, "#ffd29a", RISE ? "golden hour ends" : "golden hour", true)}${mk(T.sunset, "#ff7a3d", EV, false)}${mk(T.peak, "#ff4f9a", "peak", true)}${mk(T.glowEnd, "#c9b8ff", RISE ? "first color" : "glow ends", false)}
      <text x="4" y="${Y(0) - 3}" fill="#fff" opacity=".6" font-size="9">0° horizon</text><text x="4" y="${Y(-6) - 3}" fill="#b5a9ff" font-size="9">−6° civil twilight</text>
    </svg>`;
  }
  // ---------- Predicted-sunset stage + time scrubber ----------
  function scrubRange(T) { if (RISE) return [(T.civilEnd || T.sunset - 1800) - 600, (T.golden || T.sunset + 3600) + 600]; const t0 = (T.golden || T.sunset - 3600) - 600, t1 = (T.civilEnd || T.sunset + 1800) + 600; return [t0, t1]; }
  // Location-page Sunrise | Sunset toggle: reopen the SAME spot in the other mode (same pin; sunrise uses the spot's east view / vantage).
  // The app reloads inside the shell iframe, so the music and the outer page keep going; demo params are kept, day carried when not "today".
  function evHref(m, id) {
    const q = new URLSearchParams(location.search); ["mode", "spot", "day", "t", "play", "b"].forEach(k => q.delete(k));
    q.set("mode", m); q.set("spot", id); if (state.day > 0 && !state.autoDay) q.set("day", state.day);   // an automatic "this morning is over → tomorrow" jump goes back to tonight
    return "?" + q.toString();
  }
  function wireEvToggle() {
    document.querySelectorAll(".ev-toggle a").forEach(a => a.addEventListener("click", e => {
      e.preventDefault(); if (a.classList.contains("on")) return;
      const g = a.parentNode; g.querySelectorAll("a").forEach(x => x.classList.toggle("on", x === a)); g.classList.add("busy");
      const L = $("#loading"); if (L) { const p = L.querySelector("p"); if (p) p.textContent = (a.dataset.ev === "sunrise" ? "Turning east for sunrise…" : "Turning west for sunset…"); L.classList.remove("done"); }
      setTimeout(() => location.replace(a.getAttribute("href")), 120);
    }));
  }
  function stage(r) {
    const sp = r.spot, ev = r.ev, T = ev.timing, DS = demoSky(), s = DS ? Object.assign({}, ev.s, { high: DS.high, mid: DS.mid, low: DS.low }) : ev.s, slotB = DS ? DS.block : ev.slotBlock, lb = label(ev.score), [t0, t1] = scrubRange(T);
    const pct = t => ((t - t0) / (t1 - t0) * 100).toFixed(2);
    const marks = (RISE ? [["golden", T.golden, "Golden hour ends", "Golden"], ["sunset", T.sunset, "Sunrise", "Sunrise"], ["peak", T.peak, "Best", "Best"], ["glow", T.glowEnd, "First color", "1st color"], ["civil", T.civilEnd, "Civil dawn", "Dawn"]] : [["golden", T.golden, "Golden hour", "Golden"], ["sunset", T.sunset, "Sunset", "Sunset"], ["peak", T.peak, "Best", "Best"], ["glow", T.glowEnd, "Glow ends", "Glow end"], ["civil", T.civilEnd, "Twilight ends", "Dusk"]]).filter(m => m[1]).sort((a, b) => a[1] - b[1]);
    // merge markers that would overlap on the track (e.g. best minute ≈ glow ends)
    const merged = []; for (const m of marks) { const prev = merged[merged.length - 1]; if (prev && (m[1] - prev[1]) / (t1 - t0) < 0.07) { prev[2] += " · " + m[2]; prev[3] += "·" + m[3]; } else merged.push([...m]); }
    marks.length = 0; marks.push(...merged);
    const hazeTxt = ev.clean > 0.85 ? "Crisp air" : ev.clean > 0.65 ? "Light haze" : ev.clean > 0.45 ? "Hazy" : "Heavy haze";
    const types = Object.fromEntries(ev.clouds.map(c => [c.level.toLowerCase().split(" ")[0], c.type.split(" — ")[0]]));
    const P = provenance(r), nct = noaaCloudTypes(r);
    if (nct) nct.forEach(c => types[c.level.toLowerCase()] = c.type.replace(/ \(.*/, "") + (c.type.includes("GOES") ? " ✓" : ""));
    if (DS) { Object.assign(types, DS.types); P.clouds = P.path = { k: "demo", t: "Demo URL sky (?sky= / ?wx=) — not today's forecast" }; }
    const chip = (k, v, sub, p) => `<div class="rc"><span>${k} ${p ? tag(p) : ""}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
    // track colors: day gold → sunset orange → peak rose → glow violet → night
    const tr = RISE ? `linear-gradient(90deg,#0b0a1c 0%,#1d1b44 ${pct(T.civilEnd || t0)}%,#7b5cff ${pct(T.glowEnd || T.peak - 900)}%,#ff4f9a ${pct(T.peak)}%,#ff8a3d ${pct(T.sunset)}%,#ffd08a ${pct(T.golden || t1)}%,#8fb3d9 100%)` : `linear-gradient(90deg,#8fb3d9 0%,#ffd08a ${pct(T.golden || t0)}%,#ff8a3d ${pct(T.sunset)}%,#ff4f9a ${pct(T.peak)}%,#7b5cff ${pct(T.glowEnd || T.peak + 900)}%,#1d1b44 ${pct(T.civilEnd || t1)}%,#0b0a1c 100%)`;
    return `
      <section class="stage" style="--c:${lb.c}">
        <canvas id="pv" aria-label="Illustrated forecast of the ${EV} at ${sp.name}"></canvas>
        <img id="pv-ph0" class="pv-photo" alt=""><img id="pv-ph1" class="pv-photo" alt=""><canvas id="pv-back" class="pv-back" hidden aria-label="View in the other direction"></canvas><canvas id="pv-wx" class="pv-wx" aria-hidden="true"></canvas>
        <div class="stage-top">
          <div><div class="d-kick">${sp.type} · ${sp.state}${r.mi != null ? " · " + Math.round(r.mi) + " mi away" : ""} · ${fmtDay(ev.tSet, r.tz, state.day)} ${fmtDate(ev.tSet, r.tz)}</div><h2>${sp.name}</h2>${sp.vantage ? `<div class="d-kick vant">📍 ${Ev} view from ${sp.vantage.name}</div>` : ""}${state.arch ? "" : `<div class="ev-toggle" role="group" aria-label="Sunrise or sunset at this spot"><a href="${evHref("sunrise", sp.id)}" data-ev="sunrise" class="${RISE ? "on" : ""}"${RISE ? ' aria-current="true"' : ""} title="Same spot facing east at sunrise">🌅 Sunrise</a><a href="${evHref("sunset", sp.id)}" data-ev="sunset" class="${RISE ? "" : "on"}"${RISE ? "" : ' aria-current="true"'} title="Same spot facing west at sunset">🌇 Sunset</a></div>`}</div>
        </div>
        <div id="pv-gen" class="pv-gen" hidden></div>
        <div class="stage-rail">
          <div class="rail-top"><div class="stage-score" title="${EV} score"><b>${ev.score}</b><i>${lb.t}</i></div><div id="pv-wxl" class="pv-wxl" hidden></div></div>
          <div class="rail-ctl"><button id="pv-play" class="play pv-play-hid" title="Play the ${RISE ? "morning" : "evening"} (Space)">${PLAY}</button><button id="pv-turn" class="play turn" aria-pressed="false" title="Face ${RISE ? "west" : "east"} — see the sky on the other side, where rainbows appear" aria-label="Face ${RISE ? "west" : "east"}">Face ${RISE ? "West" : "East"}</button><button id="pv-look" class="play look" aria-pressed="false" title="360° camera — drag to look around, pinch to zoom" aria-label="360 degree camera">🌐 360°</button><button id="pv-fb" class="play fb" title="Send a photo &amp; rating for this spot">Feedback</button><span id="pv-fbs" class="fb-score" hidden></span>
            <div class="rail-zoom" role="group" aria-label="Zoom"><button class="zb" data-z="+" aria-label="Zoom in">+</button><output id="pv-zo">1.0×</output><button class="zb" data-z="-" aria-label="Zoom out">−</button><input id="pv-zoom" type="range" min="0.55" max="4" step="0.01" value="1" aria-label="Zoom into the scene" hidden></div></div>
          <div class="stage-bottom">
            <div class="stage-now"><b id="pv-time"></b><span id="pv-phase"></span><small id="pv-elev"></small></div>
            <div class="stage-dir" id="pv-dir">Facing ${compass(ev.sunsetAz)} ${Math.round(ev.sunsetAz)}°</div>
            <div class="stage-badge"><span id="pv-badge">Illustrated forecast · not a photo</span><button id="pv-mode" class="pv-mode" hidden>AI finish: on</button></div>
          </div>
        </div>
      </section>
      <div class="scrub" style="--track:${tr}">
        <div class="scrub-marks">${marks.map((m, k) => `<button data-t="${m[1]}" style="left:${pct(m[1])}%" class="mk ${m[0]} ${k % 2 ? "alt" : ""}"><i></i><span class="lf">${m[2]}</span><span class="ls">${m[3]}</span><em>${fmtTime(m[1], r.tz).replace(/ [A-Z]{2,4}$/, "")}</em></button>`).join("")}</div>
        <input id="scrub" type="range" min="${t0}" max="${t1}" step="20" value="${T.peak}" aria-label="Time of ${RISE ? "morning" : "evening"}"><span id="pv-thumb" class="thumb-glyph" aria-hidden="true">▶</span>
        <div class="scrub-row"><span id="pv-what" class="pv-what"></span></div><div class="pv-moon" id="pv-moon"></div>${window.SteamFog && SteamFog.CFG[sp.id] && RISE ? `<div class="pv-steam" id="pv-steam" hidden></div>` : ""}
      </div>
      <details class="readout-box" id="pv-ro"${state.roClosed ? "" : " open"}><summary>Sky &amp; water readouts</summary><div class="readout">
        ${chip("High", Math.round(s.high) + "%", types.high || "", P.clouds)}
        ${chip("Mid", Math.round(s.mid) + "%", types.mid || "", P.clouds)}
        ${chip("Low", Math.round(s.low) + "%", types.low || "", P.clouds)}
        ${chip(DIRW + " gap", Math.round((1 - slotB) * 100) + "% open", slotB < 0.25 ? "light gets in" : slotB < 0.55 ? "partly blocked" : "mostly blocked", P.path)}
        ${chip("Air", hazeTxt, s.aod != null ? "AOD " + s.aod.toFixed(2) : "RH " + Math.round(ev.rhLow) + "%", P.aod)}
        ${ev.sea || (sp.behind && sp.behind.water) || (window.AGX && AGX.faceEast(sp.id)) ? `<div class="rc" id="pv-sea"><span>Water</span><b>—</b><small></small></div>` : `<div class="rc"><span>Water</span><b>None</b><small>land foreground</small></div>`}
      </div></details>
      <div class="fine pv-fine">This is an illustrated preview generated from this spot's forecast, not a photo. Cloud cover by layer comes from NOAA HRRR (with the low-cloud gap along the ${EV} line), haze from NOAA GOES-19 AOD / CAMS, and the lighting follows the actual sun position. Drag the slider or hit Play to watch the colors change through ${RISE ? "blue hour, first color, sunrise and golden hour" : "golden hour, sunset, afterglow and blue hour"}. Weather is drawn only when the forecast calls for it during the ${EV} window: rain (slanted by the wind), ⚡ storm cell and lightning (odds ≥ 25%), fog and snow. The water surface follows the forecast wind, gusts and wave height minute by minute: glassy and mirror-reflective under ~3 mph, light ripples to ~7 mph, small wavelets and a glitter path to ~11 mph, choppy with scattered whitecaps from ~12 mph, rough with frequent whitecaps past ~16 mph, and whitecaps everywhere past ~22 mph — with every shade in between. Rainbows form opposite the sun — behind you — so when rainbow odds are ≥ 10% a 🌈 “behind you” panel appears during the forecast rainbow window.</div>
      ${noaaPanel(r)}`;
  }

  function hrrrAt(id, tSet) {
    const H = state.noaa && state.noaa.hrrr && state.noaa.hrrr.hours; if (!H) return null;
    const ts = Object.keys(H).map(Number).sort((a, b) => a - b), lo = ts.filter(t => t <= tSet).pop(), hi = ts.find(t => t > tSet);
    if (lo == null || hi == null || hi - lo > 3600 || !H[lo][id] || !H[hi][id]) return null;
    const f = (tSet - lo) / 3600, a = H[lo][id], b = H[hi][id], o = {};
    for (const k in a) o[k] = a[k] == null ? b[k] : b[k] == null ? a[k] : a[k] + (b[k] - a[k]) * f;
    return o;
  }
  function noaaPanel(r) {
    const N = state.noaa, sp = r.spot, ev = r.ev, tSet = ev.tSet;
    if (!N && state.arch) return `<h3>NOAA data</h3><div class="fine"><span class="src model">NOAA model</span> Past prediction replay — cloud layers, rain, wind and humidity come from NOAA HRRR/GFS short-range model hours for that day (via the Open-Meteo mirror). Satellite and METAR observations aren't archived.</div>`;
    if (!N) return `<h3>NOAA data</h3><div class="fine"><span class="src fb">Offline</span> The on-box NOAA fetcher hasn't produced data/noaa.json — scores use the NOAA HRRR/GFS mirror only.</div>`;
    const f = (v, d = 0, u = "") => v == null || isNaN(v) ? "—" : (+v).toFixed(d) + u;
    const pct = v => v == null ? "—" : Math.round(v) + "%";
    const cyc = N.hrrr ? new Date(N.hrrr.cycle_utc).toISOString().slice(11, 13) + "Z" : "";
    const hs = hrrrAt(sp.id, tSet), hp = [40, 120, 200].map(km => RISE ? null : hrrrAt(`${sp.id}@${km}`, tSet));
    const hrrrCard = hs ? `<div class="ncard"><div class="nh"><b>HRRR at ${EV}</b><span class="src model">NOAA model</span></div>
      <div class="ngrid"><div><span>Low / Mid / High</span><b>${pct(hs.low)} / ${pct(hs.mid)} / ${pct(hs.high)}</b></div><div><span>Total cloud</span><b>${pct(hs.total)}</b></div>
      <div><span>Cloud base</span><b>${hs.cbase_m != null && hs.cbase_m < 20000 ? f(hs.cbase_m * 3.281 / 1000, 1, "k ft") : "—"}</b></div><div><span>Visibility</span><b>${f(hs.vis_m / 1609, 0, " mi")}</b></div>
      <div><span>RH 2 m</span><b>${pct(hs.rh2m)}</b></div><div><span>Rain rate</span><b>${f(hs.prate_mmh, 1, " mm/h")}</b></div>
      <div><span>Smoke near surface</span><b>${f(hs.smoke_sfc_ugm3, 1, " µg/m³")}</b></div><div><span>Smoke column</span><b>${f(hs.smoke_col_mgm2, 1, " mg/m²")}</b></div>
      <div><span>Smoke AOD (HRRR-Smoke)</span><b>${f(hs.aot, 3)}</b></div>
      <div><span>Low cloud toward sun</span><b>${hp.map(x => x ? pct(x.low) : "—").join(" · ")}</b></div></div>
      <div class="fine">HRRR ${cyc} run, 3 km, read directly from NOAA's grib2 on AWS Open Data and interpolated to ${fmtTime(tSet, r.tz)}. ${RISE ? "Sunrise path (east) clouds come from the NOAA HRRR/GFS mirror." : "Path = 40 / 120 / 200 km toward the sunset."}</div></div>`
      : `<div class="ncard"><div class="nh"><b>HRRR at ${EV}</b><span class="src model">NOAA model</span></div><div class="fine">${(state.arch || state.day > 1) ? "Beyond HRRR's 48-h range — this day uses NOAA GFS (via Open-Meteo mirror)." : "Direct HRRR hours not available for this sunset — using NOAA HRRR via Open-Meteo mirror."}</div></div>`;
    const G = N.goes, gp = G && G.points[sp.id], gpath = G && !RISE ? [40, 120, 200].map(km => G.points[`${sp.id}@${km}`] || {}) : [];
    const phase = g => { const p = g && g.phase; if (!p) return "clear"; const e = Object.entries(p).sort((a, b) => b[1] - a[1])[0]; return `${e[0]} ${Math.round(e[1] * 100)}%`; };
    const warn = [];
    if (G && dayIs(0)) {
      const lowW = gpath.filter(g => g.low_stratus_fog).length;
      if (lowW && hp.every(x => !x || x.low < 25)) warn.push(`GOES-19 currently sees low liquid cloud/fog along the ${EV} line (${lowW}/3 points) that HRRR clears by ${EV} — watch it.`);
      if (gp && gp.obs_high > 0.5 && (gp.phase || {}).ice > 0.5) warn.push(`GOES-19 confirms ice cloud overhead now (tops ${f(gp.cth_km_med, 1)} km) — real cirrus canvas.`);
    }
    const goesCard = G && gp ? `<div class="ncard"><div class="nh"><b>GOES-19 observed now</b><span class="src obs">NOAA obs</span></div>
      <table class="ntab"><tr><th></th><th>Cloud</th><th>Top</th><th>Phase</th><th>AOD</th></tr>
      ${[["Here", gp], ...gpath.map((g, k) => [`${[40, 120, 200][k]} km ${DIRW[0]}`, g])].map(([n, g]) => `<tr><td>${n}</td><td>${g.cloud_frac != null ? Math.round(g.cloud_frac * 100) + "%" : "—"}</td><td>${f(g.cth_km_med, 1, " km")}</td><td>${phase(g)}</td><td>${f(g.aod, 2)}</td></tr>`).join("")}</table>
      <div class="fine">ABI L2 CONUS products from NOAA Open Data (s3://noaa-goes19): clear-sky mask (ACM), cloud-top height (ACHA), cloud-top phase (ACTP), aerosol optical depth (AOD; daytime, clear pixels only). Scan ${fmtClock(G.products.ACM ? G.products.ACM.scan_utc : G.products.CTH.scan_utc)}. ${dayIs(0) ? "Tonight's haze score uses this AOD." : "Current observation — most useful for tonight."}</div></div>` : "";
    const M = N.metar && N.metar[sp.id];
    const metarCard = M ? `<div class="ncard"><div class="nh"><b>Surface obs · ${M.station}</b><span class="src obs">NOAA obs</span></div>
      <div class="ngrid"><div><span>Station</span><b>${M.name || M.station} · ${Math.round(M.dist_km * 0.621)} mi</b></div><div><span>Observed</span><b>${fmtClock(M.obs_utc)}</b></div>
      <div><span>Visibility</span><b>${M.vis_mi != null ? M.vis_mi + (M.vis_mi >= 10 ? "+" : "") + " mi" : "—"}</b></div><div><span>Weather</span><b>${M.wx || "none"}</b></div>
      <div><span>Cloud bases</span><b>${(M.clouds || []).map(c => `${c.cover}${c.base != null ? " " + (c.base / 1000).toFixed(1) + "k ft" : ""}`).join(", ") || "clear"}</b></div><div><span>Temp / dew</span><b>${f(M.temp_c * 9 / 5 + 32, 0, "°")} / ${f(M.dewp_c * 9 / 5 + 32, 0, "°F")}</b></div></div>
      <div class="fine mono">${M.raw}</div></div>` : `<div class="ncard"><div class="nh"><b>Surface obs</b><span class="src obs">NOAA obs</span></div><div class="fine">No METAR station within ~30 mi of this spot.</div></div>`;
    const P = provenance(r);
    const prov = [[`Cloud layers & ${dirw}ern gap`, P.clouds], ["Visibility / humidity", P.vis], ["Haze (AOD)", P.aod], ["PM2.5", P.pm], ["Cloud types", P.types], ["Front / pressure trend", P.front], ["Sun position & times", P.sun]];
    return `<h3>NOAA data <small>what drives this forecast</small></h3>
      ${warn.length ? `<div class="nwarn">${warn.map(w => `<div>🛰 ${w}</div>`).join("")}</div>` : ""}
      <div class="ncards">${hrrrCard}${goesCard}${metarCard}</div>
      <div class="prov">${prov.map(([k, p]) => `<div><span>${k}</span>${tag(p)}<small>${p.t}</small></div>`).join("")}</div>`;
  }
  function wireStage(r, tKeep) {
    const cv = $("#pv"), sl = $("#scrub"), sp = r.spot, ev = r.ev; if (!cv || !sl) return;
    if (tKeep) sl.value = tKeep;
    let raf = 0, playing = 0;
    // d14: ONE animation loop for the whole app (token kills loops left over from a previous spot), locked to 30 fps,
    // adaptive resolution for animated frames, paused while the map is showing or the tab is hidden.
    const AN = window.__agAnim || (window.__agAnim = { n: 0, tok: 0, id: 0, last: 0, ema: 33, scale: 0.8, fps: 30, slow: 0, t30: 0 });
    // v21: desktop targets 60 fps with a 0.75 resolution floor; if it can't hold 60 even at the floor it drops to 30 (re-tries 60 every 20 s). Phones: 30 fps, floor 0.7 (d28d).
    const desk = isDesk(); if (desk) { if (AN.fps !== 30 || !AN.t30) AN.fps = 60; AN.scale = Math.max(0.75, AN.scale); AN.ema = 1000 / AN.fps; } else { AN.fps = 30; }
    AN.lockAt = 0; if (AN.id) { cancelAnimationFrame(AN.id); AN.id = 0; } const myTok = AN.tok = ++AN.n;
    const alive = () => AN.tok === myTok && !document.hidden && document.body.classList.contains("detail-open") && document.body.contains(cv);
    const animLoop = ts => { AN.id = 0; if (!alive()) return;
      const dt = ts - AN.last, fps = isDesk() ? AN.fps : 30, iv = 1000 / fps, floor = isDesk() ? 0.75 : (AN.ema > 55 ? 0.6 : 0.7);   // d28d: phone floor 0.5→0.7 (0.5 looked blocky)
      if (fps === 30 && AN.t30 && isDesk() && ts - AN.t30 > 20000) { AN.fps = 60; AN.t30 = 0; AN.slow = 0; AN.ema = 1000 / 60; }   // v21: re-try 60 fps
      if (dt >= iv - (fps === 60 ? 2 : 4)) {
        if (!AN.lockAt) AN.lockAt = ts + 3000; const lockd = !isDesk() && ts > AN.lockAt && AN.ema < 45;   // d24e: phones settle resolution in ~3 s then hold it (no visible pumping on surf)
        if (AN.last) { AN.ema = AN.ema * 0.85 + Math.min(dt, 250) * 0.15; if (!lockd) {
          const hi = fps === 60 ? 21 : 40, lo = fps === 60 ? 18 : 35;
          if (AN.ema > hi && AN.scale > floor) AN.scale = Math.max(floor, AN.scale * 0.92);        // can't hold the target → fewer pixels
          else if (AN.ema > hi && fps === 60) { if (!AN.slow) AN.slow = ts; else if (ts - AN.slow > 1500) { AN.fps = 30; AN.t30 = ts; AN.slow = 0; AN.ema = 1000 / 30; } }   // at the floor and still slow for 1.5 s → 30 fps
          else if (AN.ema < lo && AN.scale < 1) { AN.scale = Math.min(1, AN.scale * 1.03); AN.slow = 0; } else if (AN.ema <= hi) AN.slow = 0; } }        // headroom → claw quality back
        AN.real = AN.ema ? Math.round(1000 / AN.ema) : 0;
        AN.last = ts; render(true);
        if (!(PhotoStage.last && (PhotoStage.last.surf || sp.water))) return; }   // d25o: all water spots animate continuously
      AN.id = requestAnimationFrame(animLoop); };
    const startAnim = () => { if (!AN.id && AN.tok === myTok) { AN.last = 0; AN.id = requestAnimationFrame(animLoop); } };
    const word = l => l.lit < 0.08 ? "in shadow" : (l.c[1] > 200 ? "lit gold-white" : l.c[1] > 150 ? "lit gold" : l.c[1] > 100 ? "lit orange" : "lit pink-red");
    // d25w: the slider thumb is the play button — glyph rides on the thumb; tap = play/pause, drag = scrub (pauses)
    const posG = () => { const g = $("#pv-thumb"); if (!g || !sl) return; const r = sl.getBoundingClientRect(), pr = sl.parentElement.getBoundingClientRect(), f = (+sl.value - +sl.min) / ((+sl.max - +sl.min) || 1), R = 17;
      g.style.left = (r.left - pr.left + R + f * (r.width - 2 * R)) + "px"; g.style.top = (r.top - pr.top + r.height / 2) + "px"; g.textContent = playing ? "❚❚" : "▶"; g.classList.toggle("on", !!playing); };
    window.__agPosG = posG;
    const render = anim => {
      posG();
      if (anim !== true) anim = false;
      raf = 0; const t = +sl.value; state.pvT = t; state.pvSpot = sp.id; window.__agPvT = t;
      const back = $("#pv-back"), turned = !!state.turn && back;
      // Draft: when the view behind you is open water, render it with the same photoreal sky+water shader (sun behind camera)
      const wNow = Object.assign({}, Model.windAt(ev, t) || {});
      if (window.AGX && AGX.pastWind && t < Date.now() / 1000 - 3600) { const pw = AGX.pastWind(sp, t); wNow.wind = pw ? pw.wind : null; wNow.gust = pw ? pw.gust : null; wNow.wdir = pw ? pw.wdir : null; wNow.src = pw ? pw.src : null; }   // d25r: past = measured wind only (ASOS/buoy) or hidden
      { const AW = window.AGWind || (window.parent !== window && (() => { try { return window.parent.AGWind; } catch (e) { return null; } })()); if (AW) AW.set(Math.max(wNow.wind || 0, wNow.gust || 0), true); }   // d26g: wind sound above 20 mph (gust if known)
      { const Nw = window.AGObs && AGObs.now[sp.id], mo = Nw && Nw.metar; if (mo && mo.mph != null && Math.abs(t - Date.now() / 1000) < 7200) { wNow.wind = Math.max(wNow.wind || 0, mo.mph); if (mo.gust != null) wNow.gust = Math.max(wNow.gust || 0, mo.gust); if (mo.wdir != null) wNow.wdir = mo.wdir; } }   // d16: observed wind (gales) near now   // d13: wind speed, gust and direction for the slider time (was: sunset/sunrise instant for direction)
      const wOpt = () => { window.__agSeaT = t; const m = window.AGX ? AGX.sea(sp, { dir: wNow.wdir, mph: wNow.wind, gust: wNow.gust }) : null; const zf = { fovMul: 1 / (state.zoom || 1) }; if (state.look) { zf.lookYaw = state.yaw || 0; zf.lookPitch = state.lpitch || 0; }   /* d28z5: yaw rotates the shader camera (everything turns together) */ if (/[?&]sky=clear/.test(location.search)) Object.assign(zf, { high: 0.12, mid: 0, low: 0, block: 0, gap: 1, midKm: 4.5 }); if (/[?&]sky=overcast/.test(location.search)) Object.assign(zf, { high: 0.4, mid: 0.95, low: 0.85, block: 1, gap: 0 });
      { const wxq = new URLSearchParams(location.search).get("wx");
        if (wxq === "haze") Object.assign(zf, { high: 0.25, mid: 0.15, low: 0.1, aod: 0.55, rh: 0.88, block: 0.3, gap: 0.6 });
        if (wxq === "partly") Object.assign(zf, { high: 0.35, mid: 0.3, low: 0.2, block: 0.15, gap: 0.8 });
        if (wxq === "fog") Object.assign(zf, { rh: 0.99, aod: 0.9, low: 0.5, block: 0.6 });
        if (wxq === "rain") Object.assign(zf, { high: 0.5, mid: 0.9, low: 0.95, block: 1, gap: 0, aod: 0.35, rh: 0.95 });
        if (wxq === "storm") Object.assign(zf, { high: 0.7, mid: 0.9, low: 0.9, block: 0.85, gap: 0.25, aod: 0.3, rh: 0.92 }); } if (!m || !m.ft) return zf; const ftC = Math.min(15, m.ft), r = { ...zf, swell: ftC <= 8 ? ftC / 8 : 1 + (ftC - 8) / 28, phase: (t % 86400) / Math.max(4, m.per * 40) + performance.now() / 1000 * 2.2 / Math.max(4, m.per) };   // d25o: + continuous wall-clock swell (≈ the real swell period) so the water never freezes between slider steps
        if (m.surf && m.ft >= 1.5) Object.assign(r, { hero: !/[?&]hero=0/.test(location.search), heroD: 18, heroCam: /[?&]hero=0/.test(location.search) ? 0.0016 + 0.00045 * Math.max(0, ftC - 4) : 0.0015, faceK: 1 + 0.3 * Math.max(0, Math.min(1, ((m.per || 9) - 7) / 7)), mess: m.ft <= 2.2 ? 0.38 : 0, surf: ftC * 0.3048, off: m.off ? 1 : 0, surfT: window.__agSurfT != null ? window.__agSurfT : (t % 900) + performance.now() / 1000, surfL: Math.max(30, Math.min(70, (m.per || 10) * 4.2)) });   // d23w: PHYSICAL scale — the input is the forecast Hs; breaking face = 1.0 (wind swell, <= 7 s) .. 1.3 (groundswell, >= 14 s) x Hs; the camera stays put (eye 1.5 m above the water, wave 18 m out) for every size, so 2/3/5/10 ft keep their true proportions (was: face 1.4 x Hs and the camera crept to 11 m for small surf, so 5 ft looked like 8–10 ft). A 6 ft person in the shallows is drawn to the same geometry as a reference (off by default; ?ref=1 shows it — d23x). d19: 6–15 ft keep growing (hero modelled at 5 ft x K in the shader); beach view (hero=0) stands up on the dune for big surf so the lines behind the first set show
        { const S1 = window.AGX && AGX.swellAt && AGX.swellAt(sp.id, t); if (S1) m.dir = S1.dir; } if (m.dir != null && ev.sunsetAz != null) { const camAz = (state.look ? ev.sunsetAz + (state.yaw || 0) + (turned ? 180 : 0) + 720 : turned && sp.behind && sp.behind.water ? ev.sunsetAz + 180 : ev.sunsetAz) % 360, da = ((m.dir - camAz + 540) % 360) - 180; r.swAng = Math.max(-40, Math.min(40, da)) * Math.PI / 180; if (Math.abs(da) > 90) r.swell *= 0.35; }   // d25q: render always moves shoreward (|angle| ≤ 40° toward the viewer; bands/wind-sea drift toward the camera in the shader); swell from behind the view = sheltered → smaller   // d19: swell lines angled by where the swell comes from vs where the camera looks
        if (m.wl) { Object.assign(r, { chop: m.wl.chop, caps: m.wl.caps }); if (r.surf) r.off = m.wl.off; if (r.hero && !heroWind(m.wl)) r.mess = Math.max(r.mess || 0, 0.3, Math.min(1, (m.wl.kt - 3) / 13)) * (/^onshore|light onshore/.test(m.wl.look) ? 1 : 0.55); }
        // architecture: forecast → classes → look dials (looks.js); the renderer reads only the dials
        if (window.Looks) { const s0 = ev.s || {}, qp = new URLSearchParams(location.search), wxq = qp.get("wx"), skq = qp.get("sky");
          const cls = Looks.classify(sp, { low: s0.low != null ? s0.low / 100 : null, mid: s0.mid != null ? s0.mid / 100 : null, high: s0.high != null ? s0.high / 100 : null, precip: s0.precip, pp: s0.pprob, code: s0.code, cape: s0.cape, vis: s0.vis,
            windMph: m.demo && m.mph != null ? m.mph : wNow.wind, windDir: m.demo && m.wdir != null ? m.wdir : wNow.wdir, alerts: (!state.arch && window.AGX && AGX.alerts[sp.id] || {}).events || [] });
          if (wxq && Looks.LOOKS.sky[wxq]) cls.sky = wxq; if (skq === "clear" || skq === "overcast") cls.sky = skq; if (wxq === "haze") cls.sky = "partly";
          if (skq === "clear") cls.sunGap = 1; if (cls.sky === "overcast" || cls.sky === "fog" || cls.sky === "rain") cls.sunGap = 0;
          const D = Looks.dials(cls, m); window.__agDials = D;
          Object.assign(r, { tint: D.waterTint, back: D.backlight, chop: D.roughness, caps: D.whitecaps });
          if (r.surf) r.off = Math.max(D.off, D.spindrift * 0.9); if (!D.surf) { delete r.surf; delete r.hero; }
          if (r.surf && (D.wind === "onshore" || D.wind === "cross")) { const k = Math.max(0.3, Math.min(1, (cls.kt - 3) / 13)); r.mess = Math.max(r.mess || 0, D.wind === "onshore" ? k : 0.55 * k); r.off = 0; r.caps = Math.max(r.caps || 0, 0.2 + 0.5 * r.mess); r.chop = Math.max(r.chop || 0, 0.4 + 0.4 * r.mess); } }   // v17: barrel only offshore/calm; onshore & cross-shore → crumbly hero wave (no tube), messiness ∝ onshore wind
        if (/[?&]wx=(rain|storm)/.test(location.search)) r.chop = Math.min(1, (r.chop || 0.2) + 0.3);   // rain-pocked surface
        return r; };
      // d23: the 180° Turn renders BOTH water and land behind you with the photoreal shader: real ground (sand / marsh / lawn),
      // the far shore's treeline, houses or dunes lit by the actual sun (front-lit at sunset, backlit at sunrise, diffuse under overcast)
      const GB = window.Photoreal && window.Ground ? (turned ? Ground.behind(sp, RISE) : Ground.front ? Ground.front(sp, RISE) : null) : null, GS = turned ? (sp.behind || {}) : { type: sp.type, far: sp.far };   // d24: Ground.front = land you face (1st St Jetty sunset: the hotels)
      let o = null;
      if (GB) { const wo = wOpt(), G = Object.assign({}, GB); if (wo.surf && !G.land) G.nearD = 0;   // surf close-up: you are standing in the water
        const fsp = Object.assign({}, sp, { far: G.d > 0 ? "open" : (GS.far || "open"), water: !G.land, type: G.land ? GS.type : sp.type === "Pier" ? "Pier" : "Beach" });
        if (GS.far === "bridge" && !G.land) fsp.far = "bridge";
        const extra = { lq: dragging, turned, ground: G, hills: G.land ? 0 : undefined, shore: G.d > 0 ? 0 : undefined };
        if (G.camH) extra.camH = G.camH; if (G.lake != null && !G.land) Object.assign(extra, { swell: 0, surf: 0, hero: 0, caps: (wo.caps || 0) * G.lake, chop: (wo.chop != null ? wo.chop : 0.3) * G.lake }); if (G.land) Object.assign(extra, { surf: 0, hero: 0, chop: 0, caps: 0, swell: 0 });
        Object.keys(extra).forEach(k => extra[k] === undefined && delete extra[k]);
        o = PhotoStage.draw(cv, fsp, ev, t, Object.assign({}, wo, extra, anim ? { scale: AN.scale, dprCap: isDesk() ? 2 : 1.5, fast: (!isDesk() || AN.scale < 0.62) ? 1 : 0 } : {})); }   // d24f: geography (surf close-up) animated frames get the same adaptive quality — were full-res every frame → 0.8 s GPU stalls on phones
      if (o && o.mode !== "live") o = null;
      const aq = anim ? { scale: AN.scale, dprCap: isDesk() ? 2 : 1.5, fast: (!isDesk() || AN.scale < 0.62) ? 1 : 0 } : {};   // v21: desktop animated frames keep DPR up to 2   // d14: animated frames: capped DPR + adaptive scale; stills stay full quality
      if (!o) o = turned ? Object.assign(Preview.state(sp, ev, t), Preview.drawBehind(back, sp, ev, t), { mode: "behind" }) : PhotoStage.draw(cv, sp, ev, t, Object.assign(playing && window.__agPlayQ ? playOpt() : dragging && isDesk() ? { scale: 0.75 } : { lq: dragging }, wOpt(), aq));   // v21: desktop drags render at the 0.75 floor (phones 0.42)
      if (anim) return;   // d14: animation frames only redraw the WebGL scene — no DOM/label/weather recompute
      { const gy = window.AGObs && AGObs.sceneAt ? AGObs.sceneAt(sp, ev, t).gray : ev.obs ? ev.obs.gray : 0; const fl = o.mode !== "live" && gy > 0 ? `saturate(${(1 - 0.65 * gy).toFixed(2)}) brightness(${(1 + 0.08 * gy).toFixed(2)})` : ""; if (cv.style.filter !== fl) cv.style.filter = fl; }   // d15: illustrated fallback goes gray too (d22: muted, not drained, and brighter)
      const turnedIll = turned && o.mode === "behind";
      { const FG = { lionsbridge: { src: "img/lionsbridge-fg.webp", src2: "img/lionsbridge-lion.webp", cls: "" }, northlanding: { src: "img/northlanding-cypress.webp?v=d24m", src2: "img/northlanding-moss.webp?v=d24m", cls: "pv-cy" }, windmillpt: { src: "img/windmill-heron-body.webp?v=d24u", src2: "img/windmill-heron-head.webp?v=d24u", cls: "pv-hr", rise: true } }[sp.id], st = cv.parentElement; let el = st && st.querySelector(".pv-fg");   // d24h: Lions Bridge — the real foreground (lion statue, pedestal, wall, shore, railing) cut from Sean's photo; lit by the sun, silhouette only after dark
        if (FG && !turned && st) {   // d24r: same foregrounds at sunrise and sunset (hidden only in the 180° Turn view)
          if (!el) { el = document.createElement("img"); el.className = "pv-fg"; el.alt = ""; st.appendChild(el); } if (el.getAttribute("src") !== FG.src) el.src = FG.src; el.hidden = false; let el2 = st.querySelector(".pv-fg2"); if (!el2) { el2 = document.createElement("img"); el2.className = "pv-fg pv-fg2"; el2.alt = ""; st.appendChild(el2); } if (el2.getAttribute("src") !== FG.src2) el2.src = FG.src2; for (const k of ["pv-cy", "pv-hr"]) { el.classList.toggle(k, FG.cls === k); el2.classList.toggle(k, FG.cls === k); } el2.hidden = false;   // d24i: lion on its own layer, smaller + left, clear of the setting sun
          const e = o.elev != null ? o.elev : 0, lt = Math.max(0, Math.min(1, (e + 6) / 8)), f = `brightness(${(0.1 + 0.9 * lt).toFixed(2)}) saturate(${(0.35 + 0.65 * lt).toFixed(2)})`; const f2 = FG.cls === "pv-cy" ? `brightness(${(0.25 + 0.75 * lt).toFixed(2)}) saturate(${(0.35 + 0.65 * lt).toFixed(2)})` : f; if (el.style.filter !== f) el.style.filter = f; if (el2.style.filter !== f2) { el2.style.filter = f2; el2.style.opacity = FG.cls === "pv-cy" ? (0.75 + 0.25 * lt).toFixed(2) : ""; } 
            { const L = window.PhotoStage && PhotoStage.last, a = cv.clientWidth / Math.max(1, cv.clientHeight), base = a < 1 ? 62 : a < 1.5 ? 50 : 40, k = L && L.vfov ? Math.tan(base * Math.PI / 360) / Math.tan(L.vfov * Math.PI / 360) : 1;   // d26g: foreground photo props zoom with the scene (scale k about the image centre, whatever each layer's transform-origin)
              for (const E of [el, el2]) { const o2 = getComputedStyle(E).transformOrigin.split(" ").map(parseFloat), w2 = E.clientWidth, h2 = E.clientHeight, tx = (w2 / 2 - (o2[0] || 0)) * (1 - k), ty = (h2 / 2 - (o2[1] || 0)) * (1 - k);
                const sc = Math.abs(k - 1) < 0.002 ? "" : k.toFixed(4), yx = (state.look ? -(state.yaw || 0) * cv.clientHeight / base * (state.zoom || 1) : 0) + (sp.id === "lionsbridge" && k < 0.98 ? -0.3 * cv.clientWidth : 0),   /* d28z5: wide Lions Bridge view — lion slides left, clear of the left sun dog */ yy = state.look ? (state.lpitch || 0) * cv.clientHeight / base * (state.zoom || 1) : 0, tr = sc || yx || yy ? `${(tx + yx).toFixed(1)}px ${(ty + yy).toFixed(1)}px` : ""; if (E.style.scale !== sc) E.style.scale = sc; { const mk = k < 0.98 ? "linear-gradient(to right,transparent,#000 14%,#000 86%,transparent),linear-gradient(to bottom,transparent,#000 12%)" : ""; if (E.style.webkitMaskImage !== mk) { E.style.webkitMaskImage = mk; E.style.maskImage = mk; E.style.webkitMaskComposite = mk ? "source-in" : ""; E.style.maskComposite = mk ? "intersect" : ""; } }   /* d28z5: wide view — photo edges fade out instead of hard rectangles */ if (E.style.translate !== tr) E.style.translate = tr; } } }   // d24m: North Landing moss stays a bit backlit/translucent at dusk
        else if (el) { el.hidden = true; const e2 = st.querySelector(".pv-fg2"); if (e2) e2.hidden = true; } }
      if (o.mode === "live" && !/[?&]still=1/.test(location.search) && (window.PhotoStage && PhotoStage.last && (PhotoStage.last.surf || sp.water)) && !dragging && !playing) startAnim();   // d14: keep the surf breaking at a steady 30 fps (was setTimeout 70 ms full re-render, ~12 fps, kept running behind the map)
      { const st = cv.parentElement, og = ev.oppGlow || 0, faceOpp = turned || (sp.water && ev.sunsetAz != null && false); let el = st && st.querySelector(".pv-opp");   // d24j: clouds opposite the sun lit pink-red (satellite opposite-sky term) in the 180° view
        if (st && og > 0 && faceOpp) { if (!el) { el = document.createElement("div"); el.className = "pv-opp"; el.style.cssText = "position:absolute;left:0;right:0;top:0;height:62%;pointer-events:none;mix-blend-mode:soft-light;background:radial-gradient(120% 90% at 50% 15%,rgba(255,70,90,.95),rgba(255,120,60,.6) 45%,rgba(255,120,60,0) 80%)"; st.appendChild(el); }
          const e = o.elev != null ? o.elev : 0, tf = Math.max(0, Math.min(1, (3 - e) / 3)) * Math.max(0, Math.min(1, (e + 9) / 5)); el.style.opacity = (og * tf * 0.85).toFixed(2); el.hidden = false; } else if (el) el.hidden = true; }
      if (back) back.hidden = !turnedIll;
      { const d = $("#pv-dir"), az = turned ? (ev.sunsetAz + 180) % 360 : ev.sunsetAz; if (d) d.textContent = "Facing " + compass(az) + " " + Math.round(az) + "°"; if (ev.sunsetAz != null && state.baseAz !== ev.sunsetAz) { state.baseAz = ev.sunsetAz; state.__syncTurn && state.__syncTurn(); } }
      if (turned) { ph.forEach(im => im.style.opacity = 0); if (badge) badge.textContent = !turnedIll ? "Realistic render from forecast · not a photo" : o.bow ? `🌈 Rainbow ${ev.bonus.bow.p}% in view · illustrated` : "Illustrated · not a photo"; }
      else showPhotos(t);
      if (dragging && o.mode === "live" && !hqT) hqT = setTimeout(() => { hqT = 0; dragging = false; queue(); }, 160);   // v17 fix: surf re-renders no longer cancel the full-res pass (scene stuck low-res after a drag)
      wxT = t; wxC = window.Wx && (o.mode === "live" || window.AGX) ? Wx.conditions(ev, t, o.elev) : null;
      { const SF = window.SteamFog && SteamFog.calc(sp, ev), el = $("#pv-steam"); if (el) { if (SF) { const h2 = `<b class="sf-${SF.level.toLowerCase()}">🌫 ${SF.txt.replace(/^Steam fog /, "Steam fog: ")}</b><small>${SF.src || ""}</small>`; if (el.innerHTML !== h2) el.innerHTML = h2; el.hidden = false; } else el.hidden = true; }
        if (wxC && SF && SF.p >= 20 && (GB ? !GB.land : sp.water)) wxC.steam = { p: SF.p }; }   // d28j: steam fog over the water (west river view; east only if water in view)
      // d23y: rain is drawn only where it was ACTUALLY raining at the scene time (live or replay): NEXRAD >= ~20 dBZ within ~5 km of the spot
      // in the 5-min frame nearest t (IEM archive for past times). No radar → nearby station reports (event-time METARs, or the latest
      // reports for "now") plus the model. No data at all (e.g. the future) → the model, as before.
      if (wxC && o.mode === "live" && !/[?&]wx=/.test(location.search)) { const key = sp.id + ":" + Math.round(t / 300), RQ = rainQ[key];
        if (RQ === undefined && window.Sat && Sat.radarAt && t < Date.now() / 1000 + 600) { rainQ[key] = "pending"; Sat.radarAt(sp.lat, sp.lng, t).then(r => { rainQ[key] = r; window.__agQueue && __agQueue(); }); }
        const R = rainQ[key];
        if (R && R !== "pending") { if (R.rain >= 0.12) {   /* d28z: was 0.04 — light returns at dawn (dew/fog, sea clutter) drew rain at Buckroe Oct 30 */ wxC.rain = Math.max(wxC.rain || 0, Math.min(1, 0.35 + 1.2 * R.rain)); wxC.rainName = wxC.rainName || "Rain (radar)"; } else { wxC.rain = 0; wxC.rainName = null; } wxC.rainSrc = "radar"; }
        else if (R === "pending") { wxC.rain = 0; wxC.rainName = null; }   // brief: hold off until the radar frame answers
        else { const O = window.AGObs || {}, Nw = O.now && O.now[sp.id], nowS = Date.now() / 1000;
          const mo = !state.arch && Math.abs(t - ev.tSet) <= 3600 && O.metar && O.metar[sp.id] ? O.metar[sp.id] : Nw && Math.abs(t - nowS) < 7200 ? Nw.metar : null;
          if (mo && mo.shower) { wxC.rain = Math.max(wxC.rain || 0, 0.5); wxC.rainSrc = "station"; }
          else if (wxC.rain && (ev.obsDry || (mo && mo.dry))) { wxC.rain = 0; wxC.rainName = null; wxC.rainSrc = "station"; } } }
      window.__agWxC = wxC;
      if (wxC) { if (o.mode !== "live") { wxC.rain = wxC.snow = wxC.fog = wxC.bolt = wxC.bow = 0; }   // canvas fallback draws its own weather
        const fw = turned ? (sp.behind && sp.behind.water) : sp.water, s0 = ev.s || {};
        wxC.wdir = wNow.wdir; wxC.wind = wNow.wind != null ? wNow.wind : wxC.wind; { const dm = window.AGX && AGX.sea(sp, {}); if (dm && dm.demo && dm.mph != null) { wxC.wind = dm.mph; wxC.wdir = dm.wdir; } } wxC.faceAz = ((turned ? ev.sunsetAz + 180 : ev.sunsetAz) + (state.look ? state.yaw || 0 : 0) + 720) % 360; wxC.turned = turned && o.mode === "live"; wxC.moonPos = Wx.moonCalc && Wx.moonCalc(t + 86400 * (+(/[?&]moonday=(-?\d+)/.exec(location.search) || [0, 0])[1]), sp.lat, sp.lng);   /* d28o: ?moonday=N test hook — moon as it will be N days later at the same clock time */ wxC.sunElev = o.elev; wxC.cloud = ev.s ? ev.s.total : 0; /* d26i: real moon */ /* d28o: moon gating by cloud layer (not total incl. cirrus), far-shore ridge it sinks behind, water for its reflection */ wxC.cloudL = ev.s ? [ev.s.low || 0, ev.s.mid || 0, ev.s.high || 0] : null; wxC.ridge = GB && GB.d > 0 && GB.th ? Math.atan(GB.th / GB.d) * 57.2958 : 0; wxC.moonWater = GB ? !GB.land : !!sp.water; /* d28u: angular depth of the water band in front of the camera (marsh/lawn/sand foreground of nearD m → water only beyond it) */ wxC.waterDeg = GB && !GB.land && GB.nearD > 0 ? Math.atan(1000 * (GB.camH || 0.0017) / GB.nearD) * 57.2958 : null; { const mel = $("#pv-moon"), M = wxC.moonPos; if (mel && M && Wx.moonCalc) {   // d28r: HUD note on where the moon is, so it's clear why it is / isn't in view
          const pct = Math.round(M.frac * 100), L3 = wxC.cloudL || [0, 0, 0], half = (window.innerWidth / Math.max(1, window.innerHeight) < 1 ? 62 : 50) * (cv.clientWidth / Math.max(1, cv.clientHeight)) / 2 / (state.zoom || 1), dAz = ((M.az - wxC.faceAz + 540) % 360) - 180;
          const find = (dir, up) => { for (let k = 1; k <= 240; k++) { const tt = t + dir * k * 180, q = Wx.moonCalc(tt, sp.lat, sp.lng); if ((q.alt > -0.27) === up) return [tt, q]; } return null; };
          let tx; if (M.frac < 0.02) tx = "Moon: new moon — not visible";
          else if (M.alt < -0.27) { const R = find(1, true); tx = `Moon (${pct}%): below horizon` + (R ? ` · rises ${fmtTime(R[0], r.tz).replace(/ [A-Z]{2,4}$/, "")} ${compass(R[1].az)}` : ""); }
          else { const S = find(1, false), st = S ? ` · sets ${fmtTime(S[0], r.tz).replace(/ [A-Z]{2,4}$/, "")}` : "", where = `${Math.round(M.alt)}° up ${compass(M.az)}`;
            tx = L3[0] >= 85 ? `Moon (${pct}%): ${where} — hidden by low cloud` : Math.abs(dAz) > half ? `Moon (${pct}%): ${where} — out of view` + (Math.abs(dAz) > 90 ? ` (behind you — tap Face ${M.az < 180 ? "East" : "West"})` : ` (look ${dAz > 0 ? "right" : "left"})`) : `🌕 Moon (${pct}%): ${where}${L3[0] + L3[1] > 60 ? " · dimmed by cloud" : ""}${st}`; }
          if (mel.textContent !== tx) mel.textContent = tx; } } wxC.elev = o.elev; { const L = window.PhotoStage && PhotoStage.last; wxC.ref = o.mode === "live" && L && L.hero && L.surf > 0.2 && /[?&]ref=1/.test(location.search) ? { camH: (L.heroCam || 0.0015) * 1000, d: L.heroD || 18, fovMul: L.fovMul || 1, faceM: L.surf * (L.faceK || 1.15) } : null; }
        wxC.sea = fw && window.AGX && o.mode !== "live" ? AGX.sea(sp, { dir: wNow.wdir, mph: wNow.wind, gust: wNow.gust }) : null; wxC.trees = false; /* d25x: Grandview keeps only the big surf tree (small snags removed) */ wxC.ghost = !!fw && sp.id === "grandview" && wxC.faceAz < 180; /* d28f: the surf tree stands on the bay side only */ wxC.carrier = !!fw && sp.id === "oldpoint"; wxC.lat = sp.lat; wxC.lng = sp.lng != null ? sp.lng : sp.lon; wxC.sunAz = ev.sunsetAz; wxC.chinook = sp.id === "melrose" && !turned; wxC.house = sp.id === "melrose" && wxC.faceAz < 180 ? { front: !RISE } : null; /* d28g: 558 Plantation Pl on the land side (east) */ /* d26e: Chinook low over the Mattaponi (main view only) */ /* d26a: carrier on the Fort Monroe horizon */ /* d25v: tree in the surf, only when looking at the water it stands in */ wxC.jets = sp.id === "windmillpt" && !turned; { const Cv = window.AGObs && AGObs.cv && AGObs.cv[sp.id], R0 = Cv && Math.abs((Cv.tSet || 0) - ev.tSet) < 3600 && Math.abs(t - ((Cv.storms || {}).t || 0)) < 5400 ? (turned ? Cv.stormsAnti : Cv.storms) : null; wxC.storms = R0 && R0.cells && R0.cells.length ? R0 : null; /* d24t: radar-placed thunderheads, slider time within 90 min of the radar scan */ } { const L = window.PhotoStage && PhotoStage.last; if (L && L.hz) { wxC.hz = L.hz; wxC.vfov = L.vfov; } else { wxC.hz = 0.66; wxC.vfov = 20; } /* d24u: the scene's own horizon + field of view (WebGL camera, or the canvas preview's 0.66 / 0.05 H per degree) */ } wxC.shore = fw && sp.id === "saltponds" && !!/[?&]hero=0/.test(location.search); wxC.dune = sp.id === "jennettes" && o.mode === "live"; { const wxq = new URLSearchParams(location.search).get("wx"); if (wxq === "rain" || wxq === "storm") { wxC.rain = 0.75; wxC.rainName = "Rain"; } if (wxq === "storm") { wxC.bolt = 0.9; wxC.boltP = 60; } if (wxq === "fog") wxC.fog = 0.7; if ((wxq && wxq !== "rain" && wxq !== "storm") || /[?&]sky=(clear|overcast)/.test(location.search)) { wxC.rain = wxC.snow = wxC.bolt = 0; } } wxC.seaLbl = fw && window.AGX ? AGX.sea(sp, { dir: wNow.wdir, mph: wNow.wind, gust: wNow.gust }) : null; wxC.torn = !!(!state.arch && window.AGX && AGX.alerts[sp.id] && AGX.alerts[sp.id].tornado) || /[?&]demo=tornado/.test(location.search); }   // canvas fallback already draws its own weather
      { const wl = $("#pv-wxl"), tx = wxC ? Wx.label(wxC) : ""; if (wl) { wl.hidden = !tx; if (wl.dataset.tx !== tx || wl.dataset.o !== String(!!state.wxOpen)) { wl.dataset.tx = tx; wl.dataset.o = String(!!state.wxOpen);
        const ic = /🌪/.test(tx) ? "🌪 Weather alert" : /🌊/.test(tx) ? "🌊 Wave info" : "☁ Weather info";
        wl.innerHTML = state.wxOpen ? `<div class="wxp"><button class="wxx" aria-label="Close">✕</button>${tx.split("\n").map(l => `<div>${l}</div>`).join("")}</div>` : `<button class="wxc">${ic}</button>`;
        wl.querySelector("button").onclick = e => { e.stopPropagation(); state.wxOpen = !state.wxOpen; wl.dataset.o = ""; wl.dataset.tx = ""; render(); }; } } }
      if (!wxRaf) wxRaf = requestAnimationFrame(wxLoop);
      $("#pv-time").textContent = fmtTime(t, r.tz);
      { const se = $("#pv-sea"), PST = t < Date.now() / 1000 - 3600, W2 = (ev.sea && !PST && Model.seaAt(ev, t)) || (se && { name: "Wind", wind: wNow.wind || 0, gust: wNow.gust || wNow.wind || 0, ft: (() => { window.__agSeaT = t; const mm = window.AGX && AGX.mAt && AGX.mAt(sp.id, t); return mm ? mm.now : state.arch ? null : window.AGX && AGX.marine[sp.id] ? AGX.marine[sp.id].now : null; })(), txt: "" }); if (se && W2) { const dm = window.AGX && AGX.sea(sp, {}), demo = !!(dm && dm.demo && dm.mph != null), mph = demo ? dm.mph : wNow.wind != null ? wNow.wind : PST ? null : W2.wind, wd = demo ? dm.wdir : wNow.wdir, gu = wNow.gust != null ? wNow.gust : PST ? null : W2.gust;
          // d13: classification computed here from the same wind shown (was read from the renderer's dials, so it vanished whenever the WebGL surf path didn't run)
          const D = window.Looks && wd != null ? Looks.classify(sp, { windMph: mph, windDir: wd }) : null;
          const rel = D && D.wind ? D.wind : null, relTx = { offshore: "offshore", onshore: "onshore", cross: "cross-shore", calm: "light" }[rel] || "", relC = { offshore: "off", onshore: "on", cross: "cross", calm: "calm" }[rel] || "";
          const ft = demo ? dm.ft : W2.ft;
          se.querySelector("b").textContent = demo && window.__agDials && window.__agDials.look ? window.__agDials.look.charAt(0).toUpperCase() + window.__agDials.look.slice(1).replace(/ — .*/, "") : W2.name;
          se.querySelector("small").innerHTML = (wd != null ? `<span class="wdir"><i style="transform:rotate(${Math.round((wd + 180) % 360)}deg)" title="arrow = where the wind blows">↑</i>${Math.round(mph)} mph from ${compass(wd)}</span>${relTx ? `<em class="wrel ${relC}">${relTx}</em> · ` : ""}${(() => { const L2 = window.AGX && wd != null && AGX.sea(sp, { dir: wd, mph }); const wl = L2 && L2.wl; return wl ? (L2.surf ? `<b class="wq">${wl.rel} ${Math.round(mph)} mph · ${wl.q}</b> · ` : `<b class="wq">${wl.kt < 5 ? "calm" : wl.kt > 10 ? "wind chop" : "light chop"}</b> · `) : ""; })()}` : mph != null ? `${Math.round(mph)} mph · ` : "") + [demo || gu == null ? "" : `gust ${Math.round(gu)}`, ft != null && !PST ? `${ft < 1 ? "<1" : Math.round(ft)} ft` : ""].filter(Boolean).join(" · ") + (PST ? `<br><span class="msrc">${[mph != null && wNow.src ? `Wind measured · ${wNow.src}` : "Wind: no nearby measurement — hidden", AGX.mAt && AGX.mAt(sp.id, t) ? "" : "Waves: no buoy or NWS marine forecast — hidden"].filter(Boolean).join(" · ")}</span>` : "");
          { const S1 = !demo && window.AGX && AGX.swellAt && AGX.swellAt(sp.id, t); if (S1 && S1.txt) se.querySelector("small").innerHTML += `<br><span class="swell nws">${S1.txt}</span>`; else if (S1) se.querySelector("small").innerHTML += `<br><span class="swell"><i style="transform:rotate(${Math.round((S1.dir + 180) % 360)}deg)" title="arrow = where the swell travels">↑</i>${S1.kind} ${S1.ft.toFixed(1)} ft${S1.per ? ` @ ${Math.round(S1.per)} s` : ""} from the ${compass(S1.dir)} (${Math.round(S1.dir)}°)</span>`; }   // d25o
          se.title = W2.txt; } }
      $("#pv-phase").textContent = phaseName(o.phase);
      $("#pv-elev").textContent = `sun ${o.elev >= 0 ? "+" : "−"}${Math.abs(o.elev).toFixed(1)}°`;
      { const sl = $("#scrub"); if (sl && sl.parentElement) {   // d28z: Sean — floating time/sun bubble above the slider thumb (live while dragging and playing)
        let bb = document.getElementById("pv-bub"); if (!bb) { bb = document.createElement("div"); bb.id = "pv-bub"; bb.style.cssText = "position:absolute;z-index:5;pointer-events:none;transform:translateX(-50%);padding:3px 8px;border-radius:10px;background:rgba(14,16,28,.82);color:#fff;font:600 12px/1.25 system-ui,sans-serif;white-space:nowrap;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.35)"; const pe = sl.parentElement; if (getComputedStyle(pe).position === "static") pe.style.position = "relative"; pe.appendChild(bb); }
        const mn = +sl.min, mx = +sl.max, f = mx > mn ? (+sl.value - mn) / (mx - mn) : 0, th = 22, w = sl.offsetWidth, x0 = sl.offsetLeft + th / 2 + f * (w - th);
        bb.innerHTML = `${fmtTime(t, r.tz)}<br><span style="opacity:.8;font-weight:500">sun ${o.elev >= 0 ? "+" : "−"}${Math.abs(o.elev).toFixed(1)}°</span>`;
        const bw = bb.offsetWidth || 70, pw = sl.parentElement.clientWidth; bb.style.left = Math.max(bw / 2 + 2, Math.min(pw - bw / 2 - 2, x0)) + "px"; bb.style.top = (sl.offsetTop - 40) + "px"; } }
      const DSk = demoSky(), sNow = DSk || ev.s, parts = [["high", sNow.high, "Cirrus"], ["mid", sNow.mid, "Mid cloud"], ["low", sNow.low, "Low cloud"]].filter(x => x[1] >= 10).map(x => `${x[2]} ${word(o.lit[x[0]])}`);
      { const gw = DSk ? DSk.gray : window.AGObs && AGObs.sceneAt ? AGObs.sceneAt(sp, ev, t).gray : 0; /* d19: demo sky → caption follows the forced sky, not today's obs */ if (gw > 0.5) { $("#pv-what").textContent = "Sun blocked by low/mid overcast: flat gray light, no color"; } else $("#pv-what").textContent = parts.length ? parts.join(" · ") : (o.elev > 0 ? "Clear sky: clean gradient, little canvas" : "Clear sky: horizon band fading"); }
      document.querySelectorAll(".scrub .mk").forEach(b => b.classList.toggle("on", Math.abs(+b.dataset.t - t) < 90));
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(render); }; window.__agQueue = queue;
    let wxT = 0, wxC = null, wxRaf = 0;
    const wxLoop = now => { wxRaf = 0; const wc = $("#pv-wx"); if (!wc || !document.body.contains(cv) || document.hidden || !document.body.classList.contains("detail-open")) return;   // d14: no weather overlay drawing behind the map / in a hidden tab
      if (wxC) Wx.draw(wc, wxC, wxT, now); else { const c2 = wc.getContext("2d"); c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, wc.width, wc.height); }
      if (wxC && (wxC.rain || wxC.snow || wxC.bolt || wxC.sea || wxC.torn || wxC.jets || wxC.ghost || wxC.house || wxC.steam || wxC.carrier || wxC.chinook || wxC.cb || wxC.storms || wxC.dune || wxC.shore || (wxC.lat != null && wxC.sunElev < -5))) wxRaf = requestAnimationFrame(wxLoop); };
    let dragging = false, hqT = 0, photoOn = true;
    const ph = [$("#pv-ph0"), $("#pv-ph1")], badge = $("#pv-badge"), modeBtn = $("#pv-mode"), gen = $("#pv-gen");
    const [t0, t1] = scrubRange(ev.timing);
    function showPhotos(t) {
      const set = PhotoStage.photoSet(sp, ev), mix = photoOn && !((window.AGObs && AGObs.sceneAt ? AGObs.sceneAt(sp, ev, t).gray : ev.obs ? ev.obs.gray : 0) > 0.3) ? PhotoStage.photoMix(set, t) : null;   // d15: no colourful AI photo finish over an observed-gray sky
      ph.forEach((im, k) => { const m = mix && mix[k]; if (m) { if (im.getAttribute("src") !== m[0]) im.src = m[0]; im.style.opacity = m[1]; } else im.style.opacity = 0; });
      if (badge) badge.textContent = mix ? "AI photo finish · not a real photo" : PhotoStage.live() ? "Forecast render · not a photo" : "Illustrated forecast · not a photo";
    }
    const status = set => {
      if (!gen) return;
      const n = set.frames.length, tot = PhotoStage.keyTimes(sp, ev, t0, t1, ev.timing.peak).length;
      modeBtn.hidden = !n;
      gen.hidden = set.done || !set.busy; gen.textContent = `Photo finish ${n}/${tot}…`;
      queue();
    };
    { const tb = $("#pv-turn"); if (tb) { const sync = () => { tb.classList.toggle("on", !!state.turn); tb.setAttribute("aria-pressed", state.turn ? "true" : "false"); const base = state.baseAz != null ? state.baseAz : (RISE ? 90 : 270), az = state.turn ? (base + 180) % 360 : base, to = az >= 180 ? "East" : "West"; tb.textContent = "Face " + to; tb.title = "Face " + to.toLowerCase() + (state.turn ? " (toward the " + EV + ")" : " — the sky on the other side, where rainbows appear"); tb.setAttribute("aria-label", "Face " + to.toLowerCase()); };   // d28h: compass labels from the actual view bearing (was ↻ 180° / ↺ Back)
      state.__syncTurn = sync;
      sync(); tb.onclick = () => { state.turn = !state.turn; sync(); queue(); }; } }
    if (modeBtn) modeBtn.onclick = () => { photoOn = !photoOn; modeBtn.textContent = "AI finish: " + (photoOn ? "on" : "off"); queue(); };
    if (PhotoStage.live()) {
      const box = cv.getBoundingClientRect(), aspect = box.width / Math.max(1, box.height) || 1.3;
      PhotoStage.apiOK().then(ok => { if (!ok || state.spot !== sp.id) return; if (gen) { gen.hidden = false; gen.textContent = "Photo finish…"; }
        PhotoStage.ensurePhotos(sp, ev, t0, t1, ev.timing.peak, aspect, s2 => { if (state.spot === sp.id && document.body.contains(cv)) status(s2); }); });
    }
    { let d0 = null; const nearThumb = e => { const r = sl.getBoundingClientRect(), f = (+sl.value - +sl.min) / ((+sl.max - +sl.min) || 1), cx = r.left + 17 + f * (r.width - 34); return Math.abs(e.clientX - cx) <= 26; };
      sl.addEventListener("pointerdown", e => { d0 = nearThumb(e) ? { x: e.clientX, y: e.clientY, t: performance.now(), v: sl.value, was: !!playing } : null; });
      sl.addEventListener("pointerup", e => { const d = d0; d0 = null; if (!d) return; if (performance.now() - d.t < 350 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) { sl.value = d.v; if (d.was) stop(); else $("#pv-play").click(); posG(); } });
      sl.addEventListener("pointercancel", () => { d0 = null; }); if (window.ResizeObserver) new ResizeObserver(() => posG()).observe(sl); }
    sl.addEventListener("input", () => { stop(); dragging = true; clearTimeout(hqT); hqT = 0; queue(); });
    document.querySelectorAll(".scrub .mk").forEach(b => b.addEventListener("click", () => { stop(); sl.value = b.dataset.t; queue(); }));
    const stop = () => { if (playing) { cancelAnimationFrame(playing); playing = 0; $("#pv-play").textContent = PLAY; } window.__agPosG && window.__agPosG(); };
    // d21: Play renders at an adaptive resolution with a raised floor (was the 0.42 drag preview): effective CSS-pixel density
    // phones 0.9–1.3 (DPR cap 2), desktop 1.0–1.6; if a phone still can't hold ~30 fps at the floor it drops to the short ray-march (fast)
    const playOpt = () => { const Q = window.__agPlayQ, cap = 2, dpr = Math.min(window.devicePixelRatio || 1, cap); return { scale: Math.min(1, Q.eff / dpr), dprCap: cap, fast: Q.fast ? 1 : 0 }; };
    const playTick = ts => { const desk = isDesk(), Q = window.__agPlayQ || (window.__agPlayQ = { eff: desk ? 1.3 : 1.0, ema: 33, last: 0, slow: 0, fast: false }), lo = desk ? 1.0 : 0.9, hi = desk ? 1.6 : 1.3, tgt = desk ? 22 : 33;
      if (Q.last) { Q.ema = Q.ema * 0.8 + Math.min(250, ts - Q.last) * 0.2;
        if (Q.ema > tgt * 1.25) { if (Q.eff > lo) Q.eff = Math.max(lo, Q.eff * 0.93); else if (!desk && ++Q.slow > 20) Q.fast = true; }
        else if (Q.ema < tgt * 1.05) { Q.slow = 0; if (Q.fast) Q.fast = false; else Q.eff = Math.min(hi, Q.eff * 1.02); } }
      Q.last = ts; };
    window.AGX && AGX.colorScore && AGX.colorScore(sp.id).then(c => { const b = $("#pv-fbs"); if (!b || state.spot !== sp.id) return; b.hidden = false;
      if (c) { b.textContent = "● " + c.avg; b.title = `Recent photo color score from ${c.n} send${c.n > 1 ? "s" : ""} (last 30 days)`; } else { b.textContent = "—"; b.classList.add("none"); b.title = "No recent photo feedback for this spot yet"; } b.setAttribute("aria-label", b.title); });
    $("#pv-fb").onclick = () => { stop(); window.AGX && AGX.panel && AGX.panel({ spot: sp.id, t: +sl.value }); };   // d25g: Feedback lives in the preview panel, prefilled with this spot + slider time
    $("#pv-play").onclick = () => {
      if (playing) return stop();
      if (window.__agPlayQ) window.__agPlayQ.last = 0;
      const t0 = +sl.min, t1 = +sl.max, dur = 9000; let start = null;
      if (+sl.value >= t1 - 60) sl.value = t0;
      const from = +sl.value;
      $("#pv-play").textContent = "❚❚ Pause";
      setTimeout(posG);
      const step = ts => { playTick(ts); if (start == null) start = ts; const f = Math.min(1, (ts - start) / (dur * (t1 - from) / (t1 - t0))); sl.value = from + (t1 - from) * f; dragging = f < 1; render(); playing = f < 1 ? requestAnimationFrame(step) : (stop(), 0); };
      playing = requestAnimationFrame(step);
    };
    render();
    if (!state.arch && window.AGObs && AGObs.ensureNow) AGObs.ensureNow(sp, ev, () => { if (state.spot === sp.id) queue(); });   // d16: current METAR/GOES for the shown spot
    if (!window._pvVis) { window._pvVis = true; document.addEventListener("visibilitychange", () => { if (!document.hidden && state.spot && window.__agQueue) window.__agQueue(); }); }   // d14: resume after tab comes back
    if (!window._pvResize) { window._pvResize = true; window.addEventListener("resize", () => { const s2 = $("#scrub"); if (s2 && state.spot) s2.dispatchEvent(new Event("input")); }); }
  }
  window.__agOpenDetail = (id, k) => openDetail(id, k);   // d28z5 hook for preview-extras (favorites, day switch)
  async function openDetail(id, keepScroll) {
    state.spot = id; window.__agSpot = id;
    if (!keepScroll) state.turn = false;   // d28z: Sean — every spot opens facing WEST at sunset, EAST at sunrise (the forward view); Face East/West still turns
    const r = state.results.find(x => x.spot.id === id), sp = r.spot, ev = r.ev, s = ev.s, lb = label(ev.score), conf = confidence(state.day), T = ev.timing;
    const el = $("#detail-body"), scroll = el.scrollTop;
    const tw = t => t ? fmtTime(t, r.tz) : "—";
    const f = (v, d = 0, u = "") => v == null || isNaN(v) ? "—" : v.toFixed(d) + u;
    const domTxt = { high: "cirrus-level (~9 km)", mid: "mid-level (~4 km)", low: "low (~1 km)", clear: "clear sky" }[T.dom];
    const badges = ev.badges.slice().sort((a, b) => b.p - a.p);
    el.innerHTML = `
      ${stage(r)}
      <div class="d-head"><p class="d-note">${sp.note}</p></div>
      <div class="d-score">
        <div class="ring big" style="--p:${ev.score};--c:${lb.c}"><b>${ev.score}</b><i>${lb.t}</i></div>
        <div><div class="d-time">${Ev} <b>${fmtTime(ev.tSet, r.tz)}</b></div>
        <div class="d-sub">Sky score <b>${ev.sky}</b> · Site fit <b>${ev.site}</b></div>
        <div class="conf ${conf.c}">${conf.t}</div></div>
      </div>
      ${ev.tri.on || ev.tri.n >= 2 ? trifectaCard(r) : ""}
      <h3>🌦️ Weather during ${EV} <small>${hm(ev.wx.win.start, r.tz)}–${hm(ev.wx.win.end, r.tz)}</small></h3>
      <div class="wxd">${ev.wx.items.length ? ev.wx.items.map(w => `<div class="wxi ${w.id}"><b>${w.icon}</b><div><div class="wn">${w.name}${w.p ? ` <em>${w.p}%</em>` : ""}</div><div class="wt">${w.txt}${w.id === "bolt" && w.win ? ` Strikes most likely ${hm(w.win.start, r.tz)}–${hm(w.win.end, r.tz)}.` : ""}</div></div></div>`).join("") : `<div class="wxi none"><b>✓</b><div><div class="wn">No rain, wind, lightning or fog</div><div class="wt">Lightning ${ev.wx.bolt.p}% · wind ${ev.wx.wind.mph} mph (gusts ${ev.wx.wind.gust}) · rain chance ${ev.wx.rain.pp}%</div></div></div>`}</div>
      <h3>✨ Special bonus <small>rainbow & sun-dog odds for this spot</small></h3>
      <div class="bonus-d">${bonusCard(ev.bonus.bow, r, { kicker: ev.bonus.bow.red ? "Red rainbow (low sun)" : "Rainbow odds" })}${bonusCard(ev.bonus.dog, r, { kicker: "Sun-dog odds" })}</div>
      ${ev.gates.length ? `<div class="gates">${ev.gates.map(g => `<div>⚠ ${g}</div>`).join("")}</div>` : ""}
      <div class="timing">
        ${RISE ? `<div><span>Civil dawn</span><b>${tw(T.civilEnd)}</b></div>
        <div><span>First color</span><b>${tw(T.glowEnd)}</b></div>
        <div class="pk"><span>Best minute</span><b>${tw(T.peak)}</b></div>
        <div><span>Sunrise</span><b>${tw(T.sunset)}</b></div>
        <div><span>Golden hour ends</span><b>${tw(T.golden)}</b></div>` : `<div><span>Golden hour</span><b>${tw(T.golden)}</b></div>
        <div><span>Sunset</span><b>${tw(T.sunset)}</b></div>
        <div class="pk"><span>Best minute</span><b>${tw(T.peak)}</b></div>
        <div><span>Afterglow ends</span><b>${tw(T.glowEnd)}</b></div>
        <div><span>Civil twilight</span><b>${tw(T.civilEnd)}</b></div>`}
      </div>
      ${sunChart(r)}
      <div class="fine">Peak timing from the dominant cloud height (${domTxt}): ${RISE ? "high cloud lights up ~15–20 min before sunrise, low cloud only ~4–8." : "high cloud stays sunlit ~15–20 min after sunset, low cloud only ~4–8."} Twilight lasts ~${T.twilightMin ?? "—"} min here today.</div>
      <h3>Sky phenomena <small>separate from the color score</small></h3>
      <div class="wow">${badges.map(b => `<div class="wb ${b.p >= 40 ? "hi" : b.p >= 22 ? "md" : b.p >= 10 ? "lo" : "no"}"><div class="wi">${b.icon}</div><div class="wn">${b.name}</div><div class="wl">${likely(b.p)}<small> · ${b.p}</small></div><div class="wt">${b.why}${b.p >= 10 && b.t ? ` <em>~${tw(b.t)}</em>` : ""}</div></div>`).join("")}</div>
      <h3>Why this score</h3>
      <ul class="why">${ev.reasons.map(x => `<li>${x}</li>`).join("")}</ul>
      <div class="comps">${ev.comp.map(c => `<div class="cp"><span>${c.k}</span><small>${c.w}%</small><div class="btrack"><i style="width:${Math.round(c.q * 100)}%"></i></div><b>${Math.round(c.q * c.w)}</b></div>`).join("")}
      <div class="fine">Weighted sum ×${ev.season.toFixed(2)} season prior, then gates. Overall = sky × site fit. All weights are starting estimates (Sunset Metric Bible v1 §13).</div></div>
      <h3>${DIRW}ern gap ${tag(provenance(r).path)} <small>along the ${EV} line, ${compass(ev.sunsetAz)}</small></h3>
      <div class="pathviz">${ev.path.map(p => `<div class="pv"><div class="pvk">${p.km} km</div>${barRow("Low", p.low)}${barRow("Mid", p.mid)}${barRow("High", p.high)}</div>`).join("")}</div>
      <div class="fine">Clouds 0–200 km toward the sun decide whether light reaches the sky above you. Blocked: <b>${Math.round(ev.slotBlock * 100)}%</b> (low + ½ mid, weighted toward nearby).</div>
      <h3>Clouds overhead at ${EV} ${tag(provenance(r).clouds)}</h3>
      <div>${barRow("High", s.high)}${barRow("Mid", s.mid)}${barRow("Low", s.low)}${barRow("Total", s.total)}</div>
      <div class="ctypes">${(noaaCloudTypes(r) || ev.clouds).map(c => `<div class="ct"><span>${c.level}</span><b>${c.type}</b></div>`).join("")}<div class="fine">Cloud types are inferred from layer cover, instability (CAPE), visibility and weather code — the model doesn't output cloud genus. ${noaaCloudTypes(r) ? "Tonight they're checked against GOES-19 observed cloud phase and top height." : ""} ${tag(provenance(r).types)}</div></div>
      <h3>Cloud timeline</h3>${timeline(r)}
      <h3>Air clarity & moisture ${tag(provenance(r).aod)}</h3>
      <div class="grid">
        <div><span>Aerosol optical depth</span><b>${f(s.aod, 2)}</b></div>
        <div><span>PM2.5 (surface)</span><b>${f(s.pm25, 0, " µg/m³")}</b></div>
        <div><span>Dust</span><b>${f(s.dust, 0, " µg/m³")}</b></div>
        <div><span>Visibility</span><b>${s.vis != null ? (s.vis / 1609).toFixed(s.vis < 16000 ? 1 : 0) + " mi" : "—"}</b></div>
        <div><span>RH surface</span><b>${f(s.rh, 0, "%")}</b></div>
        <div><span>RH 850 hPa (~1.5 km)</span><b>${f(s.rh850, 0, "%")}</b></div>
        <div><span>RH 300 hPa (cirrus level)</span><b>${f(s.rh300, 0, "%")}</b></div>
        <div><span>Dew-point spread</span><b>${f(ev.dewDep, 0, "°F")}</b></div>
        <div><span>Clean-air index</span><b>${Math.round(ev.clean * 100)}/100</b></div>
      </div>
      <h3>Fronts & pressure ${tag(provenance(r).front)}</h3>
      <div class="grid">
        <div><span>Pressure</span><b>${f(s.pres, 0, " hPa")}</b></div>
        <div><span>Δ 6 h</span><b>${ev.dP6 >= 0 ? "+" : ""}${f(ev.dP6, 1, " hPa")}</b></div>
        <div><span>Δ 24 h</span><b>${ev.dP24 >= 0 ? "+" : ""}${f(ev.dP24, 1, " hPa")}</b></div>
        <div><span>Dew pt Δ 24 h</span><b>${ev.dDew >= 0 ? "+" : ""}${f(ev.dDew, 0, "°F")}</b></div>
        <div><span>Front passage</span><b>${ev.fropaH != null ? "~" + ev.fropaH + " h ago" : "none in 36 h"}</b></div>
        <div><span>Rain last 24 h</span><b>${f(ev.priorRain, 1, " mm")}</b></div>
      </div>
      <div class="fine">Front timing is estimated from a ≥6 °F dew-point drop in the forecast series — a proxy, not an analyzed front.</div>
      <h3>Site & horizon</h3>
      <div class="grid">
        <div><span>Open view</span><b>${ev.siteInfo.arc[0]}°–${ev.siteInfo.arc[1]}°</b></div>
        <div><span>${Ev} azimuth</span><b>${Math.round(ev.sunsetAz)}° ${ev.siteInfo.inArc ? "✓" : "✗"}</b></div>
        <div><span>Horizon obstruction</span><b>~${ev.siteInfo.obst}°</b></div>
        <div><span>Water toward ${EV}</span><b>${ev.siteInfo.water ? "Yes" : "No"}</b></div>
        <div><span>Wind</span><b>${Math.round(s.wind)} mph ${compass(s.wdir)}</b></div>
        <div><span>Gusts</span><b>${Math.round(s.gust)} mph</b></div>
      </div>
      <div class="fine">${ev.siteInfo.surface}. View arcs and obstruction angles are hand-estimated per spot, not from a terrain model.</div>
      <h3>Satellite imagery read <small>pixel heuristic on GOES tiles — secondary to the NOAA L2 products above</small> <span class="src est">Estimate</span></h3>
      <div id="satread" class="satread"><div class="shimmer">Sampling GOES-East visible, cirrus & infrared around this spot…</div></div>
      <div class="actions"><a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${vPos(sp).join(",")}">Directions ↗</a><button class="btn ghost" id="zoomto">Show on map</button></div>`;
    { const st = document.querySelector(".stage"), zs = $("#pv-zoom"), zo = $("#pv-zo");
      const setZ = z => { z = Math.max(0.55, Math.min(4, z)); state.zoom = z; zs.value = z; zo.textContent = z.toFixed(1) + "×"; window.__agQueue && __agQueue(); };
      if (st && zs) { zs.oninput = () => setZ(+zs.value); { const R0 = state.results.find(x => x.spot.id === id), S0 = window.AGX && AGX.sea(R0.spot, { dir: (R0.ev.s || {}).wdir, mph: (R0.ev.s || {}).wind }); setZ(keepScroll ? (state.zoom || 1) : id === "lionsbridge" || id === "roanokemarshes" ? 0.6 : (S0 && S0.surf && S0.ft >= 1.5 ? (/[?&]hero=0/.test(location.search) ? 2.4 : 1.3) : 1)); } zs.addEventListener("change", () => state.zoom = +zs.value);
        let d0 = 0, z0 = 1; const dist = e => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        st.addEventListener("touchstart", e => { if (e.touches.length === 2) { d0 = dist(e); z0 = +zs.value; } }, { passive: true });
        st.addEventListener("touchmove", e => { if (e.touches.length === 2 && d0) { e.preventDefault(); setZ(z0 * dist(e) / d0); state.zoom = +zs.value; } }, { passive: false });
        st.addEventListener("touchend", () => { d0 = 0; }, { passive: true });
        st.addEventListener("dblclick", e => { if (e.target.closest && e.target.closest(".stage-rail,.stage-top")) return; setZ(id === "lionsbridge" ? 0.6 : 1); state.zoom = +zs.value; });
        st.querySelectorAll(".rail-zoom .zb").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); setZ((+zs.value) * (b.dataset.z === "+" ? 1.25 : 0.8)); state.zoom = +zs.value; }));   // d21L: zoom − / + in the right rail (pinch, wheel and double-tap still work on the render)
        { const ro = $("#pv-ro"); if (ro) ro.addEventListener("toggle", () => { state.roClosed = !ro.open; }); }
        st.addEventListener("wheel", e => { if (e.target.closest && e.target.closest(".pv-wxl")) return; e.preventDefault(); const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1; setZ((+zs.value) * Math.exp(-e.deltaY * k * (e.ctrlKey ? 0.01 : 0.0018))); state.zoom = +zs.value; }, { passive: false }); } }   // v21: mouse-wheel / trackpad-pinch zoom on the render
    { const st = document.querySelector(".stage"), lb = $("#pv-look");   // d28z5: 360° free-look camera — drag pans the real azimuth (sun, moon, stars, landmarks stay put), pinch/wheel/± zoom
      if (st && lb) { const sync = () => { lb.classList.toggle("on", !!state.look); lb.setAttribute("aria-pressed", state.look ? "true" : "false"); st.classList.toggle("looking", !!state.look); };
        state.look = false; state.yaw = 0; state.lpitch = 0; sync();
        lb.addEventListener("click", e => { e.stopPropagation(); state.look = !state.look; state.yaw = 0; state.lpitch = 0; sync(); window.__agQueue && __agQueue(); });
        let p0 = null; const skip = e => e.target.closest && e.target.closest(".stage-rail,.stage-bottom,.stage-top,button,input,a,details");
        st.addEventListener("pointerdown", e => { if (window.__agLookPro || !state.look || skip(e) || (e.pointerType === "touch" && !e.isPrimary)) return; p0 = { x: e.clientX, y: e.clientY, yaw: state.yaw, pt: state.lpitch, id: e.pointerId }; });
        st.addEventListener("pointermove", e => { if (!p0 || e.pointerId !== p0.id) return; const H = st.clientHeight || 600, ppd = H / (st.clientWidth / H < 1 ? 62 : 50) * (state.zoom || 1);
          state.yaw = ((p0.yaw - (e.clientX - p0.x) / ppd) % 360 + 540) % 360 - 180; state.lpitch = Math.max(-8, Math.min(25, p0.pt + (e.clientY - p0.y) / ppd)); window.__agQueue && __agQueue(); });
        const end = () => { p0 = null; }; st.addEventListener("pointerup", end); st.addEventListener("pointercancel", end);
        st.addEventListener("touchstart", e => { if (e.touches.length > 1) p0 = null; }, { passive: true });
        st.addEventListener("touchmove", e => { if (state.look && p0 && e.touches.length === 1) e.preventDefault(); }, { passive: false }); } }
    document.body.classList.add("detail-open");
    $("#detail").classList.add("open");
    Object.keys(markers).forEach(k => { const ic = markers[k]._icon; if (ic) ic.classList.toggle("sel", k === id); });
    if (isDesk()) { deskTop(); setTimeout(() => map.invalidateSize({ pan: false }), 480); }   // v21: docked panel narrows the map
    el.scrollTop = keepScroll ? scroll : 0;
    wireStage(r, keepScroll && state.pvSpot === id ? state.pvT : null);
    wireEvToggle();
    $("#zoomto").onclick = () => { closeDetail(); map.flyTo(vPos(sp), 10, { duration: 1.2 }); };
    if (state.arch) { const bx = $("#satread"); if (bx) bx.innerHTML = `<p>Satellite read is only for live forecasts — this is a past prediction.</p>`; return; }
    const elevNow = sunPos(Date.now() / 1000, sp.lat, sp.lng).elev;
    const res = await Sat.readSpot(sp, sp.west, elevNow);
    if (state.spot !== id) return;
    const box = $("#satread"); if (!box) return;
    box.innerHTML = res.error ? `<p>${res.error}</p>` : `<ul>${res.text.map(t => `<li>${t}</li>`).join("")}</ul><div class="fine">Sampled from GOES-19 (GOES-East) ABI band 2 (visible, 0.64 µm), band 4 (cirrus, 1.37 µm) and band 13 (clean IR, 10.3 µm) at ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(res.when)}. Pixel-color heuristics, not calibrated retrievals.</div>`;
  }
  function closeDetail() { try { document.querySelectorAll("#detail canvas").forEach(c => relGL(c)); } catch (e) {} hmDrop(); HM.fails = 0; HM.twoD = false; setTimeout(() => HM.go && HM.go(), 300); { let AW = window.AGWind; try { AW = AW || (window.parent !== window && window.parent.AGWind); } catch (e) {} if (AW) AW.set(0, false); } if (window.__agAnim && window.__agAnim.id) { cancelAnimationFrame(window.__agAnim.id); window.__agAnim.id = 0; } state.spot = null; $("#detail").classList.remove("open"); document.body.classList.remove("detail-open"); Object.keys(markers).forEach(k => { const ic = markers[k]._icon; if (ic) ic.classList.remove("sel"); }); if (isDesk()) setTimeout(() => map.invalidateSize({ pan: false }), 480); }
  $("#detail-close").addEventListener("click", closeDetail);
  $("#scrim").addEventListener("click", closeDetail);
  document.addEventListener("keydown", e => { if (e.key !== "Escape") return; 
    const fb = document.getElementById("fb-panel"); if (fb && fb.classList.contains("open")) { fb.classList.remove("open"); return; }
    if (state.wxOpen && state.spot) { state.wxOpen = false; const wl = $("#pv-wxl"); if (wl) wl.dataset.tx = ""; window.__agQueue && __agQueue(); return; }
    closeDetail(); });
  // v21: keyboard — ←/→ move the time slider (Shift = 5 min, else 1 min; Home/End = ends), Space = play/pause, Esc closes panels
  // Keys typed while the outer shell page has focus (before the first click into the app) are forwarded here once per shell.
  window.__agKey = e => { if (e.defaultPrevented) return; const ev = new KeyboardEvent("keydown", { key: e.key, code: e.code, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, bubbles: true, cancelable: true });
    document.dispatchEvent(ev); if (ev.defaultPrevented || e.key === "Escape") e.preventDefault(); };
  try { const P = window.parent; if (P !== window && P.document) { P.__agKeyWin = window;
    if (!P.__agKeyFwd) { P.__agKeyFwd = 1; P.document.addEventListener("keydown", e => { const tn = e.target && e.target.tagName; if (tn === "INPUT" || tn === "TEXTAREA" || tn === "BUTTON") return; try { P.__agKeyWin && P.__agKeyWin.__agKey && P.__agKeyWin.__agKey(e); } catch (x) {} }); } } } catch (x) {}
  document.addEventListener("keydown", e => {
    if (!state.spot || e.altKey || e.metaKey || e.ctrlKey) return;
    const tg = e.target, tn = tg && tg.tagName, typing = tn === "TEXTAREA" || tn === "SELECT" || (tn === "INPUT" && tg.type !== "range") || (tg && tg.isContentEditable);
    if (typing || (tg && tg.id === "pv-zoom")) return;
    const sl = $("#scrub"); if (!sl) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
      e.preventDefault(); const pb = $("#pv-play"); if (pb && /Pause/.test(pb.textContent)) pb.click();
      const step = e.shiftKey ? 300 : 60, v = e.key === "Home" ? +sl.min : e.key === "End" ? +sl.max : +sl.value + (e.key === "ArrowRight" ? step : -step);
      sl.value = Math.max(+sl.min, Math.min(+sl.max, v)); sl.dispatchEvent(new Event("input")); clearTimeout(window.__agKeyHq); window.__agKeyHq = setTimeout(() => sl.dispatchEvent(new Event("change")), 200); return; }
    if (e.key === " " || e.code === "Space") { if (tn === "BUTTON" || tn === "A" || tn === "SUMMARY") return;   // native activation
      e.preventDefault(); const pb = $("#pv-play"); if (pb) pb.click(); }
  });

  // regions
  $("#regions").innerHTML = Object.entries(REGIONS).map(([k, v]) => `<button class="chip ${k === "all" ? "on" : ""}" data-r="${k}">${v.name}</button>`).join("");
  document.querySelectorAll("[data-r]").forEach(b => b.addEventListener("click", () => {
    state.region = b.dataset.r; document.querySelectorAll("[data-r]").forEach(x => x.classList.toggle("on", x === b));
    const reg = REGIONS[state.region].states;
    const pts = SPOTS.filter(s => !reg || reg.includes(s.state)).map(s => [s.lat, s.lng]);
    map.flyToBounds(pts, { padding: [40, 40], duration: 1 });
    const list = filtered(); renderHero(list); renderBonus(list); renderList(list);
  }));
  $("#nearme").addEventListener("click", () => {
    if (!navigator.geolocation) return;
    $("#nearme").textContent = "Locating…";
    navigator.geolocation.getCurrentPosition(p => {
      state.userLoc = { lat: p.coords.latitude, lng: p.coords.longitude };
      L.circleMarker([state.userLoc.lat, state.userLoc.lng], { radius: 7, color: "#fff", fillColor: "#5ab0ff", fillOpacity: 1, weight: 2 }).addTo(map);
      const near = SPOTS.map(s => [dist(state.userLoc, s), s]).sort((a, b) => a[0] - b[0]).slice(0, 5).map(x => [x[1].lat, x[1].lng]);
      map.flyToBounds([[state.userLoc.lat, state.userLoc.lng], ...near], { padding: [40, 40] });
      $("#nearme").textContent = "📍 Near me ✓"; const list = filtered(); renderList(list);
    }, () => { $("#nearme").textContent = "📍 Location blocked"; });
  });

  // regional satellite gallery
  function renderSatGallery(sector = "se", band = "GEOCOLOR") {
    const u = `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/${sector}/${band}/600x600.jpg?_=${Math.floor(Date.now() / 300000)}`;
    $("#satimg").src = u;
    $("#satcap").textContent = `${sector === "ne" ? "Northeast" : "Southeast"} sector · ${band === "GEOCOLOR" ? "GeoColor (true-color by day, IR at night)" : band === "02" ? "Band 2 visible — texture & haze" : band === "04" ? "Band 4 cirrus (1.37 µm) — thin high cloud glows, low cloud stays dark" : "Band 13 infrared — cloud-top temperature"} · NOAA/NESDIS STAR, updates every ~5 min`;
    document.querySelectorAll("[data-sec]").forEach(b => b.classList.toggle("on", b.dataset.sec === sector));
    document.querySelectorAll("[data-band]").forEach(b => b.classList.toggle("on", b.dataset.band === band));
    state.sec = sector; state.band = band;
  }
  document.querySelectorAll("[data-sec]").forEach(b => b.addEventListener("click", () => renderSatGallery(b.dataset.sec, state.band)));
  document.querySelectorAll("[data-band]").forEach(b => b.addEventListener("click", () => renderSatGallery(state.sec, b.dataset.band)));
  renderSatGallery("se", "GEOCOLOR");


  // ---------- Archive: past predictions ----------
  // 1) Every forecast this device loads is saved per calendar day (compact: score, rainbow, lightning, Trifecta per spot).
  //    The newest save before the day happens wins, so each archived day keeps the LAST forecast made for it; days you
  //    opened are marked "viewed". Kept 30 days, per mode, in localStorage.
  // 2) Any of the last 14 days can be replayed in full (map, list, sky animation) from NOAA HRRR/GFS short-range model
  //    hours (Open-Meteo past_days) — labelled clearly as a past prediction / model replay, not a live forecast.
  const AK = "afterglow-archive-" + MODE, AKEEP = 30, PAST = 30;   // d25m: 30 past-day cards, loaded in chunks (7 newest first, then 8-day chunks on scroll)
  const ymd = (t, tz) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }).format(new Date(t * 1000));
  const todayKey = () => ymd(Date.now() / 1000, "America/New_York");
  const archLoad = () => { const a = lsGet(AK); return a && typeof a === "object" && a.days ? a : { v: 1, days: {} }; };
  const archTrim = a => { const ks = Object.keys(a.days).sort(); while (ks.length > AKEEP + 8) delete a.days[ks.shift()]; return a; };
  function archSnap(dayIdx, viewed) {
    const d = state.data; if (!d || state.arch || !d.S[0]) return;
    const S0 = d.S[0], key = ymd(S0.daily.time[dayIdx] + 43200, S0.timezone);
    const rows = SPOTS.map((sp, k) => { const ev = evaluate(sp, d.S[k], [d.W[k * 3], d.W[k * 3 + 1], d.W[k * 3 + 2], d.WF && d.WF[k]], d.E[k], dayIdx, d.AQ && d.AQ[k]);
      return [sp.id, ev.score, ev.bonus.bow.p, ev.bonus.dog.p, ev.wx.items.map(w => w.icon).join(""), ev.tri.on ? 1 : 0, ev.tSet, ev.wx.bolt ? ev.wx.bolt.p : 0]; });
    const a = archLoad(), prev = a.days[key] || {};
    if (prev.at && (d.at || 0) < prev.at && !viewed) return;   // never let an older cached forecast overwrite a newer save
    a.days[key] = { key, at: d.at || Date.now(), lead: dayIdx, rows, viewed: prev.viewed || !!viewed, viewedAt: viewed ? Date.now() : prev.viewedAt || null, first: prev.first || d.at || Date.now(), tz: S0.timezone };
    lsSet(AK, archTrim(a));
  }
  function archSaveAll() { try { if (!state.data || state.arch) return; state.data.S[0].daily.time.forEach((t, i) => archSnap(i, false)); } catch (e) { console.warn("archive save", e); } }
  function archViewed() { try { archSnap(state.day, true); } catch (e) { console.warn("archive view", e); } }
  const spotName = id => { const s = SPOTS.find(x => x.id === id); return s ? `${s.name}, ${s.state}` : id; };
  const dayLbl = key => { const [y, m, dd] = key.split("-").map(Number); return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, dd, 12))); };
  function pastKeys() {
    const out = [], now = new Date(); const tk = todayKey();
    for (let k = 1; k <= AKEEP; k++) { const d = new Date(now.getTime() - k * 86400000); out.push(new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/New_York" }).format(d)); }
    return [...new Set(out)].filter(k => k < tk);
  }
  function savedSummary(e) {
    const rows = e.rows.slice().sort((a, b) => b[1] - a[1]), b = rows[0], lb = label(b[1]);
    const nb = rows.filter(r => r[2] >= BONUS_MIN).length, nl = rows.filter(r => r[4].includes("⚡")).length, nt = rows.filter(r => r[5]).length;
    return { rows, b, lb, nb, nl, nt };
  }
  // d25j: past days were stuck on iPhone: 3 sequential requests (86 spots + 258 path + 172 east points) x past_days=30 — ~10 MB of JSON and
  // a weighted Open-Meteo cost far over the per-minute quota right after the live load, so it hit 429 and sat in 45 s timeouts + retries.
  // Now: 7 days, 4 parallel requests (spots in 3 slices; one 120 km sun-path point per spot reused for the 3 path slots; the spot stands in for the
  // anti-solar points), one try, 15 s cap, started in the background after the live forecast renders. Cards show "…" then the score, or "—".
  // d25m: chunks of past days by explicit date range. Chunk 0 = the 7 newest days (loaded in the background after the live forecast);
  // older chunks (8 days each) load only when their cards scroll near view. One try, 25 s cap (older archive days can take 7–15 s), one chunk at a time, no retry storm; a failed chunk shows "↻ retry" and reloads only when tapped.
  // Best scores cached per day in localStorage so repeat visits show them instantly (the replay data itself is refetched on tap).
  const PBK = "afterglow-pastbest-" + MODE, pbLoad = () => lsGet(PBK) || {}, pbSave = o => { try { const ks = Object.keys(o).sort(); while (ks.length > 40) delete o[ks.shift()]; localStorage.setItem(PBK, JSON.stringify(o)); } catch (e) {} };
  const chunkOf = k => { const a = pastKeys().indexOf(k); return a < 0 ? -1 : a < 7 ? 0 : 1 + Math.floor((a - 7) / 8); };
  const chunkKeys = c => pastKeys().filter(k => chunkOf(k) === c);
  const CH = {}; let pastErr = null, pastQ = Promise.resolve();
  function loadChunk(c) {
    if (CH[c] && (CH[c].data || CH[c].busy)) return CH[c].busy || Promise.resolve(CH[c].data);
    const n0 = (CH[c] && CH[c].n) || 0; const ks = chunkKeys(c).sort(); if (!ks.length) return Promise.reject(new Error("no days"));
    const d0 = new Date(Date.parse(ks[0] + "T12:00:00Z") - 86400000).toISOString().slice(0, 10), ex = { start_date: d0, end_date: ks[ks.length - 1] };
    const T = (pr, ms) => Promise.race([pr, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]), H = Math.ceil(SPOTS.length / 3);
    CH[c] = { busy: null, n: n0 };
    const run = () => T(Promise.all([0, 1, 2].map(q => fetchBatch(SPOTS.slice(q * H, q * H + H), SPOT_VARS, "sunset,sunrise", API, "gfs_seamless", 1, ex))
        .concat([fetchBatch(SPOTS.map(s => s.path[1]), WEST_VARS, null, API, "gfs_seamless", 1, ex)])), 25000).then(R => {
      const S = R.slice(0, 3).flat(), Wm = R[3], D = { at: Date.now(), S, W: SPOTS.flatMap((_, i) => [Wm[i], Wm[i], Wm[i]]), E: S, AQ: null, fcModel: "noaa", prov: {}, past: true };
      const S0 = S[0], pb = pbLoad(); S0.daily.time.forEach((t, i) => { const k = ymd(t + 43200, S0.timezone); if (ks.includes(k)) try { pb[k] = bestOf(D, i); } catch (e) {} }); pbSave(pb);
      CH[c] = { data: D };
      if (window.AGX && AGX.loadBuoys) AGX.loadBuoys().then(() => { if (state.arch && window.__agQueue) window.__agQueue(); if (state.arch) update(); }).catch(() => {});   // d25p: that chunk's own archived waves/swell (background)
      return D; });
    CH[c].busy = pastQ = pastQ.catch(() => {}).then(run).catch(e => { const n = ((CH[c] && CH[c].n) || 0) + 1; console.warn("past chunk " + c, e);
      if (n <= 3) { CH[c] = { err: e, n, retrying: true }; setTimeout(() => { if (CH[c] && CH[c].retrying) { CH[c] = { n }; loadChunk(c).catch(() => {}); } }, [10000, 30000, 90000][n - 1] * (e && e.status === 429 ? 2 : 1)); }   // d25y: auto-retry with backoff
      else CH[c] = { err: e, n }; throw e; }).finally(() => { if ($("#days") && state.data) renderDays(); });
    return CH[c].busy;
  }
  const loadPast = () => loadChunk(0);
  function pastNear() {   // load chunks whose cards are within ~1.5 screens of the visible part of the row
    const box = $("#days"); if (!box) return; const L = box.scrollLeft - box.clientWidth * 1.5, R = box.scrollLeft + box.clientWidth * 2.5;
    box.querySelectorAll(".day[data-past]").forEach(b => { const c = chunkOf(b.dataset.past), x = b.offsetLeft - box.firstElementChild.offsetLeft; if (c > 0 && !CH[c] && x > L && x < R && CH[0] && CH[0].data) loadChunk(c).catch(() => {}); });
  }
  window.__agGoPast = k => enterArchive(k);   // feedback: "switch to the photo's date"
  window.__agPastKeys = () => pastKeys().slice(0, PAST);
  async function enterArchive(key, btn) {
    if (btn) { btn.classList.add("busy"); const d3 = btn.querySelector(".d3"); if (d3 && !(CH[chunkOf(key)] || {}).data) d3.textContent = "…"; }
    try {
      const P = await loadChunk(chunkOf(key)), S0 = P.S[0];
      const idx = S0.daily.time.findIndex(t => ymd(t + 43200, S0.timezone) === key);
      if (idx < 0) throw new Error("day not in replay window");
      if (!state.arch) state.live = { data: state.data, day: state.day, noaa: state.noaa, gN: window.AGNoaa };
      state.arch = { key, P }; state.data = P; state.day = idx; state.noaa = null; if ("AGNoaa" in window) window.AGNoaa = null;
      closeDetail(); document.body.classList.add("in-archive"); update(); renderArchBar();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      console.warn("archive replay failed", e);
      if (btn) { btn.classList.remove("busy"); const d3 = btn.querySelector(".d3"); if (d3) d3.textContent = e && e.status === 429 ? "busy" : "—"; }
    }
  }
  function exitArchive(quiet) {
    if (!state.arch) return; const L0 = state.live;
    state.arch = null; state.data = L0.data; state.day = L0.day; state.noaa = L0.noaa; if ("AGNoaa" in window) window.AGNoaa = L0.gN;
    document.body.classList.remove("in-archive"); closeDetail(); if (!quiet) update(); renderArchBar();
  }
  function renderArchBar() {
    const bar = $("#archbar"); if (!bar) return;
    if (!state.arch) { bar.hidden = true; bar.innerHTML = ""; return; }
    const S0 = state.data.S[0], key = ymd(S0.daily.time[state.day] + 43200, S0.timezone), e = archLoad().days[key];
    let cmp = "";
    if (e && e.rows) { const s = savedSummary(e); cmp = ` · Your saved forecast that day: best <b>${spotName(s.b[0])} ${s.b[1]}</b> (${e.lead === 0 ? "same day" : e.lead + "d ahead"})${e.viewed ? " 👁" : ""}`; }
    bar.hidden = false;
    bar.innerHTML = `<div><b>Past · ${dayLbl(key).replace(/^\w+, /, "")}</b><span>Replayed from NOAA HRRR/GFS short-range model hours — not a live forecast, not a photo${cmp}</span></div><button id="arch-exit" class="pill">↩ ${RISE ? "Today" : "Tonight"}</button>`;
    $("#arch-exit").onclick = exitArchive;
  }

  // boot
  // d25y: the loading screen waits only for the forecast itself; NOAA HRRR overrides + marine join within 1.2 s or are applied when they land
  const nP = loadNoaa(), mP = loadMarine().catch(() => null), soon = p => Promise.race([p, sleep(1200).then(() => undefined)]);
  window.__agT0 = performance.now();
  loadData().then(async d => { const [N, MW] = await Promise.all([soon(nP), soon(mP)]); return [d, N, MW]; }).then(([d, N, MW]) => {
    if (N === undefined) nP.then(N2 => { state.noaa = N2; window.AGNoaa = N2; if (!state.arch && state.data) { applyNoaa(state.data, N2); update(); } });
    if (MW === undefined) mP.then(M2 => { if (state.data && !state.arch) { applyMarine(state.data, M2); update(); } });
    applyMarine(d, MW || null); state.marineW = MW || null; N = N || null; state.noaa = N; window.AGNoaa = N; window.AGDay = () => state.day; applyNoaa(d, N); state.data = d;
// (removed)     if (RISE && d.S[0] && d.S[0].daily.sunrise[0] + 3600 < Date.now() / 1000) { state.day = 1; state.autoDay = true; }   // this morning's sunrise is over → show tomorrow
    archSaveAll(); update();
    $("#loading").classList.add("done"); window.__agLiveMs = Math.round(performance.now() - window.__agT0);
    // d25y: past days start only once the LIVE forecast is in (after the background refresh when we started from cache), so they never compete with it
    const pastGo = () => /[?&]prefetch=1/.test(location.search) ? 0 : setTimeout(() => loadPast().catch(() => {}), 3000);
    if (d.bg) d.bg.then(d2 => { if (state.arch) { state.live.data = d2; } else { applyMarine(d2, state.marineW || null); applyNoaa(d2, state.noaa); state.data = d2; archSaveAll(); update(); } }).catch(e => console.warn("background refresh", e)).finally(pastGo);
    else if (!d.snapshot) pastGo();
    // Draft: refresh forecast + renderings every 15 min (skipped while replaying the archive)
    // d24: CURRENT-DAY auto-refresh (Sean): every 15 min while the app is open, and on returning to the tab if a cycle is due — no reload,
    // music keeps playing. Each cycle: model clouds by layer (refetched when > 28 min old), marine, then the observed sky for today's events
    // (METARs, NEXRAD, GOES visible + IR with a fresh 5-min tile key, the low-sun visible cloud canvas), staggered with the open spot and
    // the spots in view first. Scores, pins and the open render recompute; "Updated h:mm" shows the last cycle. Past/future days: no-op.
    let cycAt = Date.now(), cycBusy = false;
    const stamp = () => { let e = document.getElementById("ag-upd"); const u = $("#updated"); if (!e && u) { e = document.createElement("div"); e.id = "ag-upd"; e.className = "updated ag-upd"; e.style.cssText = "font-size:11px;opacity:.75;margin-top:2px"; u.after(e); }
      if (e) e.textContent = "Updated " + new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(cycAt)) + " · auto-refresh every 15 min"; };
    const cycle = async () => { if (state.arch || cycBusy) return; cycBusy = true;
      try { const [d2, MW2] = await Promise.all([loadData(true), loadMarine()]); applyMarine(d2, MW2); applyNoaa(d2, state.noaa); state.data = d2; archSaveAll(); update(); if (window.AGX) AGX.refresh(SPOTS);
        await obsTick(); if (state.spot && document.body.classList.contains("detail-open")) openDetail(state.spot, true); cycAt = Date.now(); stamp(); }
      catch (e) { console.warn("auto-refresh", e); } finally { cycBusy = false; } };
    window.__agCycle = cycle;
    setInterval(() => { if (!document.hidden) cycle(); }, 15 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - cycAt > 15 * 60 * 1000) cycle(); });
    setTimeout(stamp, 0);
    if (window.AGX) AGX.refresh(SPOTS);
    // d15: observed sky (METAR + GOES + latest model) for today's events → re-score + re-render when it lands, and every 10 min
    const obsTick = () => { if (!window.AGObs || state.arch) return; const D = state.data, today = SPOTS.map((spot, k) => ({ spot, ev: evaluate(spot, D.S[k], [D.W[k * 3], D.W[k * 3 + 1], D.W[k * 3 + 2], D.WF && D.WF[k]], D.E[k], 0, D.AQ && D.AQ[k]) }));
      window.AGPrio = r => (state.spot === r.spot.id ? 0 : map.getBounds().contains([r.spot.lat, r.spot.lng]) ? 1 : 2);
      return AGObs.refresh(SPOTS, today, 0).then(ch => { if (ch) update(); }).catch(e => console.warn("obs", e)); };
    (window.AGObs && AGObs.cvSnap || Promise.resolve()).then(obsTick);   // d24: first pass once the satellite-canvas snapshot is in; later passes ride the 15-min cycle
    // Afterglow Real deep link: ?mode=sunset&spot=clearwater&t=peak&play=1
    { const q = new URLSearchParams(location.search), id = q.get("spot");
      if (q.get("day") != null && state.data.S[0].daily.time[+q.get("day")] != null) { state.day = +q.get("day"); state.autoDay = false; update(); }
      if (id && state.results.some(x => x.spot.id === id)) Promise.resolve(openDetail(id)).then(() => { const sl = $("#scrub"); if (q.get("t") && sl) { const T = state.results.find(x => x.spot.id === id).ev.timing; const R2 = state.results.find(x => x.spot.id === id).ev, bw = R2.bonus && R2.bonus.bow && R2.bonus.bow.win; sl.value = q.get("t") === "peak" ? T.peak : q.get("t") === "bow" && bw ? (bw.start + bw.end) / 2 : +q.get("t"); sl.dispatchEvent(new Event("input")); } if (q.get("play") === "1") setTimeout(() => { const b = $("#pv-play"); if (b) b.click(); }, 700); }); }
    $("#updated").innerHTML = "Forecast updated " + new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(d.at)) +
      (d.snapshot ? ` · <span class="src fb">Snapshot</span> live forecast busy — showing NOAA data saved ${fmtClock(new Date(d.at).toISOString())}` : d.stale ? ` · <span class="src fb">Cached</span> live forecast busy — using last download` : "") +
      (d.lite ? ` · <span class="src fb">Reduced</span> core cloud/wind variables only` : "") +
      (d.fcModel === "fallback" ? ` · <span class="src fb">Fallback</span> NOAA mirror unreachable — Open-Meteo best-match` : ` · <span class="src model">NOAA model</span> HRRR→GFS`) +
      (N ? ` · <span class="src obs">NOAA obs</span> GOES-19 L2 ${N.goes && N.goes.products.ACM ? fmtClock(N.goes.products.ACM.scan_utc) : "n/a"}${N.hrrr ? `, HRRR ${new Date(N.hrrr.cycle_utc).toISOString().slice(11, 13)}Z direct` : ""}${N.metar ? `, METAR` : ""}` : ` · <span class="src fb">NOAA direct feed offline</span>`);
  }).catch(err => {
    console.error(err);
    $("#loading").innerHTML = `<div class="neutral-scene" aria-hidden="true"><div class="ns-sky"></div><div class="ns-sea"></div></div><div class="err ns-msg"><b>Forecast unavailable</b><br>Couldn't reach the forecast service (Open-Meteo). Check your connection and <a href="#" onclick="location.reload();return false">tap to retry</a>.</div>`;
  });
})();
