// Afterglow Real: forecast-gated weather drawn over the WebGL sky render. Same gates as the live app's sky animation:
//  rain/snow only if the forecast lists rain/snow in the event window; lightning only if lightning odds >= 25% (near its window);
//  fog only when forecast; rainbow only if rainbow odds >= 10% AND the slider time is inside the forecast rainbow window with the sun up.
//  Clouds come from HRRR/GOES in the sky shader itself. Nothing is invented.
(function (g) {
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  function conditions(ev, t, elev) {
    const WX = ev.wx || { items: [], bolt: { p: 0 }, wind: { mph: 0 } }, on = id => WX.items.some(x => x.id === id);
    const bp = WX.bolt.p || 0, bw = WX.bolt.win;
    const bolt = bp >= 25 && (!bw || (t >= bw.start - 1800 && t <= bw.end + 1800)) ? clamp(bp / 60, 0.4, 1) : 0;
    const rainIt = WX.items.find(x => x.id === "rain");
    const rain = rainIt ? clamp(0.25 + (WX.rain && WX.rain.mm || 0) / 4 + (WX.rain && WX.rain.pp || 0) / 300, 0.2, 1) : 0;
    const snowIt = WX.items.find(x => x.id === "snow"), snow = snowIt ? (snowIt.lvl || 0.6) : 0, fog = on("fog") ? 0.6 : 0;
    const bow = ev.bonus && ev.bonus.bow, bwin = bow && bow.win;
    const bowOn = !!(bow && bow.p >= 10 && bwin && t >= bwin.start && t <= bwin.end && elev > -0.3 && elev < 42);
    const bowA = bowOn ? clamp(Math.min(t - bwin.start, bwin.end - t) / 420) * clamp(0.35 + bow.p / 60) : 0;
    // d24t: convective towers. Cumulonimbus when the forecast has thunder (lightning odds >= 25% or code >= 95); towering cumulus when CAPE > 800
    // with low cloud but no storm. Placement from where the model puts the storm: at the spot → near & big; ~12 km opposite → only behind you; else distant on the horizon.
    const S0 = ev.s || {}, wh = (WX.bolt && WX.bolt.where) || "", cbOn = bp >= 25 || (S0.code >= 95);
    const cb = cbOn ? { near: /at the spot/.test(wh) || S0.code >= 95, behind: /km/.test(wh), p: bp } : null;
    const tcu = !cbOn && (S0.cape || 0) > 800 && (S0.low || 0) > 15 ? clamp(((S0.cape || 0) - 800) / 1500, 0.3, 1) : 0;
    return { cb, tcu, bolt, boltP: bp, rain, rainName: rainIt && rainIt.name, snow, snowName: snowIt && snowIt.name, fog, bow: bowA, bowP: bow ? bow.p : 0, red: bow && bow.red, wind: WX.wind && WX.wind.mph || 0 };
  }
  let drops = null, flakes = null;
  // d24t: cumulonimbus thunderhead / towering cumulus — static body pre-rendered to an offscreen canvas (re-made only when size or light
  // bucket changes), so per frame it is one drawImage + a lightning glow. Tops catch the low sun (gold → orange → pink), base stays dark.
  const towerCache = {};
  // d24u: one storm tower body, pre-rendered once per (cell shape seed, pixel height, light bucket). Shape comes from the radar cell
  // (bearing, distance, dBZ, top) so it is stable frame to frame but different cell to cell: width, lean, turret count/size, anvil
  // length/thickness/direction, overshooting top, multi-cell clusters, ragged vs smooth edges. Light follows the sun elevation.
  function skyLight(e) {   // [lit-top colour, mid, shade] for the sun elevation (deg) — gold day → orange/pink at sunset → dim pink-grey → dark slate
    const k = [[8, [255, 236, 205], [196, 190, 192], [92, 96, 110]], [3, [255, 206, 140], [178, 150, 140], [76, 76, 92]], [0, [255, 150, 100], [150, 110, 116], [62, 58, 74]],
      [-2.5, [214, 120, 132], [116, 90, 108], [50, 46, 62]], [-5, [128, 98, 120], [84, 72, 92], [38, 36, 50]], [-8, [60, 58, 76], [46, 46, 60], [26, 26, 36]]];
    if (e >= k[0][0]) return k[0].slice(1); for (let i = 1; i < k.length; i++) if (e >= k[i][0]) { const t = (e - k[i][0]) / (k[i - 1][0] - k[i][0]); return [1, 2, 3].map(j => k[i][j].map((v, n) => Math.round(v + (k[i - 1][j][n] - v) * t))); }
    return k[k.length - 1].slice(1); }
  function towerBody(kind, h, e, seed) {
    const eb = Math.round(e * 2) / 2, key = kind + "|" + Math.round(h) + "|" + eb + "|" + seed; if (towerCache[key]) return towerCache[key];
    let r = (Math.abs(Math.round(seed)) % 2147483646) + 1; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const [warm, mid, shade] = skyLight(eb), mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const wF = 0.75 + rnd() * 0.6, lean = (rnd() - 0.5) * 0.3, rag = rnd(), anvL = kind === "cb" ? 0.45 + rnd() * 0.9 : 0, anvDir = rnd() < 0.75 ? 1 : -1, anvT = 0.06 + rnd() * 0.08,
      over = kind === "cb" && rnd() < 0.45, cluster = 1 + Math.floor(rnd() * (kind === "cb" ? 3 : 4));
    const w = Math.round(h * (kind === "cb" ? 0.9 + anvL * 1.1 : 0.5 + 0.25 * cluster) * wF + 8), c = document.createElement("canvas"); c.width = w; c.height = Math.round(h * 1.12) + 4; const x = c.getContext("2d");
    const base = h * 1.0 + 2, topY = base - h;
    const puff = (px, py, pr) => { const u = clamp((base - py) / h), lt = Math.min(1, Math.pow(u, 1.2) * 1.2), top = mix(shade, warm, lt), sh = mix(shade, mid, u * 0.45);
      const g = x.createRadialGradient(px - pr * 0.15, py - pr * 0.25, pr * 0.15, px, py, pr); g.addColorStop(0, `rgba(${top},.9)`); g.addColorStop(0.6, `rgba(${mix(top, sh, 0.35)},.7)`); g.addColorStop(1, `rgba(${sh},0)`);
      x.fillStyle = g; x.beginPath(); x.arc(px, py, pr, 0, 6.283); x.fill(); };
    const cx0 = kind === "cb" ? (anvDir > 0 ? w * 0.32 : w * 0.68) : w * 0.5;
    for (let m = 0; m < cluster; m++) {   // main cell + flanking cells (shorter, offset)
      const main = m === 0, hh = main ? h : h * (0.35 + rnd() * 0.4), cx = cx0 + (main ? 0 : (rnd() - 0.5) * w * 0.7), tw = h * 0.16 * wF * (main ? 1 : 0.7);
      const colTop = base - hh * (kind === "cb" && main ? 1 - anvT * 1.4 : 1), n = Math.round((main ? 180 : 70) * (0.6 + 0.4 * wF));
      for (let i = 0; i < n; i++) { const u = Math.pow(rnd(), 0.85), y = base - u * (base - colTop), wd = tw * (1 + 0.35 * u) * (1 + 0.25 * Math.sin(u * 7 + m));
        puff(cx + (rnd() - 0.5) * wd * 1.5 + lean * u * hh, y, h * (0.03 + rnd() * (0.03 + 0.05 * rag)) * (1.15 - 0.4 * u)); }
      if (!main || kind !== "cb") { const tops = 2 + Math.floor(rnd() * 4); for (let t = 0; t < tops; t++) puff(cx + lean * hh + (rnd() - 0.5) * tw * 1.6, colTop + rnd() * hh * 0.08, h * (0.04 + rnd() * 0.05)); }   // cauliflower turrets
    }
    if (kind === "cb") {   // anvil: flat top at the tropopause, thin tapered underside, overhang downwind (direction varies by cell)
      const ax = cx0 + lean * h, aY = topY + h * 0.02, uY = aY + h * anvT, L = h * anvL * anvDir, sgn = anvDir;
      x.beginPath(); x.moveTo(ax - sgn * h * 0.22, uY); x.quadraticCurveTo(ax - sgn * h * 0.26, aY + h * 0.01, ax - sgn * h * 0.12, aY); x.lineTo(ax + L, aY + h * 0.012);
      x.quadraticCurveTo(ax + L + sgn * h * 0.12, aY + h * 0.03, ax + L, aY + h * 0.05); x.quadraticCurveTo(ax + L * 0.45, uY, ax + sgn * h * 0.1, uY + h * 0.02); x.closePath();
      const g = x.createLinearGradient(0, aY, 0, uY + h * 0.03); g.addColorStop(0, `rgba(${warm},.96)`); g.addColorStop(0.5, `rgba(${mix(warm, mid, 0.55)},.95)`); g.addColorStop(1, `rgba(${mix(mid, shade, 0.55)},.9)`); x.fillStyle = g; x.fill();
      x.save(); x.clip(); for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? warm : shade},${0.05 + rnd() * 0.07})`; x.beginPath(); x.ellipse(ax - sgn * h * 0.2 + rnd() * (L + sgn * h * 0.3) * sgn * sgn, aY + rnd() * (uY - aY), h * (0.04 + rnd() * 0.1), h * 0.015, 0, 0, 6.283); x.fill(); } x.restore();
      if (over) puff(ax + sgn * h * 0.02, aY - h * 0.02, h * (0.06 + rnd() * 0.04));   // overshooting top
      for (let i = 0; i < 10 + rag * 8; i++) { const sx = cx0 - h * 0.2 + rnd() * h * 0.45, g2 = x.createLinearGradient(0, base - h * 0.03, 0, c.height); g2.addColorStop(0, `rgba(${shade},.5)`); g2.addColorStop(1, `rgba(${shade},0)`); x.fillStyle = g2; x.fillRect(sx, base - h * 0.03, h * (0.012 + rnd() * 0.035), c.height); }   // rain shafts
    }
    { const g = x.createLinearGradient(0, base - h * 0.3, 0, base); g.addColorStop(0, `rgba(${shade},0)`); g.addColorStop(1, `rgba(${mix(shade, [0, 0, 0], 0.25)},.95)`); x.globalCompositeOperation = "source-atop"; x.fillStyle = g; x.fillRect(0, base - h * 0.3, w, h * 0.3); x.globalCompositeOperation = "source-over"; }   // dark flat base
    c.baseY = base; c.cx = cx0; return (towerCache[key] = c);   // no ctx.filter (iOS Safari / software GL ignore or box it); bodies are drawn >= 180 px and scaled down, which softens them
  }
  // d24u: the horizon is the SCENE's horizon (C.hz = fraction from the top, from Photoreal.camera() for the WebGL stage, the canvas
  // preview's 0.66 otherwise) with its vertical field of view (C.vfov). Bases sit on that line, distant bases sink behind the earth's curve
  // (hidden height d²/2R), and everything is clipped to the sky above the horizon — towers never sit on the water.
  const towerGeo = (C, H) => ({ hzY: (C.hz != null ? C.hz : 0.6) * H, vf: C.vfov || 62 });
  function radarTowers(x, W, H, hz0, C, now) {
    const { hzY, vf } = towerGeo(C, H), hf = 2 * Math.atan(Math.tan(vf * Math.PI / 360) * W / H) * 180 / Math.PI, ppd = H / vf, e = C.elev != null ? C.elev : 3;
    const cells = C.storms.cells.slice().sort((a, b) => b[1] - a[1]); let flash = null; C._towerBases = [];
    x.save(); x.beginPath(); x.rect(0, 0, W, hzY); x.clip();
    for (const c of cells) { const [db, d, z, tk0] = c; if (Math.abs(db) > hf / 2 + 8) continue;
      const tk = tk0 != null && tk0 > 2 ? tk0 : z >= 50 ? 11 : 8, drop = d * d / 12742, ang = Math.atan((tk - drop) / d) * 180 / Math.PI; if (ang <= 0.05) continue;
      const hid = Math.atan(drop / d) * 180 / Math.PI * ppd, h = Math.max(6, (ang * ppd) + hid), cb = z >= 45 || tk >= 8;
      const hb = Math.max(180, Math.round(h / 3) * 3), k = h / hb, B = towerBody(cb ? "cb" : "tcu", hb, e, Math.round(db * 131 + d * 17 + z * 7 + tk * 29)), cx = W / 2 + db / hf * W, baseY = hzY + hid;
      x.globalAlpha = clamp(0.98 - d / 450, 0.55, 0.97); x.drawImage(B, cx - B.cx * k, baseY - B.baseY * k, B.width * k, B.height * k); x.globalAlpha = 1; C._towerBases.push({ baseY, clipY: hzY, hid });
      if (cb && z >= 50 && (!flash || d < flash.d)) flash = { cx, cy: baseY - h * 0.45, h, d, db }; }
    if (flash) { const ph = (now + flash.db * 137) % 2700; if (ph < 140) { const a = (ph < 60 ? 0.55 : ph < 90 ? 0.12 : 0.4) * clamp((e + 9) / 6, 0.5, 1), g = x.createRadialGradient(flash.cx, flash.cy, 2, flash.cx, flash.cy, flash.h * 0.4);
      g.addColorStop(0, `rgba(235,235,255,${a})`); g.addColorStop(1, "rgba(235,235,255,0)"); x.globalCompositeOperation = "lighter"; x.fillStyle = g; x.fillRect(flash.cx - flash.h * 0.4, flash.cy - flash.h * 0.4, flash.h * 0.8, flash.h * 0.8); } }
    x.restore();
  }
  function towers(x, W, H, hz0, C, now) {
    if (C.storms && C.storms.cells && C.storms.cells.length) return radarTowers(x, W, H, hz0, C, now);
    const { hzY, vf } = towerGeo(C, H), ppd = H / vf, e = C.elev != null ? C.elev : 3, side = C.cbSide != null ? C.cbSide : 0.2; C._towerBases = [];   // forecast-only: no radar position → off to one side of the sun
    x.save(); x.beginPath(); x.rect(0, 0, W, hzY); x.clip();
    if (C.cb && (!C.cb.behind || C.turned)) { const d = C.cb.near ? 25 : 70, ang = Math.atan((11 - d * d / 12742) / d) * 180 / Math.PI, hid = Math.atan(d / 12742) * 180 / Math.PI * ppd, h = ang * ppd + hid, B = towerBody("cb", Math.round(h / 3) * 3, e, 4242 + (C.cb.near ? 1 : 0));
      x.drawImage(B, W * side - B.cx, hzY + hid - B.baseY); C._towerBases.push({ baseY: hzY + hid, clipY: hzY, hid });
      const ph = now % 3100; if (ph < 140) { const a = (ph < 60 ? 0.55 : 0.3), cx = W * side, cy = hzY - h * 0.5, g = x.createRadialGradient(cx, cy, 2, cx, cy, h * 0.35); g.addColorStop(0, `rgba(235,235,255,${a})`); g.addColorStop(1, "rgba(235,235,255,0)"); x.globalCompositeOperation = "lighter"; x.fillStyle = g; x.fillRect(cx - h * 0.4, cy - h * 0.4, h * 0.8, h * 0.8); x.globalCompositeOperation = "source-over"; } }
    if (C.tcu) { const d = 40, ang = Math.atan((5 * C.tcu - d * d / 12742) / d) * 180 / Math.PI, hid = Math.atan(d / 12742) * 180 / Math.PI * ppd, h = ang * ppd + hid, B = towerBody("tcu", Math.round(h / 3) * 3, e, 999); x.globalAlpha = 0.92; x.drawImage(B, W * (1 - side) - B.cx, hzY + hid - B.baseY); x.globalAlpha = 1; C._towerBases.push({ baseY: hzY + hid, clipY: hzY, hid }); }
    x.restore();
  }

  // d24n: snow — soft gray-white veil (hides the sun disk when heavy), haze thickening toward the horizon, three depth layers of flakes
  // (far: tiny/slow/dim, near: big/soft/fast) drifting with the wind and fluttering, and a whitened ground/foreground band.
  function snowfall(x, W, H, hz, C, slant, now) {
    const s = C.snow, n = Math.round(160 + 900 * s);
    if (!flakes || flakes.length !== n) flakes = Array.from({ length: n }, (_, i) => { const z = Math.pow(((i * 0.7548) % 1), 1.6); return [((i * 0.618) % 1), ((i * 0.377) % 1), z, (i * 2.399) % 6.283]; });
    let gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, `rgba(196,200,208,${0.5 * s})`); gr.addColorStop(hz / H, `rgba(214,216,222,${0.72 * s})`); gr.addColorStop(1, `rgba(200,204,212,${0.35 * s})`); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    gr = x.createLinearGradient(0, hz - H * 0.18, 0, hz + H * 0.06); gr.addColorStop(0, "rgba(225,227,232,0)"); gr.addColorStop(0.7, `rgba(225,227,232,${0.55 * s})`); gr.addColorStop(1, `rgba(225,227,232,${0.25 * s})`); x.fillStyle = gr; x.fillRect(0, hz - H * 0.18, W, H * 0.24);
    gr = x.createLinearGradient(0, H * 0.86, 0, H); gr.addColorStop(0, "rgba(240,242,246,0)"); gr.addColorStop(1, `rgba(240,242,246,${0.6 * s})`); x.fillStyle = gr; x.fillRect(0, H * 0.86, W, H * 0.14);
    const tt = now / 1000, drift = slant * 0.35;
    for (const f of flakes) { const z = f[2], sp = 0.05 + 0.22 * z, r = 0.6 + 4.2 * z * z + 0.6 * z, a = 0.35 + 0.55 * z;
      const y = ((f[1] + tt * sp) % 1) * (H + 20) - 10, xx = ((((f[0] + drift * tt * sp * 0.6 + 0.012 * Math.sin(tt * (0.8 + z) + f[3])) % 1) + 1) % 1) * W;
      if (z > 0.75) { const g2 = x.createRadialGradient(xx, y, 0, xx, y, r * 1.6); g2.addColorStop(0, `rgba(255,255,255,${a})`); g2.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g2; x.beginPath(); x.arc(xx, y, r * 1.6, 0, 6.283); x.fill(); }
      else { x.fillStyle = `rgba(250,251,255,${a})`; x.beginPath(); x.arc(xx, y, r, 0, 6.283); x.fill(); } }
  }
  function draw(cv, C, t, now) {
    const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, g.devicePixelRatio || 1);
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    const hz = H * 0.6;
    // wind from the left or right of the view: cross-component sets which way rain leans; >40 mph → horizontal sheets
    const side = C.wdir != null && C.faceAz != null ? Math.sin(((C.wdir + 180) - C.faceAz) * Math.PI / 180) : -1;
    const slant = (side >= 0 ? 1 : -1) * (C.wind > 40 ? 6 : 0.1 + clamp(C.wind / 40) * 1.4);
    if (C.shore) shoreline(x, W, H, hz, now);
    if (C.trees) snags(x, W, H, hz);
    if (C.dune) dune(x, W, H, now);
    if (C.sea) sea(x, W, H, hz, C, now);
    if (C.torn) tornado(x, W, H, hz, now);
    if (C.jets) jets(x, W, H, hz, C, now);
    if (C.cb || C.tcu || C.storms) towers(x, W, H, hz, C, now);
    if (C.fog) { const gr = x.createLinearGradient(0, hz - H * 0.3, 0, H); gr.addColorStop(0, "rgba(200,205,215,0)"); gr.addColorStop(0.5, `rgba(200,205,215,${0.45 * C.fog})`); gr.addColorStop(1, `rgba(190,195,205,${0.3 * C.fog})`); x.fillStyle = gr; x.fillRect(0, 0, W, H); }
    if (C.bolt) {   // storm cell + flicker; deterministic per minute of forecast time, plus a live flicker while it sits still
      const k = Math.floor(t / 60) + Math.floor(now / 2400), ph = now % 2400, a = (ph < 70 ? 1 : ph < 120 ? 0.25 : ph < 190 ? 0.75 : 0) * C.bolt;
      const gr = x.createRadialGradient(W * 0.16, hz - H * 0.25, 4, W * 0.16, hz - H * 0.25, W * 0.4); gr.addColorStop(0, "rgba(28,27,44,.75)"); gr.addColorStop(1, "rgba(28,27,44,0)"); x.fillStyle = gr; x.fillRect(0, 0, W, hz + 4);
      if (a > 0) {
        x.save(); x.fillStyle = `rgba(220,228,255,${0.22 * a})`; x.fillRect(0, 0, W, hz);
        let bx = W * (0.08 + 0.22 * (Math.sin(k * 91.7) * 0.5 + 0.5)), by = hz - H * 0.36;
        x.strokeStyle = `rgba(255,255,255,${a})`; x.lineWidth = 2; x.shadowColor = "#bcd0ff"; x.shadowBlur = 16; x.beginPath(); x.moveTo(bx, by);
        for (let s = 1; s <= 9; s++) { bx += Math.sin(k * 13.1 + s * 7.3) * W * 0.03; by += H * 0.36 / 9; x.lineTo(bx, by); }
        x.stroke(); x.restore();
      }
    }
    if (C.rain || C.snow) {
      const n = C.snow ? 0 : Math.round(60 + 240 * C.rain);
      if (!drops || drops.length !== n) drops = Array.from({ length: n }, (_, i) => [((i * 0.618) % 1), ((i * 0.377) % 1), 0.6 + ((i * 0.733) % 1) * 0.8]);
      const fall = ((t / 30) % 1 + 1) % 1 + now * (C.snow ? 0.00015 : 0.0008);
      x.save();
      if (C.snow) snowfall(x, W, H, hz, C, slant, now);
      else { x.filter = "blur(0.7px)"; x.strokeStyle = "rgba(205,215,232,.26)"; x.lineWidth = 1; x.beginPath();
        for (const d of drops) { const y = ((d[1] + fall * d[2]) % 1) * (H + 30) - 15, xx = (((d[0] + slant * 0.3 * y / H) % 1) + 1) % 1 * W, L = 9 + 13 * d[2]; x.moveTo(xx, y); x.lineTo(xx + slant * L, y + L); }
        x.stroke();
        const gr = x.createLinearGradient(0, hz - H * 0.22, 0, hz + 6); gr.addColorStop(0, "rgba(110,116,132,0)"); gr.addColorStop(1, `rgba(110,116,132,${0.3 * C.rain})`); x.fillStyle = gr; x.fillRect(0, hz - H * 0.22, W, H * 0.22 + 6); }
      x.restore();
    }
    if (C.ref) person(x, W, H, C.ref);
    if (C.bow > 0.01 && C.turned) {   // d23r: 180° Turn — the bow is IN view: full arc round the antisolar point (below the horizon by the sun's
      // elevation), 42° primary + faint 51° secondary (reversed). Phone fields of view are ~30° wide, so the arc is drawn wide-angle to fit the
      // whole bow. Low sun (red bow): blue/green scattered out → red, pink, orange; brightest at the bases where the rain is thickest
      // (VB oceanfront Oct 17 2026 reference). Hazy distant rain veil underneath, brighter sky inside the bow.
      const e = clamp((C.elev || 0) / 42), R = Math.min(W * 0.47, H * 0.62), cx = W / 2, cy = hz + e * R, A = clamp(C.bow * 1.2);
      x.save();
      const veil = x.createLinearGradient(0, hz - R * 0.55, 0, hz); veil.addColorStop(0, "rgba(170,160,170,0)"); veil.addColorStop(1, `rgba(${C.red ? "196,160,168" : "170,176,190"},${0.35 * A})`);
      x.fillStyle = veil; x.fillRect(0, hz - R * 0.55, W, R * 0.55);
      const inG = x.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 0.95); inG.addColorStop(0, "rgba(255,240,235,0)"); inG.addColorStop(1, `rgba(255,236,228,${0.16 * A})`);
      x.beginPath(); x.arc(cx, cy, R * 0.95, Math.PI, 2 * Math.PI); x.closePath(); x.fillStyle = inG; x.fill();
      const cols = C.red ? [[255, 60, 50], [255, 92, 110], [255, 120, 80], [255, 165, 95]] : [[255, 50, 45], [255, 140, 40], [255, 225, 70], [80, 200, 90], [70, 130, 255], [120, 80, 220]];
      const bw = R * 0.022, segs = 48;
      x.globalCompositeOperation = "lighter";
      const arcBand = (r, c, al) => { for (let k = 0; k < segs; k++) { const a0 = Math.PI + k * Math.PI / segs, a1 = a0 + Math.PI / segs + 0.002, m = Math.abs(Math.cos((a0 + a1) / 2));
          x.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(al * (0.45 + 0.55 * m * m)).toFixed(3)})`; x.lineWidth = bw * 1.25; x.beginPath(); x.arc(cx, cy, r, a0, a1); x.stroke(); } };
      cols.forEach((c, i) => arcBand(R - i * bw, c, A * (C.red ? 0.62 : 0.5)));
      cols.slice().reverse().forEach((c, i) => arcBand(R * 51 / 42 - i * bw * 1.3, c, A * 0.13));
      x.restore();
    } else if (C.bow > 0.01) {   // the bow is opposite the sun, i.e. behind someone facing the event: inset "look behind you" panel
      const pw = Math.min(W * 0.42, 190), ph = pw * 0.62, px = W - pw - 12, py = H * 0.2;
      x.save(); x.globalAlpha = clamp(C.bow * 1.4); x.fillStyle = "rgba(60,62,86,.85)"; x.strokeStyle = "rgba(255,255,255,.5)"; x.lineWidth = 1;
      x.beginPath(); x.roundRect ? x.roundRect(px, py, pw, ph, 10) : x.rect(px, py, pw, ph); x.fill(); x.stroke(); x.clip();
      const cols = C.red ? ["#ff4a3a", "#ff7a2a", "#ffae3a", "#ffd25a"] : ["#ff3b3b", "#ff8a1f", "#ffe14d", "#4fd05a", "#3fa0ff", "#6a4dff"], R = pw * 0.42, bw = R * 0.05;
      x.globalCompositeOperation = "lighter"; x.lineWidth = bw;
      cols.forEach((c, i) => { x.strokeStyle = c; x.beginPath(); x.arc(px + pw / 2, py + ph * 0.95, R - i * bw, Math.PI, 2 * Math.PI); x.stroke(); });
      x.globalCompositeOperation = "source-over"; x.globalAlpha = 1; x.fillStyle = "#fff"; x.font = "600 11px Inter,sans-serif"; x.textAlign = "center";
      x.fillText(`🌈 ${C.red ? "Red rainbow" : "Rainbow"} ${C.bowP}% · behind you`, px + pw / 2, py + 15); x.restore();
    }
  }
  // d23w: scale reference — a 6 ft (1.83 m) person standing knee-deep (0.45 m) in the shallows 4 m in front of the hero wave, projected with the
  // SAME camera as the shader (vertical FOV 62/50/40° by aspect, pitch 0.04 x FOV up, eye height and distance from PhotoStage), so the wave's
  // face can be read against a body: 2 ft ≈ knee-thigh, 3 ft ≈ waist, 5 ft ≈ chest-head, 10 ft ≈ well overhead.
  function person(x, W, H, R) {
    const asp = W / H, vf = (asp < 1 ? 62 : asp < 1.5 ? 50 : 40) * R.fovMul * Math.PI / 180, th = Math.tan(vf / 2), pitch = vf * 0.04 / Math.max(0.2, R.fovMul) * R.fovMul;
    const d = Math.max(6, R.d - 4), Y = h => H / 2 - Math.tan(Math.atan((h - R.camH) / d) - pitch) / (2 * th) * H, ppm = H / (2 * th * d);
    const cx = W * 0.22, wl = Y(0), top = Y(1.83 - 0.45), m = v => v * ppm;
    if (!(wl > 0 && top < H)) return;
    x.save(); x.fillStyle = "rgba(18,20,26,0.88)";
    x.beginPath(); x.arc(cx, top + m(0.12), m(0.11), 0, 2 * Math.PI); x.fill();                        // head
    x.beginPath(); x.moveTo(cx - m(0.22), top + m(0.3)); x.lineTo(cx + m(0.22), top + m(0.3)); x.lineTo(cx + m(0.15), wl + m(0.02)); x.lineTo(cx - m(0.15), wl + m(0.02)); x.closePath(); x.fill();   // torso / legs to the waterline
    x.fillRect(cx + m(0.2), top + m(0.32), m(0.08), m(0.6)); x.fillRect(cx - m(0.28), top + m(0.32), m(0.08), m(0.55));   // arms
    x.fillStyle = "rgba(30,34,44,0.9)"; x.fillRect(cx + m(0.29), top + m(0.25), m(0.1), Math.min(m(1.0), wl - top - m(0.25)));   // bodyboard held under the arm
    x.strokeStyle = "rgba(235,240,245,0.55)"; x.lineWidth = Math.max(1, m(0.04)); x.beginPath(); x.ellipse(cx, wl, m(0.3), m(0.05), 0, 0, 2 * Math.PI); x.stroke();   // foam ring at the waterline
    x.fillStyle = "rgba(255,255,255,0.7)"; x.font = "600 10px Inter,sans-serif"; x.textAlign = "center"; x.fillText("6 ft", cx, top - 4);
    x.restore();
  }
  // Surf/sea layer: wave rows scale with height; chop & ripple density with wind; offshore = smooth glassy faces that
  // stand up, pitch and barrel (spray blown back off the lip); combo swell = peaky A-frames; rows angle with swell dir.
  // Draft v2: the photoreal shader owns the water (chop, ripples, reflection breakup, swell shading). This layer only adds
  // soft, blurred, sky-lit whitewater lines for surf >= 3 ft — offshore: thin feathering lips; onshore: wider foam; combo: broken peaks.
  function sea(x, W, H, hz, C, now) {
    const S = C.sea; if (!S || !S.surf || S.ft < 3) return;
    const ft = clamp(S.ft, 0, 15), per = S.per || 9, rel = S.dir != null && C.faceAz != null ? Math.sin(((S.dir + 180) - C.faceAz) * Math.PI / 180) : 0;
    x.save(); x.globalCompositeOperation = "screen";
    for (let r = 0; r < 3; r++) {
      const ph = ((now / (per * 1000)) + r / 3) % 1, d = 0.12 + ph * 0.75, y = hz + (H - hz) * d * 0.9, a = Math.sin(ph * Math.PI) * clamp(ft / 8, 0.25, 0.8);
      const thick = (S.off ? 1.2 : 3) * (1 + d * 3) * (ft / 4), blur = 1.5 + d * 3;
      x.filter = `blur(${blur.toFixed(1)}px)`;
      for (let k = 0; k < 90; k++) {
        const u = k / 90, peak = S.combo ? Math.pow(Math.abs(Math.sin(u * Math.PI * 3 + r * 1.7)), 2) : 1, n = Math.sin(u * 37 + r * 5 + now * 0.0007) * 0.5 + 0.5;
        const on = S.off ? (n > 0.35 && peak > 0.4) : n > 0.15;
        if (!on) continue;
        const yy = y + rel * 30 * d * (1 - 2 * u) - peak * thick * 0.6, al = a * (0.35 + 0.4 * n) * (S.combo ? peak : 1);
        x.fillStyle = `rgba(255,236,226,${al.toFixed(3)})`; x.fillRect(u * W, yy, W / 90 + 1, thick * (0.6 + n));
        if (!S.off && ph > 0.5) { x.fillStyle = `rgba(235,225,230,${(al * 0.35).toFixed(3)})`; x.fillRect(u * W, yy + thick, W / 90 + 1, thick * 2.5 * ph); }   // soupy foam behind the break
      }
    }
    x.restore();
  }
  // Grandview Beach landmark: bare dead trees (eroded maritime forest) standing in the surf — soft, haze-faded silhouettes
  function snags(x, W, H, hz) {
    const T = [[0.12, 0.30, 1.0], [0.21, 0.22, 0.8], [0.33, 0.12, 0.55], [0.82, 0.18, 0.7], [0.9, 0.26, 0.9]];
    x.save(); x.filter = "blur(0.8px)"; x.lineCap = "round";
    T.forEach(([u, hgt, s], i) => { const bx = u * W, by = hz + H * 0.03 * s, ht = H * hgt, a = 0.45 + 0.4 * s;
      x.strokeStyle = `rgba(48,44,40,${a})`; x.lineWidth = 3.2 * s;
      x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + 4 * s, by - ht * 0.5, bx - 2 * s, by - ht); x.stroke();
      x.lineWidth = 1.4 * s;
      for (let k = 0; k < 5; k++) { const f = 0.35 + k * 0.13, sx = bx + (2 - 4 * f) * s, sy = by - ht * f, dir = (k + i) % 2 ? 1 : -1, L = ht * (0.28 - k * 0.035);
        x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + dir * L * 0.5, sy - L * 0.2, sx + dir * L, sy - L * 0.55); x.stroke(); }
      x.fillStyle = `rgba(230,230,228,${0.25 * s})`; x.fillRect(bx - 10 * s, by - 1, 20 * s, 2);   // foam around the base
    });
    x.restore();
  }
  // Salt Ponds background: hazy flat far shore, low buildings, bare trees, cylindrical water tower, gulls (soft, haze-faded)
  function shoreline(x, W, H, hz, now) {
    x.save(); x.filter = "blur(1.2px)"; const y0 = hz - 1; x.fillStyle = "rgba(120,124,130,.45)";
    x.fillRect(0, y0 - 3, W, 4);
    for (let i = 0; i < 26; i++) { const bx = (i * 0.137 % 1) * W, bw = 6 + (i * 7 % 13), bh = 3 + (i * 5 % 7); x.fillRect(bx, y0 - 3 - bh, bw, bh); }
    for (let i = 0; i < 9; i++) { const bx = (0.05 + i * 0.11) * W; x.strokeStyle = "rgba(110,112,116,.4)"; x.lineWidth = 1; x.beginPath(); x.moveTo(bx, y0 - 3); x.lineTo(bx, y0 - 14); x.moveTo(bx, y0 - 10); x.lineTo(bx - 4, y0 - 15); x.moveTo(bx, y0 - 11); x.lineTo(bx + 4, y0 - 16); x.stroke(); }
    const tx = W * 0.68; x.fillStyle = "rgba(118,120,126,.55)"; x.fillRect(tx - 1, y0 - 22, 2, 19); x.beginPath(); x.ellipse(tx, y0 - 25, 6, 4, 0, 0, 6.283); x.fill();   // water tower
    x.filter = "none"; x.strokeStyle = "rgba(60,62,66,.6)"; x.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const gx = ((i * 0.31 + now * 0.00002 * (1 + i * 0.3)) % 1) * W, gy = hz - H * (0.16 + i * 0.07) + Math.sin(now * 0.002 + i) * 4, s = 9 + 3 * i, fl = Math.sin(now * 0.006 + i * 2) * 0.35;
      x.lineWidth = 1.6; x.beginPath(); x.moveTo(gx - s, gy - s * (0.3 + fl)); x.quadraticCurveTo(gx - s * 0.4, gy - s * 0.65, gx, gy); x.quadraticCurveTo(gx + s * 0.4, gy - s * 0.65, gx + s, gy - s * (0.3 + fl)); x.stroke(); }   // gulls
    x.restore();
  }
  // Jennette's dune: out-of-focus sea oats and grass in the foreground, swaying
  function dune(x, W, H, now) {   // Jennette's dune: out-of-focus foreground of sea oats (slender stalks, drooping seed panicles) and grass
    x.save(); const base = H * 0.99;
    x.filter = "blur(3px)"; x.fillStyle = "rgba(78,76,50,.8)"; x.beginPath(); x.moveTo(0, H); x.lineTo(0, base - H * 0.035); x.quadraticCurveTo(W * 0.5, base - H * 0.07, W, base - H * 0.03); x.lineTo(W, H); x.fill();
    for (const [layer, n, blur, al] of [[0, 40, 1.4, 0.45], [1, 22, 2.6, 0.7]]) {
      x.filter = `blur(${blur}px)`;
      for (let i = 0; i < n; i++) { const r = (i * 0.618 + layer * 0.31) % 1, bx = r * W, hgt = H * (layer ? 0.2 + (i * 0.37 % 1) * 0.14 : 0.1 + (i * 0.41 % 1) * 0.09), sw = Math.sin(now * 0.0011 + i * 1.7) * (layer ? 6 : 3);
        const tx = bx + sw, ty = base - hgt;
        x.strokeStyle = `rgba(${168 + (i % 5) * 6},${156 + (i % 4) * 5},112,${al})`; x.lineWidth = layer ? 1.6 : 0.9;
        x.beginPath(); x.moveTo(bx, base); x.quadraticCurveTo(bx + sw * 0.3, base - hgt * 0.55, tx, ty); x.stroke();
        if (i % 2 === 0) { x.fillStyle = `rgba(190,168,118,${al})`;   // panicle: spikelets hanging off an arching tip
          for (let k = 0; k < 7; k++) { const u = k / 6, px = tx + (u * 7 + sw * 0.2) * (i % 4 ? 1 : -1), py = ty + u * u * 10 + k * 1.2; x.beginPath(); x.ellipse(px, py, layer ? 1.6 : 1, layer ? 3.6 : 2.4, 0.5 * (i % 4 ? 1 : -1), 0, 6.283); x.fill(); } }
        else if (i % 3 === 0) { x.strokeStyle = `rgba(120,128,80,${al})`; x.lineWidth = 0.8; x.beginPath(); x.moveTo(bx, base); x.quadraticCurveTo(bx - 6, base - hgt * 0.4, bx - 12 + sw, base - hgt * 0.55); x.stroke(); }   // leaf blade
      }
    }
    x.restore();
  }
  // d24p: Windmill Point (Langley AFB next door) — three F-22 Raptors in tight echelon, a banking turn across the upper sky every 10 s
  // (pass ~6 s). Top-down planform: angular nose + chines, diamond wing with clipped tips, notched trailing edge, stabs, twin canted tails.
  const F22 = [[1,0],[.62,.07],[.3,.12],[.12,.2],[-.06,.5],[-.2,.5],[-.36,.2],[-.44,.2],[-.6,.38],[-.78,.38],[-.72,.14],[-.86,.1],[-.86,-.1],[-.72,-.14],[-.78,-.38],[-.6,-.38],[-.44,-.2],[-.36,-.2],[-.2,-.5],[-.06,-.5],[.12,-.2],[.3,-.12],[.62,-.07]];
  function jets(x, W, H, hz, C, now) {
    const P = 10000, D = 6000, ph = (now % P); if (ph > D) return; const u = ph / D;
    const p = t => ({ x: W * (-0.1 + 1.2 * t), y: H * (0.3 - 0.16 * Math.sin(t * Math.PI)) }), a = p(u), b = p(Math.min(1, u + 0.01)), hd = Math.atan2(b.y - a.y, b.x - a.x);
    const bank = 0.25 + 0.65 * Math.sin(u * Math.PI), L = W * 0.032, e = C.elev != null ? C.elev : 5, lt = clamp((e + 2) / 10);
    const col = `rgb(${Math.round(28 + 80 * lt)},${Math.round(30 + 84 * lt)},${Math.round(36 + 92 * lt)})`;
    for (const [dx, dy] of [[0, 0], [-1.25, 1.05], [-2.5, 2.1]]) {
      x.save(); x.translate(a.x + (dx * Math.cos(hd) - dy * Math.sin(hd)) * L * 0.9, a.y + (dx * Math.sin(hd) + dy * Math.cos(hd)) * L * 0.9 * Math.cos(bank)); x.rotate(hd); x.scale(L, L * Math.cos(bank));
      x.fillStyle = col; x.beginPath(); F22.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); x.fill();
      x.strokeStyle = col; x.lineWidth = 0.05; x.beginPath(); for (const s2 of [1, -1]) { x.moveTo(-0.5, 0.15 * s2); x.lineTo(-0.78, (0.15 + 0.28 * Math.sin(bank) * 0.6 + 0.06) * s2); } x.stroke();   // canted tails show as the jets roll
      if (lt > 0.3) { x.fillStyle = `rgba(255,255,255,${0.12 * lt})`; x.beginPath(); x.moveTo(1, 0); x.lineTo(-0.2, 0.5); x.lineTo(-0.06, 0.02); x.closePath(); x.fill(); }
      x.restore(); }
  }
  function tornado(x, W, H, hz, now) {   // NWS Tornado Warning only: soft translucent condensation funnel under a dark wall cloud, rain-wrapped
    const cx = W * 0.7 + Math.sin(now * 0.0004) * W * 0.02, top = hz - H * 0.4;
    x.save(); x.filter = "blur(10px)"; let g = x.createRadialGradient(cx, top, 5, cx, top, W * 0.55); g.addColorStop(0, "rgba(25,27,32,.7)"); g.addColorStop(1, "rgba(25,27,32,0)"); x.fillStyle = g; x.fillRect(0, 0, W, hz);
    x.filter = "blur(2.5px)";
    for (let i = 0; i < 80; i++) { const u = i / 80, y = top + u * (hz - top), w = Math.pow(1 - u, 1.6) * W * 0.09 + 4, sx = cx + Math.sin(u * 3.5 + now * 0.0015) * W * 0.025 * u;
      const gg = x.createLinearGradient(sx - w, 0, sx + w, 0); gg.addColorStop(0, "rgba(90,92,100,0)"); gg.addColorStop(0.5, `rgba(85,86,94,${0.38 + 0.2 * (1 - u)})`); gg.addColorStop(1, "rgba(90,92,100,0)"); x.fillStyle = gg; x.fillRect(sx - w, y, 2 * w, (hz - top) / 80 + 1); }
    x.filter = "blur(6px)"; x.fillStyle = "rgba(110,100,92,.35)"; x.beginPath(); x.ellipse(cx, hz - 6, W * 0.05, 9, 0, 0, 6.283); x.fill();
    x.restore();
  }
  function label(C) {
    const t = [];
    if (C.rain) t.push(`🌧️ ${C.rainName || "Rain"} forecast`); if (C.snow) t.push(`❄️ ${C.snowName || "Snow"} forecast`); if (C.fog) t.push("🌫️ Fog forecast");
    if (C.bolt) t.push(`⚡ Lightning ${C.boltP}%`); if (C.torn) t.push("🌪 NWS Tornado Warning"); if (C.wind > 40 && C.rain) t.push(`💨 ${Math.round(C.wind)} mph — sideways rain`); { const Sx = C.sea || C.seaLbl; if (Sx && Sx.ft >= 1) t.push(`🌊 ${Sx.ft.toFixed(1)} ft · ${Math.round(Sx.per || 0)} s${Sx.wl ? `\n💨 ${Math.round(Sx.mph != null ? Sx.mph : Sx.wl.kt * 1.15)} mph ${Sx.wl.look}` : Sx.off ? " · offshore, clean" : ""}${Sx.combo ? " · combo swell, peaky" : ""}`); } if (C.bow > 0.01) t.push(`🌈 Rainbow ${C.bowP}%`);
    return t.join("\n");
  }
  g.Wx = { conditions, draw, label };
})(window);
