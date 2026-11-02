// d28zzd: ALONG-PATH SOLAR CLOUD SAMPLING (Sean, Nov 2: "never just the clouds overhead — estimate clouds along the entire curvature of
// the Earth as the sun comes up or goes down"). Replaces the overhead-column + single "east gap" shortcut.
// For a spot and event: forecast low/mid/high cloud (Open-Meteo gfs_seamless, the app's model; ONE batched multi-location request per
// spot/mode/day, cached in localStorage, frozen after the event lock) at points every 40 km out to 600 km along the solar azimuth, plus
// 0–240 km along the anti-solar azimuth. Then, for every layer and sky elevation angle a (Earth radius R = 6371 km):
//  (a) line of sight: the ray at elevation a hits layer height h at ground distance x where h = x·tan a + x²/2R  → cover there = coverage
//      and texture of that part of the sky (sunward side for the sun half of the sky, anti-solar for the other half);
//  (b) sun ray to that cloud point: the sun seen from x km sunward stands at e(x) = elev + x/R (rad). Trace the ray back toward the sun:
//      y(s) = h + s·tan e + s²/2R over ground distance s beyond x. Earth's shadow if y < 0 (with ~0.5° refraction); otherwise transmission
//      T = Π (1 − cover_k) over every sample whose layer slab (low 0.3–2 km, mid 2–6.5, high 6.5–13) the ray crosses (own layer ×0.35,
//      the ray only skims its own deck) → under-lighting / shadow;
//  (c) path reddening from the ray's tangent (lowest) height above the ground → colour (low tangent = long path in dense air = red).
// At each point the forecast hour nearest to the event time is used (the sun's ray passes them within the same minutes; the per-time
// call uses the hour nearest to the slider time t).
(function (g) {
  const R = 6371, RAD = Math.PI / 180, DEG = 180 / Math.PI, clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const DS = []; for (let k = 0; k <= 600; k += 40) DS.push(k); DS[0] = 3;   // 3, 40, 80 … 600 km toward the sun (16 points)
  const DA = [40, 80, 160, 240];                                               // anti-solar side (4 points)
  const LH = { low: 1.4, mid: 4.5, high: 9.0 }   /* d28zzd: ONE set of deck heights for preview.js, los.js, model.js and the shader (photoreal layerH: low 1.4, mid uMidH=4.5, high max(9, mid+1.5)) */, SLAB = { low: [0.3, 2], mid: [2, 6.5], high: [6.5, 13] }, KEYS = ["low", "mid", "high"];
  const dest = (lat, lon, az, km) => { const d = km / R, a = az * RAD, p1 = lat * RAD, l1 = lon * RAD;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(a)), l2 = l1 + Math.atan2(Math.sin(a) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [p2 * DEG, l2 * DEG]; };
  const urlFor = (lat, lon, az, models) => { const P = DS.map(k => dest(lat, lon, az, k)).concat(DA.map(k => dest(lat, lon, (az + 180) % 360, k)));
    return "https://api.open-meteo.com/v1/forecast?latitude=" + P.map(p => p[0].toFixed(3)).join(",") + "&longitude=" + P.map(p => p[1].toFixed(3)).join(",") +
      "&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high&past_days=1&forecast_days=3&timezone=GMT" + (models ? "&models=" + models : ""); };
  // raw Open-Meteo array → compact {t:[...], sun:[[low,mid,high]...per point per hour], anti:[...]}
  function pack(j) { j = Array.isArray(j) ? j : [j]; const t = j[0].hourly.time.map(s => Date.parse(s + "Z") / 1000);
    const row = x => t.map((_, i) => KEYS.map(k => { const v = x.hourly["cloud_cover_" + k][i]; return v == null ? null : v / 100; }));
    return { t, sun: j.slice(0, DS.length).map(row), anti: j.slice(DS.length, DS.length + DA.length).map(row) }; }
  // cover profile (per point [low,mid,high]) at the forecast hour nearest t
  function profileAt(P, t) { let i = 0, b = 1e12; P.t.forEach((x, j) => { const d = Math.abs(x - t); if (d < b) { b = d; i = j; } });
    return { sun: P.sun.map(r => r[i] || [0, 0, 0]), anti: P.anti.map(r => r[i] || [0, 0, 0]), hour: P.t[i] }; }
  const lerpCov = (dist, rows, km, L) => { if (km <= dist[0]) return rows[0][L] || 0; for (let i = 1; i < dist.length; i++) if (km <= dist[i]) { const f = (km - dist[i - 1]) / (dist[i] - dist[i - 1]); return (rows[i - 1][L] || 0) * (1 - f) + (rows[i][L] || 0) * f; } return null; };
  // ground distance where a sight line at elevation a (°) reaches height h (km)
  const hitX = (a, h) => { const ta = Math.tan(Math.max(a, 0) * RAD); return R * (Math.sqrt(ta * ta + 2 * h / R) - ta); };
  // (b)+(c) sun ray reaching a cloud at (x km sunward, height h). elev = sun elevation at the viewer (°).
  // per-crossing opacity of a fully covered layer for the sun's beam (forward-scattering included): stratocumulus τ ≈ 10, altostratus/
  // altocumulus τ ≈ 3–10, cirrus τ ≈ 0.3–1 (1 − e^−τ with ~half of the scattered light still going forward)
  const OPQ = [0.95, 0.85, 0.3];
  function sunRay(prof, x, h, elev, L, only) { const e = elev * RAD + x / R, te = Math.tan(e), refr = 0.5 * RAD;
    let yMin = h, shadow = false; const acc = [0, 0, 0], n = [0, 0, 0];
    for (let s = 10; s <= 1400; s += 10) { const y = h + s * te + s * s / (2 * R) + s * refr; yMin = Math.min(yMin, y);   // ray height over ground s km beyond x
      if (y < 0) { shadow = true; break; } if (y > 14) break;
      const km = x + s; if (km > DS[DS.length - 1]) break;   // beyond the sampled path: unknown → treated as open
      for (let k = 0; k < 3; k++) { const sl = SLAB[KEYS[k]]; if (y < sl[0] || y > sl[1] || KEYS[k] === L || (only && !only.includes(KEYS[k]))) continue;   // the layer being lit never blocks itself
        acc[k] += km < 0 ? 0 : lerpCov(DS, prof.sun, km, k) || 0; n[k]++; } }
    // one crossing per layer: blocked fraction = mean cover along the crossed stretch × that layer's opacity
    let T = 1; for (let k = 0; k < 3; k++) if (n[k]) T *= 1 - OPQ[k] * acc[k] / n[k];
    const Tc = clamp(T);   // cloud transmission only (the shader adds Earth's shadow + reddening itself via sunT)
    return { T: shadow ? 0 : Tc, Tc, tanH: Math.max(0, yMin), red: clamp(1 - Math.max(0, yMin) / 8), eSun: e * DEG }; }
  // scoring gaps from the sampled path (replace the 40/120/200 km "east gap"): slot = light reaching a 1.4 km deck overhead at sunset/sunrise,
  // geo = mean light reaching the dominant deck over its own lit window (sun 0 … its dip below the horizon)
  function gaps(P, t, hDeck) { const prof = profileAt(P, t), dMax = Math.sqrt(2 * hDeck / R) * DEG + 0.5, own = hDeck >= 6.5 ? "high" : hDeck >= 2 ? "mid" : "low"; let z = 0, n = 0;
    for (let d = 0; d <= dMax + 1e-6; d += dMax / 6) { z += sunRay(prof, 0, hDeck, -d, own).Tc; n++; }   // the deck being lit never blocks itself
    // slot = LOW cloud only between the sun and a 1.4 km base overhead (a mid/high deck above that ray is what gets lit, not a wall)
    return { slotBlock: +(1 - sunRay(prof, 0, LH.low * 0.5, -0.3, null, ["low"]).Tc).toFixed(3), geoBlock: +(1 - z / n).toFixed(3) }; }
  // Main: per-layer sky profiles + summary. elev = sun elevation (°) at the viewer at time t.
  function analyse(P, t, elev) { const prof = profileAt(P, t), EL = [0.5, 1, 2, 3, 4, 6, 8, 10, 13, 16, 20, 25, 30, 40, 50, 60, 75, 90];
    const layers = {};
    KEYS.forEach((L, k) => { const h = LH[L]; layers[L] = { sun: EL.map(a => { const x = hitX(a, h), c = lerpCov(DS, prof.sun, x, k); if (c == null) return { a, x: Math.round(x), cov: null };
        const r = sunRay(prof, x, h, elev, L); let vis = 1; for (let j = 0; j < k; j++) { const cj = lerpCov(DS, prof.sun, hitX(a, LH[KEYS[j]]), j); vis *= 1 - OPQ[j] * (cj || 0); }   // seen through the decks below it
        return { a, x: Math.round(x), cov: +c.toFixed(2), T: +r.T.toFixed(2), Tc: +r.Tc.toFixed(2), red: +r.red.toFixed(2), tanH: +r.tanH.toFixed(1), vis: +vis.toFixed(2), lit: +(c * r.T * vis).toFixed(2) }; }),
      anti: EL.map(a => { const x = hitX(a, h), c = lerpCov(DA, prof.anti, Math.max(x, DA[0]), k); if (c == null) return { a, x: Math.round(x), cov: null };
        const r = sunRay(prof, -x, h, elev, L); return { a, x: -Math.round(x), cov: +c.toFixed(2), T: +r.T.toFixed(2), red: +r.red.toFixed(2), lit: +(c * r.T).toFixed(2) }; }) }; });
    // the sunward low-level light path: what fraction of the sun's light reaches the sky over the spot (ray at deck base ~2–4 km overhead)
    const ray0 = sunRay(prof, 0, 3, Math.max(elev, -4), "none");
    // sky-wide underlit band: highest sky elevation where any layer is cloudy AND sunlit (lit ≥ 0.15)
    let band = 0, litMax = 0, redAt = 0; KEYS.forEach(L => layers[L].sun.forEach(p => { if (p.lit >= 0.15) { if (p.a > band) band = p.a; } if (p.lit > litMax) { litMax = p.lit; redAt = p.red; } }));
    return { hour: prof.hour, elev, layers, gapOpen: +ray0.T.toFixed(2), band, litMax: +litMax.toFixed(2), red: redAt, km: DS, kmAnti: DA, sunPts: prof.sun, antiPts: prof.anti }; }
  // ---- browser cache/fetch (per spot / mode / day; frozen after lock) ----
  const MEM = {};
  function get(spot, mode, tEv, az) { if (!g.localStorage) return null;
    const key = "ag_path:" + mode + ":" + spot.id + ":" + Math.floor(tEv / 86400); if (MEM[key]) return MEM[key].P;
    let st = null; try { st = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) {}
    const now = (g.Model && g.Model.nowS) ? g.Model.nowS() : Date.now() / 1000, lockT = mode === "sunrise" ? tEv + 300 : tEv - 900;
    const stale = !st || (now < lockT && now - st.at / 1000 > 3 * 3600);   // refresh ≤ every 3 h until the lock, never after it
    MEM[key] = { P: st && st.P };
    if (stale && !(st && now >= lockT)) { MEM[key].busy = true;
      fetch(urlFor(spot.lat, spot.lng, Math.round(az), "gfs_seamless")).then(r => r.ok ? r.json() : null).then(j => { if (!j) return; const P = pack(j); P.az = Math.round(az);
        MEM[key].P = P; try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), P })); } catch (e) {} g.__agPathReady && g.__agPathReady(); g.__agQueue && g.__agQueue(); }).catch(() => {}); }
    return MEM[key].P; }
  // cache only (never fetches) — model.evaluate runs for all 88 spots; only the opened spot fetches its path
  function peek(spot, mode, tEv) { const key = "ag_path:" + mode + ":" + spot.id + ":" + Math.floor(tEv / 86400); if (MEM[key]) return MEM[key].P || null;
    try { const st = JSON.parse(g.localStorage && localStorage.getItem(key) || "null"); if (st) { MEM[key] = { P: st.P }; return st.P; } } catch (e) {} return null; }
  // per-sample shader table: sunward cover (low,mid,high) and cloud transmission of the sun's ray to each layer at each sample
  function table(P, t, elev) { const prof = profileAt(P, t);
    return { pc: prof.sun.map(r => [r[2] || 0, r[1] || 0, r[0] || 0]), pa: prof.anti.map(r => [r[2] || 0, r[1] || 0, r[0] || 0]),
      pl: DS.map(x => ["high", "mid", "low"].map(L => sunRay(prof, x, LH[L], elev, L).Tc)) }; }
  g.AGPath = { DS, DA, LH, urlFor, pack, profileAt, analyse, hitX, sunRay, gaps, get, peek, table };
})(typeof window !== "undefined" ? window : globalThis);
