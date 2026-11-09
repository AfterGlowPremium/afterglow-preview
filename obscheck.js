// d28zzg: observation cross-checks used by obs.js (pure functions, no DOM/network; unit-tested in tests/).
// B1  overcastCap — an OBSERVED overcast low/mid deck (METAR BKN/OVC layers ≤ 20,000 ft, or visible-satellite "here" ≥ 90 %) with no gap
//     toward the sun caps the score. Physics: at sunrise/sunset the only light that can colour a deck base comes in UNDER it from the
//     horizon (the ray to a base h km up grazes the ground ~√(2Rh) km out: ~230 km for a 13,500 ft / 4.1 km deck). If the deck reaches
//     the horizon along the sun's azimuth, its underside gets no direct beam and anything above it (e.g. the cirrus the model forecast)
//     is hidden; what's left is diffuse light transmitted through the deck. Cap 30 = top of "Poor" on the app's scale, a notch above
//     model.js's 20 for model-confirmed thick overcast, because a METAR base says nothing about thickness (thin altostratus still passes a
//     dim orange disk). The cap fades out linearly as gap evidence rises, and is gone once the path is ≥ 50 % open. If no source can say
//     whether a gap exists (no satellite read, and the model didn't see the deck so its path can't be trusted), the cap is 45 (top of
//     "Fair"): a confidence limit, not a physics claim.
// B2  nearClear — model says near-clear (total < 10 %) but stations or satellite see cloud → flag, lower confidence, and return the
//     observed layer cover to blend into the model inputs (never removes cloud; ASOS "CLR" only means nothing below 12,000 ft).
(function (g) {
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const COV = { SKC: 0, CLR: 0, NCD: 0, NSC: 0, FEW: 0.2, SCT: 0.45, BKN: 0.75, OVC: 1, VV: 1 };
  const LOW_TOP = 6500, MID_TOP = 20000;   // ft — same bands as Model cloudTypes (low < 6.5k, mid 7–20k, high above)
  // "KLFI:OVC140 KPHF:BKN050 OVC130" (obs.js blend) or "OVC140 BKN050" (one station) → { station: [{amt,cov,ft}] }
  function parseLayers(str) {
    const out = {}; let cur = "_";
    for (const tok of String(str || "").trim().split(/\s+/)) { if (!tok) continue;
      let t = tok; const c = t.indexOf(":"); if (c > 0) { cur = t.slice(0, c); t = t.slice(c + 1); }
      (out[cur] = out[cur] || []);
      const m = /^(SKC|CLR|NCD|NSC|FEW|SCT|BKN|OVC|VV)(\d{3})?$/.exec(t); if (!m) continue;
      out[cur].push({ amt: m[1], cov: COV[m[1]], ft: m[2] != null ? +m[2] * 100 : null }); }
    return out;
  }
  // per-band cover from one station's layers (random overlap within a band); deck = combined cover of everything ≤ 20,000 ft
  function bands(L) {
    let lo = 0, md = 0, hi = 0, deck = 0, base = null;
    for (const l of L) { if (!l.cov) continue; const ft = l.ft;
      if (ft == null || ft < LOW_TOP) lo = 1 - (1 - lo) * (1 - l.cov); else if (ft <= MID_TOP) md = 1 - (1 - md) * (1 - l.cov); else hi = 1 - (1 - hi) * (1 - l.cov);
      if (ft == null || ft <= MID_TOP) { deck = 1 - (1 - deck) * (1 - l.cov); if (l.cov >= 0.75 && ft != null && (base == null || ft < base)) base = ft; } }
    return { low: lo, mid: md, high: hi, deck, base };
  }
  // all stations → ½ mean + ½ max per band (obs.js d23 convention: a deck seen by any station counts, one station can't speak for all)
  function metarBands(m) {
    if (!m || !m.layers) return null;
    const per = Object.values(parseLayers(m.layers)).map(bands); if (!per.length) return null;
    const bl = k => { const a = per.map(x => x[k]); return 0.5 * a.reduce((s, v) => s + v, 0) / a.length + 0.5 * Math.max(...a); };
    const bases = per.map(x => x.base).filter(x => x != null);
    return { low: bl("low"), mid: bl("mid"), high: bl("high"), deck: bl("deck"), base: bases.length ? Math.min(...bases) : null, n: per.length };
  }
  // 0..1 how open the light path toward the sun is, from the best independent source; null = unknown
  function gapEvidence(ev, sat, cv) {
    const modelDeck = Math.max((ev.s && ev.s.low) || 0, 0.95 * ((ev.s && ev.s.mid) || 0)) / 100;
    const modelOpen = modelDeck >= 0.6 && ev.gapOpen != null ? clamp(ev.gapOpen) : null;   // the model's path only counts if it saw the deck at all
    if (sat && sat.path != null) { const o = 1 - clamp((sat.path - 0.15) / 0.45); return { open: modelOpen != null ? 0.6 * o + 0.4 * modelOpen : o, src: `GOES ${sat.day ? "vis+IR" : "IR"} path ${Math.round(sat.path * 100)}%` }; }
    if (cv && cv.far != null && Math.abs(cv.tSet - ev.tSet) < 3600) { const o = clamp(1 - (cv.far - 0.2) / 0.5); return { open: modelOpen != null ? 0.6 * o + 0.4 * modelOpen : o, src: `GOES 200–300 km ${Math.round(cv.far * 100)}%` }; }
    if (modelOpen != null) return { open: modelOpen, src: `model path ${Math.round((1 - modelOpen) * 100)}% shut` };
    return null;
  }
  function overcastCap(ev, m, sat, cv) {
    if (!ev || !ev.s) return null;
    const mb = metarBands(m), satDeck = sat && sat.day && sat.here != null ? sat.here : 0;
    const deck = Math.max(mb ? mb.deck : 0, satDeck);
    if (deck < 0.9) return null;
    const G = gapEvidence(ev, sat, cv);
    const what = mb && mb.deck >= 0.9 ? `stations report ${m.layers}${mb.base != null ? ` (ceiling ${Math.round(mb.base / 100) * 100} ft)` : ""}` : `visible satellite ${Math.round(satDeck * 100)}% cloud overhead`;
    if (!G) return { cap: 45, deck, open: null, unverified: true, why: `Overcast deck overhead (${what}) and no satellite read of the horizon toward the sun — capped at 45 until a gap is confirmed.` };
    const f = clamp((G.open - 0.2) / 0.3); if (f >= 1) return null;   // a real gap toward the sun → the deck is lit from below, no cap
    const cap = Math.round(30 + 70 * f);
    return { cap, deck, open: +G.open.toFixed(2), why: `Overcast deck overhead (${what}) with no gap toward the sun (${G.src}): sunlight can't get under it to light the cloud base — capped at ${cap}.` };
  }
  function nearClear(ev, m, sat, satW) {
    if (!ev || !ev.s || ev.s.total == null || ev.s.total >= 10) return null;
    const mb = metarBands(m), w = satW == null ? 1 : satW;
    const o = { low: mb ? mb.low : 0, mid: mb ? mb.mid : 0, high: mb ? mb.high : 0 };
    const sv = sat && sat.day ? sat : null;   // visible only: at dusk IEM's IR greys also cover cool clear sea/land (obs.js d24), too weak to overrule the model
    if (sv && sv.here != null) o.mid = Math.max(o.mid, w * clamp(sv.here)); if (sv && sv.hereHi != null) o.high = Math.max(o.high, w * clamp(sv.hereHi));
    const mx = Math.max(o.low, o.mid, o.high); if (mx < 0.3) return null;   // ≥ SCT at one station, FEW everywhere, or ≥ 30 % satellite cover
    const src = [mb && `stations ${m.layers}`, sv && sv.here != null && `GOES visible ${Math.round(Math.max(sv.here, sv.hereHi || 0) * 100)}% overhead`].filter(Boolean).join(" · ");
    return { obs: { low: +o.low.toFixed(2), mid: +o.mid.toFixed(2), high: +o.high.toFixed(2) }, model: Math.round(ev.s.total), src,
      why: `Model says ${Math.round(ev.s.total)}% cloud but observations see more (${src}) — using the observed cloud; lower confidence.` };
  }
  // hourly copy with the observed layer cover (0..1) blended in at the event hour and the next (max with the model — obs never remove cloud)
  function blendHourly(H, tSet, o) {
    if (!H || !H.time || !o) return H; const h = Object.assign({}, H), i = Math.max(0, Math.floor((tSet - H.time[0]) / 3600));
    const put = (k, v) => { if (!h[k] || v == null) return; h[k] = h[k].slice(); for (const j of [i, i + 1]) if (j < h[k].length) h[k][j] = Math.max(h[k][j] || 0, Math.round(100 * v)); };
    put("cloud_cover_low", o.low); put("cloud_cover_mid", o.mid); put("cloud_cover_high", o.high);
    put("cloud_cover", 1 - (1 - (o.low || 0)) * (1 - (o.mid || 0)) * (1 - (o.high || 0)));
    return h;
  }
  g.AGObsCheck = { parseLayers, bands, metarBands, gapEvidence, overcastCap, nearClear, blendHourly };
})(typeof window !== "undefined" ? window : globalThis);
