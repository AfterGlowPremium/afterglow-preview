// d28j: steam fog (sea smoke / evaporation fog) on rivers & marshes at sunrise. Cold air flowing over warmer water:
// water − air ≥ ~5 °C meaningful, ≥ ~10 °C strong; small temp−dewpoint spread; wind < 3 mph (3–6 thins, > ~8 kills); clear night.
// Generic: add a spot to CFG (USGS water-temperature gauge) to enable it elsewhere. Only the Mattaponi (melrose) for now.
(function (g) {
  const CFG = { melrose: { usgs: "01674500", src: "USGS 01674500 Mattaponi R. nr Beulahville" } };
  const W = {}, clamp = v => Math.max(0, Math.min(1, v)), FtoC = f => (f - 32) * 5 / 9, CtoF = c => c * 9 / 5 + 32;
  function load(id) { const c = CFG[id]; if (!c || W[id]) return; W[id] = { pending: 1 };
    fetch(`https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${c.usgs}&parameterCd=00010&period=P2D`).then(r => r.json()).then(d => {
      const v = d.value.timeSeries[0].values[0].value.filter(x => x.value != null && +x.value > -20), L = v[v.length - 1];
      W[id] = L ? { c: +L.value, t: Date.parse(L.dateTime) / 1000 } : { fail: 1 }; g.__agQueue && g.__agQueue(); }).catch(() => { W[id] = { fail: 1 }; }); }
  // d28l: ?steam= persists for the tab (sessionStorage) so it survives the self-update reload, the Welcome → Sunrise pick and opening a spot; ?steam=off clears it
  const ss = () => { try { return sessionStorage.getItem("agSteam") || ""; } catch (e) { return ""; } };
  try { const m = /[?&]steam=(\w+)/i.exec(location.search); if (m) { const v = m[1].toLowerCase(); if (v === "off") sessionStorage.removeItem("agSteam"); else sessionStorage.setItem("agSteam", v); } } catch (e) {}
  const LV = p => p >= 70 ? "Strong" : p >= 45 ? "Likely" : p >= 20 ? "Possible" : "None";
  // d28n: burn-off time = when the sun reaches 5° (the renderer fades the steam from 0° to 5°)
  function burnT(sp, ev) { const M = g.Model; if (!M || !ev || !ev.tSet) return ""; for (let t = ev.tSet; t < ev.tSet + 3 * 3600; t += 60) if (M.sunPos(t, sp.lat, sp.lng).elev >= 5) return " · burns off ~" + new Date(t * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }); return ""; }
  function calc(sp, ev) {
    if (!sp || !CFG[sp.id] || g.AG_MODE !== "sunrise") return null;
    const fm = /[?&]steam=(strong|likely|possible|none|off)/i.exec(location.search) || /^(strong|likely|possible|none)$/.exec(ss()) && [0, ss()];
    if (fm && fm[1].toLowerCase() !== "off") { const p = { strong: 85, likely: 58, possible: 30, none: 0 }[fm[1].toLowerCase()]; return { p, level: LV(p), forced: true, txt: `Steam fog ${LV(p)} ${p}%${p >= 20 ? burnT(sp, ev) : ""} · test override (?steam=)` }; }
    const I = ev && ev.steamIn; if (!I || I.temp == null || I.wind == null) return null;
    load(sp.id); const w = W[sp.id], now = Date.now() / 1000, near = ev.tSet && Math.abs(ev.tSet - now) < 3 * 86400;
    let wc = null, src = "";
    if (w && w.c != null && near && now - w.t < 36 * 3600) { wc = w.c; src = `water measured ${CFG[sp.id].src}`; }
    else if (I.air7 != null) { wc = FtoC(I.air7); src = "water ESTIMATED (7-day mean air temp)"; }
    if (wc == null) return w && w.pending ? null : null;
    const air = FtoC(I.temp), dT = wc - air, spr = I.dew != null ? (I.temp - I.dew) * 5 / 9 : null, wnd = Math.max(I.wind, (I.gust || 0) * 0.5);
    const fT = dT < 2 ? 0 : clamp((dT - 3) / 9), fS = spr == null ? 0.6 : 0.35 + 0.65 * clamp(1 - (spr - 1) / 5);
    const fW = wnd <= 3 ? 1 : wnd <= 6 ? 1 - 0.5 * (wnd - 3) / 3 : wnd <= 8 ? 0.5 - 0.5 * (wnd - 6) / 2 : 0, fC = I.night == null ? 0.8 : 1 - 0.6 * clamp((I.night - 20) / 70);
    const p = Math.round(100 * fT * fS * fW * fC);
    const txt = `Steam fog ${LV(p)} ${p}%${p >= 20 ? burnT(sp, ev) : ""} · water ${Math.round(CtoF(wc))}°F vs air ${Math.round(I.temp)}°F (Δ${Math.round(dT * 9 / 5)}°F) · dew spread ${spr == null ? "—" : Math.round(spr * 9 / 5) + "°F"} · wind ${Math.round(I.wind)}${I.gust != null ? "/g" + Math.round(I.gust) : ""} mph · night cloud ${I.night == null ? "—" : Math.round(I.night) + "%"}`;
    return { p, level: LV(p), dT, spr, wind: wnd, waterF: CtoF(wc), txt, src: src + " · air/dew/wind/cloud Open-Meteo forecast at sunrise" };
  }
  g.SteamFog = { CFG, calc, load, LV };
})(window);
