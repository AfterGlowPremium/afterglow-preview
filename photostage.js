// Spot-detail "predicted sunset" stage: live physically-based render (photoreal.js) for every slider position,
// plus an optional AI photo-finish pass (server-side SD-Turbo img2img of our own render) at key moments of the evening,
// cross-faded as you scrub. Falls back to the old canvas illustration if WebGL2 is missing.
(function (g) {
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  // Canvas illustration (preview.js) is the default (that's what GitHub Pages ships).
  // Opt in to the photoreal WebGL sky + AI photo finish with ?realistic=1 (or set localStorage.afterglowRealistic = "1").
  let REAL = false;
  try { REAL = g.AG ? !!g.AG.realistic : new URLSearchParams(location.search).get("realistic") === "1"; } catch (e) {}
  const CANVAS_ONLY = !REAL;
  const live = () => !CANVAS_ONLY && g.Photoreal && g.Photoreal.supported();

  // Cloud layers at the exact slider time: HRRR hours (NOAA direct, interpolated) fused with GOES-19 observed cloud now.
  // Rule: if the satellite/model says there is cloud at this spot/time, the render must show it (never thinner than the data).
  function cloudsAt(spot, ev, t) {
    const s = ev.s, N = g.AGNoaa, out = { high: (s.high || 0) / 100, mid: (s.mid || 0) / 100, low: (s.low || 0) / 100, midKm: 4.5, gap: 0, src: "model@event" };
    if (!N) return out;
    const H = N.hrrr && N.hrrr.hours ? Object.keys(N.hrrr.hours).map(Number).sort((a, b) => a - b) : [];
    const pick = id => { let a = null, b = null; for (const k of H) { const x = N.hrrr.hours[k][id]; if (!x) continue; if (k <= t) a = [k, x]; if (k >= t && !b) b = [k, x]; }
      if (!a && !b) return null; if (!a || !b || a[0] === b[0]) return (a || b)[0] && Math.abs((a || b)[0] - t) < 5400 ? (a || b)[1] : null;
      const f = (t - a[0]) / (b[0] - a[0]), L = k => a[1][k] == null || b[1][k] == null ? (a[1][k] ?? b[1][k]) : a[1][k] + (b[1][k] - a[1][k]) * f;
      return { high: L("high"), mid: L("mid"), low: L("low"), cbase_m: L("cbase_m") }; };
    const hs = pick(spot.id);
    if (hs) { out.high = (hs.high || 0) / 100; out.mid = (hs.mid || 0) / 100; out.low = (hs.low || 0) / 100; out.src = "HRRR@t";
      if (hs.cbase_m && hs.cbase_m > 2500 && hs.cbase_m < 8000 && out.mid > 0.3 && out.low < 0.3) out.midKm = hs.cbase_m / 1000; }
    // far horizon toward the sun: open slot if the 120/200 km points are clear of low/mid cloud
    const far = [120, 200].map(km => pick(`${spot.id}@${km}`)).filter(Boolean);
    if (far.length) out.gap = clamp(1 - Math.max(...far.map(x => Math.max(x.low || 0, (x.mid || 0) * 0.85))) / 100);
    // GOES-19 observed now (today only): weight fades over ~4 h from the scan time
    const G = N.goes && N.goes.points && N.goes.points[spot.id], scan = N.goes && N.goes.products && (N.goes.products.ACM || N.goes.products.CTH);
    const today = !g.AGDay || g.AGDay() === 0;
    if (G && scan && today && G.cloud_frac != null) {
      const w = clamp(1 - Math.abs(t - Date.parse(scan.scan_utc) / 1000) / (4 * 3600)), cf = G.cloud_frac * w;
      const tot = G.obs_low + G.obs_mid + G.obs_high || 1;
      out.low = Math.max(out.low, cf * G.obs_low / tot); out.mid = Math.max(out.mid, cf * G.obs_mid / tot); out.high = Math.max(out.high, cf * G.obs_high / tot);
      if (w > 0.2) out.src += "+GOES";
      if (G.cth_km_med && G.obs_mid / tot > 0.5 && !(hs && hs.cbase_m)) out.midKm = clamp(G.cth_km_med - 1.5, 3, 7);
      const fg = N.goes.points[`${spot.id}@120`]; if (fg && fg.cloud_frac != null) out.gap = Math.min(out.gap || 1, clamp(1 - fg.cloud_frac * w - (1 - w) * (1 - (out.gap || 0))));
    }
    out.high = clamp(out.high); out.mid = clamp(out.mid); out.low = clamp(out.low);
    return out;
  }

  // water surface at this exact time from the forecast wind / gusts / waves (Model.seaAt); phase keeps the waves moving with the slider
  function seaP(spot, ev, t) {
    if (spot.water === false) return { chop: 0, swell: 0, caps: 0, phase: 0, sea: null };
    const W = (g.Model.seaAt && g.Model.seaAt(ev, t)) || g.Model.seaState({ wind: ev.s.wind || 0, gust: ev.s.gust || 0 }, 0.5);
    return { chop: W.chop, swell: W.swell, caps: W.caps, phase: (t % 86400) / 420, sea: W };
  }
  function params(spot, ev, t, opt = {}) {
    const pos = g.Model.sunPos(t, spot.lat, spot.lng), s = ev.s;
    const off = ((pos.az - ev.sunsetAz + 540) % 360) - 180;
    // aerosol: NOAA GOES AOD / CAMS when present, else infer from the clean-air score; humid air swells haze
    let aod = s.aod != null ? s.aod : 0.05 + (1 - ev.clean) * 0.45;
    aod *= 1 + Math.max(0, (ev.rhLow || 60) - 70) / 50;
    const seed = (g.Photoreal ? g.Photoreal.hash : () => 0.5)(spot.id + ":" + ev.tSet);
    const C = cloudsAt(spot, ev, t);
    let OB = g.AGObs && g.AGObs.sceneAt ? g.AGObs.sceneAt(spot, ev, t) : { gray: ev.obs ? ev.obs.gray : 0, haze: 0 };
    // d17: sky demos (?sky=clear|partly|broken|overcast, ?wx=partly|rain|storm…) show that sky, not today's observations
    const qp = new URLSearchParams(location.search), skq = qp.get("sky"), wxq = qp.get("wx");
    const DEMO = { broken: { high: 0.3, mid: 0.75, low: 0.45, block: 0.12, gap: 0.9, midKm: 4 }, partly: { high: 0.35, mid: 0.3, low: 0.2, block: 0.15, gap: 0.8 } }[skq];
    if (skq || wxq) OB = { gray: skq === "overcast" || wxq === "rain" || wxq === "storm" ? 1 : 0, haze: wxq === "fog" || wxq === "rain" ? 0.6 : 0 };
    const P = Object.assign({
      elev: pos.elev, sunAzOff: clamp(off + 3, -14, 14),
      high: C.high, mid: C.mid, low: C.low, midKm: C.midKm, gap: C.gap, cloudSrc: C.src,
      // d16: blocked sun AT THE TIME SHOWN (obs near now, model otherwise) → flat gray. d17 fix: aod/rh were commented out by the d15/d16 edit
      block: Math.max(clamp(ev.geoBlock != null ? Math.min(ev.slotBlock || 0, ev.geoBlock + 0.25) : ev.slotBlock || 0), OB.gray), gray: OB.gray,   // d23: light-geometry path (low cloud far out), not the near deck aod: clamp(aod + 0.6 * OB.haze, 0.02, 1.2), rh: Math.max((ev.rhLow || 60) / 100, OB.haze > 0 ? 0.9 + 0.08 * OB.haze : 0),
      water: spot.water !== false, pier: spot.type === "Pier" || spot.type === "Boardwalk",
      // horizon features from the geography table (spots.js SCENE) for the direction you face
      shore: spot.water !== false ? ({ open: 0, lowshore: 0.45, islands: 0.6, skyline: 0.35, bridge: 0.3, trees: 0.8, town: 0.6, hills: 0.4 }[spot.far] ?? (spot.obst >= 0.5 ? clamp(spot.obst / 2, 0.25, 1) : 0)) : 0,
      hills: spot.water === false ? 1 : spot.far === "hills" ? 0.7 : 0,
      city: spot.far === "skyline" ? 1 : 0, bridge: spot.far === "bridge" ? 1 : 0,
      camH: spot.type === "Summit" ? 0.47 : spot.type === "Bluff" ? 0.025 : spot.type === "Dunes" ? 0.03 : 0.0025,
      ...seaP(spot, ev, t),
      seed, wind: seed * 6.283, dog: ev.dog && ev.dog.p >= 15 && pos.elev > 0.3 && pos.elev < 15 ? clamp(ev.dog.p / 60) : 0,
    }, DEMO || {}, opt);
    if (opt.turned) P.sunAzOff = ((off + 180 + 540) % 360) - 180;   // d23: 180° Turn — the real sun azimuth relative to the view behind you
    // d17 afterglow regimes (renderer reads glow / under / tops):
    //  (a) UNDER-LIT: a low/mid deck with an open slot on the horizon toward the sun → light filters underneath, deck bases glow
    //  (b) TOPS/EDGES: a broken/patchy deck → sunlight catches edges and the higher (mid/high) clouds lit from below/behind
    //  solid deck with no gap → d16 gray gating (gray = 1) wins; clear sky → gentle glow only
    // d23 gap lighting: once the sun is under the deck with an open path, the deck reads as BROKEN cells lit gold-orange from below with
    // deep purple-blue gaps (Oct 17 Hampton ground truth), not a flat 100% sheet — open the rendered cover a little and light the edges.
    const gw = !DEMO && !skq && !wxq ? clamp(OB.gapW || 0) : 0;
    if (gw > 0) { P.low = Math.min(P.low || 0, 1 - 0.38 * gw); P.mid = Math.min(P.mid || 0, 1 - 0.22 * gw); }
    const cover = Math.max(P.low || 0, 0.95 * (P.mid || 0));
    let gapH = Math.max(P.gap || 0, 1 - clamp(P.block || 0));
    if (ev.gapOpen != null && !DEMO && !skq) gapH = Math.max(gapH, ev.gapOpen);   // d23: model light-geometry gap (40/120/200 km low cloud)
    if (OB.w && OB.gapObs != null) gapH = gapH * (1 - OB.w) + OB.gapObs * OB.w;            // satellite: open path toward the sun now
    const deck = clamp((cover - 0.3) / 0.4);
    let broken = clamp((cover - 0.15) / 0.2) * (1 - clamp((cover - 0.8) / 0.12));
    if (OB.w && OB.broken != null) broken = Math.max(broken * (1 - OB.w), OB.broken * OB.w); // METAR BKN/SCT (not OVC) near now
    const under = deck * clamp((gapH - 0.25) / 0.45);
    const tops = broken * clamp((P.mid || 0) + 0.7 * (P.high || 0) + 0.4 * (P.low || 0));
    const clearSky = cover < 0.1 && (P.high || 0) < 0.15;
    P.under = under * (1 - P.gray) * (gw > 0 ? 0.42 : 1); P.tops = Math.max(tops, 0.3 * gw) * (1 - P.gray);   // d23: visible, not a wall-to-wall orange wash
    P.glow = (1 - P.gray) * (clearSky ? 1.0 : gw > 0 ? 0.92 + 0.12 * P.under + 0.1 * P.tops : 1.15 + 0.3 * under + 0.2 * tops);
    return P;
  }

  function draw(canvas, spot, ev, t, opt = {}) {
    const lit = g.Preview.state ? g.Preview.state(spot, ev, t) : null;
    const P = params(spot, ev, t, opt); g.PhotoStage && (g.PhotoStage.last = P);
    if (live() && g.Photoreal.render(canvas, P)) return Object.assign({ mode: "live" }, lit);
    const o = g.Preview.draw(canvas, spot, ev, t); o.mode = "canvas"; return o;
  }

  // ---------- AI photo-finish keyframes ----------
  let api = null;
  async function apiOK() {
    if (CANVAS_ONLY) return false;
    if (api !== null) return api;
    try { const r = await fetch("api/health", { cache: "no-store" }); api = r.ok ? await r.json() : false; } catch (e) { api = false; }
    return api;
  }
  function phaseWords(e) {
    if (e > 4) return "golden hour, low warm sun, long golden light";
    if (e > 1) return "late golden hour, sun low above the horizon, warm orange light";
    if (e > -0.9) return "sunset, the sun touching the horizon, glowing orange horizon";
    if (e > -2.5) return "just after sunset, afterglow, clouds lit from below in vivid orange, pink and red";
    if (e > -4.5) return "late afterglow, twilight, pink and magenta clouds fading, deep blue sky above";
    return "blue hour dusk, deep blue sky, soft smooth dim clouds, last thin band of orange on the horizon, long exposure, clean noise-free sky";
  }
  const RISEW = [[/just after sunset, afterglow/, "just before sunrise, dawn glow"], [/late afterglow, twilight/, "early dawn twilight"], [/blue hour dusk/, "blue hour before dawn"], [/^sunset,/, "sunrise,"], [/golden hour, low warm sun/, "morning golden hour, low warm sun"], [/afterglow/g, "dawn glow"]];
  const phaseFor = e => { let s = phaseWords(e); if (g.AG && g.AG.rise) for (const [a, b] of RISEW) s = s.replace(a, b); return s; };
  function prompt(spot, ev, P) {
    const c = [];
    if (P.high > 0.12) c.push(P.high > 0.6 ? "a thin veil of cirrostratus with cirrus streaks" : "wispy cirrus streaks high in the sky");
    if (P.mid > 0.12) c.push(P.mid > 0.85 ? "sky fully covered by a textured altocumulus / altostratus cloud deck" : P.mid > 0.6 ? "a broad altocumulus cloud deck" : "scattered altocumulus clouds");
    if (P.low > 0.2) c.push(P.low > 0.8 ? "overcast low stratocumulus cloud deck" : "low stratocumulus clouds");
    if (P.block > 0.45) c.push("a dark cloud bank along the western horizon");
    if (!c.length) c.push("a clear cloudless sky with a smooth color gradient");
    const wDesc = P.sea ? (P.sea.eff < 3 ? "glassy mirror-calm water" : P.sea.eff < 7 ? "calm rippled water" : P.sea.eff < 11 ? "lightly rippled water" : P.sea.eff < 16 ? "choppy water with scattered whitecaps" : "rough wind-whipped water with many whitecaps") : "calm water";
    const scene = P.water ? (P.pier ? `${wDesc} with the silhouette of a long wooden fishing pier` : spot.type === "Harbor" ? `a harbor with ${wDesc} and a distant low shoreline` : `${wDesc} out to the horizon`) : spot.type === "Summit" ? "layered distant mountain ridges from a summit" : "a coastal landscape";
    const air = P.aod > 0.3 ? "hazy air, softened colors" : P.aod < 0.12 ? "crisp clean air, saturated colors" : "";
    return `a real photograph of a ${phaseFor(P.elev)} over ${scene}, ${c.join(", ")}${air ? ", " + air : ""}, natural colors, landscape photography, shot on a full-frame DSLR, 24mm, sharp, highly detailed, realistic`;
  }
  // key moments chosen by sun elevation so neighbours differ only a little (cross-fades stay clean)
  function keyTimes(spot, ev, t0, t1, peak) {
    const targets = [6, 3, 1, -0.5, -1.6, -2.8, -4, -5.5];
    const out = [];
    for (const tg of targets) {
      let best = null, bd = 1e9;
      for (let t = t0; t <= t1; t += 20) { const d = Math.abs(g.Model.sunPos(t, spot.lat, spot.lng).elev - tg); if (d < bd) { bd = d; best = t; } }
      if (best != null && bd < 0.4) out.push(best);
    }
    if (peak && !out.some(t => Math.abs(t - peak) < 120)) out.push(peak);
    return out.sort((a, b) => a - b);
  }
  const cache = {};   // key -> [{t, url}]
  function photoSet(spot, ev) { const k = spot.id + ":" + ev.tSet; return cache[k] || (cache[k] = { frames: [], busy: false, gen: 0 }); }

  async function ensurePhotos(spot, ev, t0, t1, peak, aspect, onReady) {
    const set = photoSet(spot, ev);
    if (!(await apiOK())) return set;
    if (set.busy) { set.onReady = onReady; return set; }
    set.busy = true; set.onReady = onReady;
    const times = keyTimes(spot, ev, t0, t1, peak);
    // order: best minute first, then outward
    times.sort((a, b) => Math.abs(a - peak) - Math.abs(b - peak));
    const W = aspect >= 1 ? 640 : Math.round(640 * aspect / 8) * 8, H = aspect >= 1 ? Math.round(640 / aspect / 8) * 8 : 640;
    const cv = document.createElement("canvas");
    for (const t of times) {
      if (set.frames.some(f => f.t === t)) continue;
      const P = params(spot, ev, t, { w: W, h: H, grain: 0 });
      if (!g.Photoreal.render(cv, P)) break;
      const img = cv.toDataURL("image/png");
      try {
        const r = await fetch("api/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ img, prompt: prompt(spot, ev, P), strength: P.elev < -4.3 ? 0.3 : 0.45, seed: Math.floor(P.seed * 1e6) }) });
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        const im = new Image(); im.src = j.url; await im.decode().catch(() => {});
        set.frames.push({ t, url: j.url, elev: P.elev }); set.frames.sort((a, b) => a.t - b.t);
        set.onReady && set.onReady(set);
      } catch (e) { console.warn("photo-finish failed", e); break; }
    }
    set.busy = false; set.done = true; set.onReady && set.onReady(set);
    return set;
  }
  // which photo frames to show at time t: [{url, a}] bottom→top
  function photoMix(set, t) {
    const F = set.frames; if (!F.length) return null;
    let a = null, b = null;
    for (const f of F) { if (f.t <= t) a = f; if (f.t >= t && !b) b = f; }
    if (a && b) { if (a === b) return [[a.url, 1]]; const w = (t - a.t) / (b.t - a.t), s = w * w * (3 - 2 * w); return [[a.url, 1], [b.url, clamp((s - 0.2) / 0.6)]]; }
    const f = a || b; return Math.abs(f.t - t) < 150 ? [[f.url, 1]] : null;
  }
  g.PhotoStage = { realistic: REAL, draw, params, cloudsAt, prompt, apiOK, ensurePhotos, photoMix, photoSet, keyTimes, live };
})(window);
