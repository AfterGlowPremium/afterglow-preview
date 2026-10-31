// d28z5: curvature-aware line of sight for sky glow (every spot). Toward the sun, samples forecast cloud by layer (Open-Meteo, one batched
// request per spot/azimuth/day, cached) at 10–380 km, out to each layer's visible distance d_vis = √(2R·h_eye) + √(2R·h_cloud)
// (R = 6371 km: low 1.5 km ≈ 143 km, mid 4.5 km ≈ 245 km, high 10 km ≈ 362 km). On-screen elevation of a sample = atan((h − d²/2R)/d).
// A layer is LIT while sun depression < acos(R/(R+h)) ≈ √(2h/R) (low ≈ 1.2°, mid ≈ 2.2°, high ≈ 3.2°) AND the low/mid cloud near the
// grazing point (≈ √(2R·h) toward the sun, 0.6–1.6×) is not a wall. Output drives photostage glow regimes.
(function (g) {
  const R = 6371, D = [10, 30, 60, 100, 150, 220, 300, 380], H = { low: 1.5, mid: 4.5, high: 10 }, C = {}, clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const dest = (lat, lon, az, km) => { const d = km / R, a = az * Math.PI / 180, p1 = lat * Math.PI / 180, l1 = lon * Math.PI / 180;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(a)), l2 = l1 + Math.atan2(Math.sin(a) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [p2 * 180 / Math.PI, l2 * 180 / Math.PI]; };
  const elevOf = (km, h) => Math.atan((h - km * km / (2 * R)) / km) * 180 / Math.PI;
  function fetchRow(key, lat, lon, az) {
    const P = D.map(km => dest(lat, lon, az, km)), u = "https://api.open-meteo.com/v1/forecast?latitude=" + P.map(p => p[0].toFixed(3)).join(",") + "&longitude=" + P.map(p => p[1].toFixed(3)).join(",") + "&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high&forecast_days=3&past_days=1&timezone=GMT";
    C[key] = null; fetch(u).then(r => r.ok ? r.json() : null).then(j => { if (!j) return; j = Array.isArray(j) ? j : [j];
      C[key] = j.map(x => ({ t: x.hourly.time.map(s => Date.parse(s + "Z") / 1000), low: x.hourly.cloud_cover_low, mid: x.hourly.cloud_cover_mid, high: x.hourly.cloud_cover_high })); g.__agQueue && g.__agQueue(); }).catch(() => {});
  }
  function at(row, k, t) { let i = -1, b = 5400; for (let j = 0; j < row.t.length; j++) { const d = Math.abs(row.t[j] - t); if (d < b) { b = d; i = j; } } return i < 0 || row[k][i] == null ? null : row[k][i] / 100; }
  // → { lit: {low, mid, high}, overhead (lit cover ≤ 30 km), far (lit cover > 30 km), band (cover-weighted on-screen elevation °), wall (low cloud toward sun) } or null while loading
  function get(spot, az, t, sunEl, eyeKm) {
    eyeKm = eyeKm || 0.002; const a5 = Math.round(az / 5) * 5, key = spot.id + ":" + a5 + ":" + Math.floor(t / 86400);
    if (!(key in C)) fetchRow(key, spot.lat, spot.lng, a5); const rows = C[key]; if (!rows) return null;
    const out = { lit: {}, overhead: 0, far: 0, band: 0, wall: 0 }; let ws = 0, es = 0;
    for (const L in H) { const h = H[L], dvis = Math.sqrt(2 * R * eyeKm) + Math.sqrt(2 * R * h), dep = Math.max(0, -sunEl), dmax = Math.acos(R / (R + h)) * 180 / Math.PI, tan = Math.sqrt(2 * R * h);
      let block = 0; rows.forEach((r, i) => { if (D[i] < tan * 0.6 || D[i] > tan * 1.6) return; block = Math.max(block, at(r, "low", t) || 0, L === "low" ? 0 : 0.7 * (at(r, "mid", t) || 0)); });
      out.lit[L] = clamp(1 - dep / dmax) * clamp(1 - (block - 0.3) / 0.5);
      rows.forEach((r, i) => { const km = D[i]; if (km > dvis) return; const cov = at(r, L, t); if (cov == null) return; const w = cov * out.lit[L];
        if (km <= 30) out.overhead = Math.max(out.overhead, w); else out.far = Math.max(out.far, w); ws += w; es += w * elevOf(km, h); }); }
    rows.forEach((r, i) => { if (D[i] >= 60 && D[i] <= 220) out.wall = Math.max(out.wall, at(r, "low", t) || 0); });
    out.band = ws > 0 ? es / ws : 0; return out; }
  g.AGLos = { get, elevOf };
})(window);
