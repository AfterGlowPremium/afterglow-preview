// Afterglow forecast → rendering architecture (DRAFT)
//  1) spot profile (spots.js SPOT_PROFILE / defaults)  2) classify(): forecast → classes  3) LOOKS table: classes → dials
//  4) dials(): blend look + spot water profile → the ONLY values the renderer reads.
(function (g) {
  const KT = 1 / 1.15;
  // ---- 3) data-driven look table (edit numbers here, not renderer code) ----
  const LOOKS = {
    sky: {
      clear:    { light: [1.00, 0.95, 0.88], intensity: 1.00, backlight: 1.0, reflect: 1.00, fog: 0.00, cov: [0.10, 0.00, 0.00] },
      partly:   { light: [1.00, 0.93, 0.86], intensity: 0.85, backlight: 0.6, reflect: 0.90, fog: 0.05, cov: [0.35, 0.30, 0.20] },
      overcast: { light: [0.86, 0.88, 0.90], intensity: 0.55, backlight: 0.0, reflect: 0.60, fog: 0.15, cov: [0.40, 0.95, 0.85] },
      fog:      { light: [0.88, 0.89, 0.90], intensity: 0.45, backlight: 0.0, reflect: 0.40, fog: 0.80, cov: [0.20, 0.40, 0.60] },
      rain:     { light: [0.78, 0.81, 0.86], intensity: 0.40, backlight: 0.0, reflect: 0.45, fog: 0.35, cov: [0.50, 0.90, 0.95], rain: 0.75 },
      storm:    { light: [0.70, 0.72, 0.80], intensity: 0.30, backlight: 0.1, reflect: 0.40, fog: 0.30, cov: [0.70, 0.90, 0.90], rain: 0.85, bolt: 0.9 },
    },
    wind: {   // roughness 0..1, whitecaps 0..1, spindrift 0..1, offshore grooming 0..1 — all scale with speed
      calm:     kt => ({ rough: Math.max(0.04, 0.55 * Math.pow(Math.max(0, Math.min(1, (kt * 1.15 - 3.5) / 14.5)), 0.8)), caps: 0, spindrift: 0, off: 0.3, look: "glassy" }),
      offshore: kt => ({ rough: Math.max(Math.min(0.25, 0.04 + kt / 80), 0.55 * Math.pow(Math.max(0, Math.min(1, (kt * 1.15 - 3.5) / 14.5)), 0.8)), caps: 0, spindrift: Math.min(1, (kt - 4) / 14), off: Math.min(1, kt / 13), look: kt > 15 ? "strong offshore — spray" : "offshore — clean, groomed" }),
      onshore:  kt => ({ rough: Math.min(1, (kt - 4) / 12), caps: Math.max(0, (kt - 10) / 12), spindrift: 0, off: 0, look: kt > 10 ? "onshore — blown out" : "light onshore — textured" }),
      cross:    kt => ({ rough: Math.min(1, (kt - 4) / 15), caps: Math.max(0, (kt - 12) / 14), spindrift: 0, off: 0.1, look: kt > 10 ? "cross-shore — choppy" : "cross-shore — textured" }),
    },
  };
  // ---- 1) spot profiles: explicit entries win, otherwise derived defaults ----
  const WATER = {
    ocean:  { tint: [0.15, 0.20, 0.12], turbidity: 0.35, translucency: 0.8 },   // OBX olive-green
    bay:    { tint: [0.16, 0.17, 0.10], turbidity: 0.60, translucency: 0.5 },   // Chesapeake brown-olive
    gulf:   { tint: [0.10, 0.20, 0.17], turbidity: 0.25, translucency: 0.9 },
    harbor: { tint: [0.12, 0.14, 0.12], turbidity: 0.70, translucency: 0.3 },
  };
  function profile(sp) {
    const P = (g.SPOT_PROFILE || {})[sp.id] || {};
    const faceEast = g.AGX && g.AGX.faceEast ? g.AGX.faceEast(sp.id) : false;
    const normal = P.normal != null ? P.normal : g.AGX && g.AGX.normal ? g.AGX.normal(sp) : faceEast ? 90 : sp.arc ? (sp.arc[0] + sp.arc[1]) / 2 : 270;   // d13: same shore angle as agx.js
    const water = P.water || (sp.state === "TX" || ["pensacola"].includes(sp.id) ? "gulf" : /Harbor|Waterfront/.test(sp.type) ? "harbor" : sp.state === "VA" && sp.lng < -76.1 ? "bay" : "ocean");
    return Object.assign({ normal, views: P.views || [normal, (normal + 180) % 360], water, surf: P.surf != null ? P.surf : faceEast || sp.type === "Beach" || sp.type === "Pier", landmarks: P.landmarks || [] }, { W: WATER[water] });
  }
  // ---- 2) shared classifier ----
  function classify(sp, f) {   // f: { low, mid, high (0..1), precip mm, pp %, code, cape, vis m, windMph, windDir, alerts[], sunVis 0..1 }
    const pr = profile(sp), kt = (f.windMph || 0) * KT;
    let sky = "clear";
    const cov = Math.max(f.low || 0, f.mid || 0, (f.high || 0) * 0.6);
    if (cov > 0.75) sky = "overcast"; else if (cov > 0.3) sky = "partly";
    if ((f.vis != null && f.vis < 2000) || [45, 48].includes(f.code)) sky = "fog";
    // d28z: Sean — Buckroe sunrise Oct 30 drew rain with none falling. Rain now needs a meaningful amount (≥ 0.1 mm/h) AND decent odds or a
    // rain/shower code; a drizzle code (51–57) or high humidity with no measurable precip reads as mist/fog instead.
    const pmm = f.precip || 0, rainCode = (f.code >= 61 && f.code <= 67) || (f.code >= 80 && f.code <= 82);
    if (pmm >= 0.1 && ((f.pp || 0) >= 30 || rainCode || pmm >= 0.5)) sky = "rain";
    else if (f.code >= 51 && f.code <= 57 && sky !== "fog") sky = "fog";
    if ((f.code >= 95) || (f.cape || 0) > 1500 && (f.pp || 0) > 40 || (f.alerts || []).some(a => /Thunderstorm|Tornado/.test(a))) sky = "storm";
    let wind = "calm";
    if (kt >= 5 && f.windDir != null) { const on = Math.cos((f.windDir - pr.normal) * Math.PI / 180); wind = on > 0.5 ? "onshore" : on < -0.5 ? "offshore" : "cross"; }
    const sunGap = f.sunVis != null ? f.sunVis : sky === "clear" ? 1 : sky === "partly" ? 0.6 : 0;
    return { sky, wind, kt, sunGap, profile: pr };
  }
  // ---- 4) dials: the renderer reads only these ----
  function dials(cls, wave) {
    const S = LOOKS.sky[cls.sky], Wd = LOOKS.wind[cls.wind](cls.kt), W = cls.profile.W;
    return {
      sky: cls.sky, wind: cls.wind, look: Wd.look,
      lightColor: S.light, lightIntensity: S.intensity, backlight: S.backlight * cls.sunGap,
      waterTint: W.tint, turbidity: W.turbidity, translucency: W.translucency * (0.4 + 0.6 * S.intensity),
      reflectivity: S.reflect, roughness: Math.min(1, Wd.rough + (S.rain || 0) * 0.3), whitecaps: Wd.caps, spindrift: Wd.spindrift, off: Wd.off,
      rain: S.rain || 0, rainAngle: cls.kt * 1.15 > 40 ? 90 : Math.min(60, cls.kt * 1.6), bolt: S.bolt || 0, fog: S.fog, cov: S.cov,
      surf: cls.profile.surf && wave && wave.ft >= 1.5 ? wave : null,   // no marine feed → no surf
    };
  }
  g.Looks = { LOOKS, WATER, profile, classify, dials };
})(window);
