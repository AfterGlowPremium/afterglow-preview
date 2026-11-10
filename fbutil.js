// d28zzg: feedback helpers (pure, unit-tested in tests/): photo SHA-256 (duplicate guard), EXIF capture time + GPS, and the full
// locked forecast saved with every submission (B4) plus a compact copy that fits the Supabase `pred` column (< 2000 bytes).
(function (g) {
  const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join("");
  async function sha256Hex(buf) { const c = g.crypto && g.crypto.subtle; if (!c) return null; try { return hex(await c.digest("SHA-256", buf)); } catch (e) { return null; } }
  // Minimal EXIF (JPEG APP1/TIFF) reader: DateTimeOriginal (falls back to DateTime) as a local wall-clock Date, OffsetTimeOriginal, GPS lat/lng/alt.
  function parseExif(ab) {
    const out = { t: null, off: null, gps: null }; let v; try { v = new DataView(ab); } catch (e) { return out; }
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return out;
    let p = 2;
    while (p + 4 <= v.byteLength) { const mk = v.getUint16(p), len = v.getUint16(p + 2); if ((mk & 0xFF00) !== 0xFF00 || mk === 0xFFDA) break;
      if (mk === 0xFFE1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966) { try { readTiff(v, p + 10, out); } catch (e) {} break; }
      p += 2 + len; }
    return out;
  }
  function readTiff(v, T, out) {
    const le = v.getUint16(T) === 0x4949, u16 = o => v.getUint16(T + o, le), u32 = o => v.getUint32(T + o, le);
    const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const ifd = o => { const n = u16(o), E = {}; for (let i = 0; i < n; i++) { const e = o + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), sz = (SZ[type] || 1) * cnt, at = sz > 4 ? u32(e + 8) : e + 8; E[tag] = { type, cnt, at }; } return E; };
    const str = x => { let s = ""; for (let i = 0; i < x.cnt; i++) { const c = v.getUint8(T + x.at + i); if (!c) break; s += String.fromCharCode(c); } return s; };
    const rat = (x, i) => { const n = u32(x.at + 8 * i), d = u32(x.at + 8 * i + 4); return d ? n / d : 0; };
    const dt = s => { const m = /(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(s || ""); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null; };
    const I0 = ifd(u32(4));
    let t = I0[0x0132] ? dt(str(I0[0x0132])) : null;
    if (I0[0x8769]) { const X = ifd(u32(I0[0x8769].at)); if (X[0x9003]) t = dt(str(X[0x9003])) || t; if (X[0x9011]) out.off = str(X[0x9011]) || null; }
    out.t = t;
    if (I0[0x8825]) { const G = ifd(u32(I0[0x8825].at));
      if (G[2] && G[4] && G[2].cnt >= 3 && G[4].cnt >= 3) { const dms = x => rat(x, 0) + rat(x, 1) / 60 + rat(x, 2) / 3600;
        let lat = dms(G[2]), lng = dms(G[4]); if (G[1] && str(G[1]) === "S") lat = -lat; if (G[3] && str(G[3]) === "W") lng = -lng;
        if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng)) {
          out.gps = { lat: +lat.toFixed(5), lng: +lng.toFixed(5) };
          if (G[6]) { let a = rat(G[6], 0); if (G[5] && v.getUint8(T + G[5].at) === 1) a = -a; out.gps.alt = Math.round(a); } } } }
  }
  // B4: the complete forecast the app showed for this event — every enumerable field of the evaluated event (score, all inputs, gates,
  // components, cloud layers, light path, contrails incl. the 300 hPa wind/shear and per-level T/RHi, timing, badges…) + data provenance,
  // the station/satellite reads behind the obs checks and the solar-path samples at the event hour.
  function lockedForecast(o) {
    const ev = o.ev || {}, D = o.data || {}, E = {};
    for (const k of Object.keys(ev)) { const x = ev[k]; if (typeof x !== "function") E[k] = x; }
    let sp = null; try { const P = o.path, A = g.AGPath; if (P && A && A.profileAt) { const pr = A.profileAt(P, ev.tSet); sp = { km: A.DS, kmAnti: A.DA, hour: pr.hour, sun: pr.sun, anti: pr.anti, order: "[low,mid,high] %" }; } } catch (e) {}
    return { v: 1, build: o.build || null, savedAt: new Date(o.now || Date.now()).toISOString(), mode: o.mode, spot: o.spot, tSet: ev.tSet,
      frozen: !!ev.frozen, fc: { fetchedAt: D.at ? new Date(D.at).toISOString() : null, model: D.fcModel || null, src: D.prefetch ? "prefetch" : D.snapshot ? "baked-snapshot" : D.stale ? "cache" : D.past ? "archive" : "live", lite: !!D.lite,
        runNote: "Open-Meteo does not return the model run time; fetchedAt is when this forecast was downloaded (prefetch = server download time)" },
      obs: o.obs || null, satCanvas: o.cv || null, solarPath: sp, ev: E };
  }
  // keep the locked forecast under `max` JSON chars by dropping the bulkiest display-only series first (inputs/scores are never dropped)
  function fitLock(L, max = 60000) {
    let js = JSON.stringify(L); if (js.length <= max) return L;
    const C = JSON.parse(js), drop = [["ev", "windSer"], ["ev", "sea"], ["ev", "wx"], ["ev", "badges"], ["ev", "bonus"], ["ev", "tri"], ["satCanvas"], ["solarPath", "anti"], ["ev", "reasons"]];
    C.trimmed = [];
    for (const [a, b] of drop) { if (b ? C[a] && C[a][b] !== undefined : C[a] !== undefined) { if (b) delete C[a][b]; else delete C[a]; C.trimmed.push(b || a); }
      if (JSON.stringify(C).length <= max) return C; }
    return C;
  }
  // compact provenance for the `pred` column (check: pg_column_size(pred) < 2000) — optional parts dropped if it would not fit
  function predExtras(pred, x) {
    const P = Object.assign({}, pred || {}), ev = x.ev || {}, D = x.data || {}, c = ev.con;
    Object.assign(P, { b: x.build || undefined, rated: x.rated ? 1 : 0, sha: x.sha || undefined, fc: D.at ? { at: Math.round(D.at / 1000), m: D.fcModel || null, src: D.prefetch ? "pf" : D.snapshot ? "snap" : D.stale ? "cache" : "live" } : undefined,
      frz: ev.frozen ? 1 : undefined, cap: x.cap || undefined, gps: x.gps || undefined,
      ua: c ? { p: c.p, T: c.T, rhi: c.rhi, cat: c.cat, w: c.wind ? [c.wind.from, c.wind.mph] : null } : undefined,
      ovc: ev.ovcCap ? ev.ovcCap.cap : undefined, nc: ev.nearClear ? 1 : undefined });
    const opt = ["gps", "cap", "ua", "fc"]; let i = 0;
    while (JSON.stringify(P).length > 1800 && i < opt.length) delete P[opt[i++]];
    return P;
  }
  g.AGFb = { sha256Hex, parseExif, lockedForecast, fitLock, predExtras };
})(typeof window !== "undefined" ? window : globalThis);
