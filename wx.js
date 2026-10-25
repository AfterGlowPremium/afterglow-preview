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
      [-2.5, [176, 98, 112], [98, 74, 92], [44, 40, 54]], [-5, [72, 56, 72], [44, 40, 52], [24, 23, 32]], [-8, [28, 27, 36], [22, 22, 30], [14, 14, 20]]];   // after sunset the towers go darker than the sky (silhouettes), tops only faintly pink
    if (e >= k[0][0]) return k[0].slice(1); for (let i = 1; i < k.length; i++) if (e >= k[i][0]) { const t = (e - k[i][0]) / (k[i - 1][0] - k[i][0]); return [1, 2, 3].map(j => k[i][j].map((v, n) => Math.round(v + (k[i - 1][j][n] - v) * t))); }
    return k[k.length - 1].slice(1); }
  function towerBody(kind, h, e, seed) {   // d27f: soft distant thunderhead — big overlapping soft puffs, feathered anvil, soft rain shafts (no hard slabs/columns)
    const eb = Math.round(e * 2) / 2, key = kind + "|" + Math.round(h) + "|" + eb + "|" + seed; if (towerCache[key]) return towerCache[key];
    let r = (Math.abs(Math.round(seed)) % 2147483646) + 1; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const [warm0, mid, shade0] = skyLight(eb), mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t)), warm = mix(warm0, mid, 0.2), shade = mix(shade0, mid, 0.45);
    const cb = kind === "cb", wF = 0.8 + rnd() * 0.5, lean = (rnd() - 0.5) * 0.2, dir = rnd() < 0.7 ? 1 : -1, anvL = cb ? 0.5 + rnd() * 0.6 : 0;
    const w = Math.round(h * (cb ? 1.3 + anvL : 0.9) * wF + 8), c = document.createElement("canvas"); c.width = w; c.height = Math.round(h * 1.15) + 4; const x = c.getContext("2d");
    const base = h + 2, cx0 = cb ? (dir > 0 ? w * 0.36 : w * 0.64) : w * 0.5;
    const puff = (px, py, rx, ry, a) => { const u = clamp((base - py) / h), top = mix(shade, warm, Math.min(1, Math.pow(u, 1.1) * 1.15)), sh = mix(shade, mid, u * 0.4);
      x.save(); x.translate(px, py); x.scale(1, ry / rx); const g = x.createRadialGradient(-rx * 0.2, -rx * 0.3, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(${top},${a})`); g.addColorStop(0.55, `rgba(${mix(top, sh, 0.5)},${a * 0.75})`); g.addColorStop(1, `rgba(${sh},0)`); x.fillStyle = g; x.beginPath(); x.arc(0, 0, rx, 0, 6.283); x.fill(); x.restore(); };
    const cells = cb ? 1 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 3);
    for (let m = 0; m < cells; m++) { const main = m === 0, hh = main ? h * (cb ? 0.86 : 1) : h * (0.4 + rnd() * 0.3), cx = cx0 + (main ? 0 : (rnd() < 0.5 ? -1 : 1) * h * (0.25 + rnd() * 0.2)), bw = h * 0.22 * wF * (main ? 1 : 0.7);
      for (let i = 0; i < (main ? 46 : 20); i++) { const u = Math.pow(rnd(), 0.8), wd = bw * (0.85 + 0.45 * u), rr = h * (0.09 + rnd() * 0.07) * (main ? 1 : 0.75);
        puff(cx + (rnd() - 0.5) * wd * 1.6 + lean * u * hh, base - rr * 0.6 - u * (hh - rr * 1.2), rr, rr * 0.92, 0.55); } }
    if (cb) { const ay = base - h * 0.88;   // anvil: feathered, thick near the core, thinning downwind
      for (let i = 0; i < 34; i++) { const t = rnd(), ax = cx0 + lean * h + dir * (t * h * anvL - h * 0.2 * (1 - t)), th = h * (0.09 - 0.05 * t);
        puff(ax, ay + (rnd() - 0.3) * th * 0.8 + t * h * 0.03, h * (0.16 + rnd() * 0.1), th, 0.5 - 0.2 * t); }
      for (let i = 0; i < 6; i++) { const sx = cx0 + (rnd() - 0.5) * h * 0.45, rw = h * (0.06 + rnd() * 0.08), y0 = base - h * 0.06;   // soft rain shafts
        const g = x.createLinearGradient(sx - rw, 0, sx + rw, 0); g.addColorStop(0, `rgba(${shade},0)`); g.addColorStop(0.5, `rgba(${shade},.22)`); g.addColorStop(1, `rgba(${shade},0)`);
        x.save(); x.fillStyle = g; x.globalCompositeOperation = "destination-over"; x.beginPath(); x.moveTo(sx - rw, y0); x.lineTo(sx + rw, y0); x.lineTo(sx + rw * 1.3 + lean * h * 0.15, c.height); x.lineTo(sx - rw * 0.9 + lean * h * 0.15, c.height); x.closePath(); x.fill(); x.restore(); } }
    { const g = x.createLinearGradient(0, base - h * 0.35, 0, base); g.addColorStop(0, `rgba(${shade},0)`); g.addColorStop(1, `rgba(${mix(shade, [0, 0, 0], 0.2)},.9)`); x.globalCompositeOperation = "source-atop"; x.fillStyle = g; x.fillRect(0, base - h * 0.35, w, h * 0.35); x.globalCompositeOperation = "source-over"; }   // darker base
    c.baseY = base; c.cx = cx0; return (towerCache[key] = c);
  }

  // d24u: the horizon is the SCENE's horizon (C.hz = fraction from the top, from Photoreal.camera() for the WebGL stage, the canvas
  // preview's 0.66 otherwise) with its vertical field of view (C.vfov). Bases sit on that line, distant bases sink behind the earth's curve
  // (hidden height d²/2R), and everything is clipped to the sky above the horizon — towers never sit on the water.
  const towerGeo = (C, H) => ({ hzY: (C.hz != null ? C.hz : 0.6) * H, vf: C.vfov || 62 });
  // d27e: thunderheads are part of the distant sky — nearby radar cells merge into a few towers (no picket fence of columns), drawn on their own
  // layer whose base dissolves into the horizon haze, and kept above the surf crest when a hero wave is in view (never over the waves).
  let TL = null;
  function towerLayer(x) { const cv = x.canvas; if (!TL) TL = document.createElement("canvas"); if (TL.width !== cv.width || TL.height !== cv.height) { TL.width = cv.width; TL.height = cv.height; } const t = TL.getContext("2d"); t.setTransform(x.getTransform()); t.clearRect(0, 0, cv.width, cv.height); return t; }
  function towerFinish(x, t, W, H, hzY) { const L = g.PhotoStage && g.PhotoStage.last, hero = L && L.hero ? clamp(+L.hero) : 0, base = hzY + 1 - H * 0.03 * hero, fh = H * (0.018 + 0.025 * hero);
    t.globalCompositeOperation = "destination-out"; const gr = t.createLinearGradient(0, base - fh, 0, base); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.92)"); t.fillStyle = gr; t.fillRect(0, base - fh, W, fh); t.fillStyle = "#000"; t.fillRect(0, base, W, H); t.globalCompositeOperation = "source-over";
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(t.canvas, 0, 0); x.restore(); }
  function radarTowers(x0, W, H, hz0, C, now) {
    const { hzY, vf } = towerGeo(C, H), hf = 2 * Math.atan(Math.tan(vf * Math.PI / 360) * W / H) * 180 / Math.PI, ppd = H / vf, e = C.elev != null ? C.elev : 3;
    const x = towerLayer(x0);
    // merge cells within ~6° of bearing: strongest/tallest wins, nearest distance kept; at most 5 towers
    const raw = C.storms.cells.filter(c => Math.abs(c[0]) <= hf / 2 + 8).sort((a, b) => a[0] - b[0]), grp = [];
    for (const c of raw) { const L = grp[grp.length - 1]; if (L && Math.abs(c[0] - L[0]) < 6) { L[1] = Math.min(L[1], c[1]); L[2] = Math.max(L[2], c[2]); L[3] = Math.max(L[3] || 0, c[3] || 0); L[0] = (L[0] + c[0]) / 2; } else grp.push(c.slice()); }
    const cells = grp.sort((a, b) => (b[2] + (b[3] || 0)) - (a[2] + (a[3] || 0))).slice(0, 5).sort((a, b) => b[1] - a[1]); let flash = null; C._towerBases = [];
    for (const c of cells) { const [db, d, z, tk0] = c;
      const tk = tk0 != null && tk0 > 2 ? tk0 : z >= 50 ? 11 : 8, drop = d * d / 12742, ang = Math.atan((tk - drop) / d) * 180 / Math.PI; if (ang <= 0.05) continue;
      const hid = Math.atan(drop / d) * 180 / Math.PI * ppd, cb = z >= 45 || tk >= 8, h = Math.max(H * (cb ? 0.2 : 0.12) * clamp(1.25 - d / 300, 0.55, 1), (ang * ppd) + hid);   // d27f: distant cells still read as a thunderhead on the horizon
      const hb = Math.max(180, Math.round(h / 3) * 3), k = h / hb, B = towerBody(cb ? "cb" : "tcu", hb, e, Math.round(db * 131 + d * 17 + z * 7 + tk * 29)), cx = W / 2 + db / hf * W, baseY = hzY + hid;
      x.globalAlpha = clamp(1 - d / 500, 0.62, 0.95); x.drawImage(B, cx - B.cx * k, baseY - B.baseY * k, B.width * k, B.height * k); x.globalAlpha = 1; C._towerBases.push({ baseY, clipY: hzY, hid });
      if (cb && z >= 50 && (!flash || d < flash.d)) flash = { cx, cy: baseY - h * 0.45, h, d, db }; }
    if (flash) { const ph = (now + flash.db * 137) % 2700; if (ph < 140) { const a = (ph < 60 ? 0.55 : ph < 90 ? 0.12 : 0.4) * clamp((e + 9) / 6, 0.5, 1), gg = x.createRadialGradient(flash.cx, flash.cy, 2, flash.cx, flash.cy, flash.h * 0.4);
      gg.addColorStop(0, `rgba(235,235,255,${a})`); gg.addColorStop(1, "rgba(235,235,255,0)"); x.globalCompositeOperation = "lighter"; x.fillStyle = gg; x.fillRect(flash.cx - flash.h * 0.4, flash.cy - flash.h * 0.4, flash.h * 0.8, flash.h * 0.8); x.globalCompositeOperation = "source-over"; } }
    towerFinish(x0, x, W, H, hzY);
  }
  function towers(x0, W, H, hz0, C, now) {
    if (C.storms && C.storms.cells && C.storms.cells.length) return radarTowers(x0, W, H, hz0, C, now);
    const x = towerLayer(x0);
    const { hzY, vf } = towerGeo(C, H), ppd = H / vf, e = C.elev != null ? C.elev : 3, side = C.cbSide != null ? C.cbSide : 0.2; C._towerBases = [];   // forecast-only: no radar position → off to one side of the sun
    x.save();
    if (C.cb && (!C.cb.behind || C.turned)) { const d = C.cb.near ? 25 : 70, ang = Math.atan((11 - d * d / 12742) / d) * 180 / Math.PI, hid = Math.atan(d / 12742) * 180 / Math.PI * ppd, h = ang * ppd + hid, B = towerBody("cb", Math.round(h / 3) * 3, e, 4242 + (C.cb.near ? 1 : 0));
      x.drawImage(B, W * side - B.cx, hzY + hid - B.baseY); C._towerBases.push({ baseY: hzY + hid, clipY: hzY, hid });
      const ph = now % 3100; if (ph < 140) { const a = (ph < 60 ? 0.55 : 0.3), cx = W * side, cy = hzY - h * 0.5, g = x.createRadialGradient(cx, cy, 2, cx, cy, h * 0.35); g.addColorStop(0, `rgba(235,235,255,${a})`); g.addColorStop(1, "rgba(235,235,255,0)"); x.globalCompositeOperation = "lighter"; x.fillStyle = g; x.fillRect(cx - h * 0.4, cy - h * 0.4, h * 0.8, h * 0.8); x.globalCompositeOperation = "source-over"; } }
    if (C.tcu) { const d = 40, ang = Math.atan((5 * C.tcu - d * d / 12742) / d) * 180 / Math.PI, hid = Math.atan(d / 12742) * 180 / Math.PI * ppd, h = ang * ppd + hid, B = towerBody("tcu", Math.round(h / 3) * 3, e, 999); x.globalAlpha = 0.92; x.drawImage(B, W * (1 - side) - B.cx, hzY + hid - B.baseY); x.globalAlpha = 1; C._towerBases.push({ baseY: hzY + hid, clipY: hzY, hid }); }
    x.restore(); towerFinish(x0, x, W, H, hzY);
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

  // d26i: the real moon (SunCalc-style low-precision ephemeris). Position for the spot + slider time, lit fraction and bright-limb angle,
  // placed on the camera horizon like the other props (view centred on C.faceAz, ~H/base px per degree at zoom 1), dimmed by daylight and cloud.
  const RAD = Math.PI / 180, J2000 = 2451545;
  function moonCalc(t, lat, lng) { const d = t / 86400 + 2440587.5 - J2000, e = RAD * 23.4397;
    // d28s: Meeus ch.47 main periodic terms (was SunCalc 1-term: up to 2° alt / 6° az / 14 min rise-set error) + topocentric parallax below
    const Tc_ = d / 36525, Lp = 218.3164477 + 481267.88123421 * Tc_, Dm_ = 297.8501921 + 445267.1114034 * Tc_, Mm_ = 357.5291092 + 35999.0502909 * Tc_, Mp = 134.9633964 + 477198.8675055 * Tc_, Fm_ = 93.272095 + 483202.0175233 * Tc_, Ec_ = 1 - 0.002516 * Tc_;
    const Sm_ = (tb, fn) => tb.reduce((z, [c, a, b2, cc, dd]) => z + c * (Math.abs(b2) === 1 ? Ec_ : 1) * fn(RAD * (a * Dm_ + b2 * Mm_ + cc * Mp + dd * Fm_)), 0);
    const TL = [[6288774,0,0,1,0],[1274027,2,0,-1,0],[658314,2,0,0,0],[213618,0,0,2,0],[-185116,0,1,0,0],[-114332,0,0,0,2],[58793,2,0,-2,0],[57066,2,-1,-1,0],[53322,2,0,1,0],[45758,2,-1,0,0],[-40923,0,1,-1,0],[-34720,1,0,0,0],[-30383,0,1,1,0],[15327,2,0,0,-2],[-12528,0,0,1,2],[10980,0,0,1,-2],[10675,4,0,-1,0],[10034,0,0,3,0],[8548,4,0,-2,0],[-7888,2,1,-1,0],[-6766,2,1,0,0],[-5163,1,0,-1,0]];
    const TR = [[-20905355,0,0,1,0],[-3699111,2,0,-1,0],[-2955968,2,0,0,0],[-569925,0,0,2,0],[48888,0,1,0,0],[-3149,0,0,0,2],[246158,2,0,-2,0],[-152138,2,-1,-1,0],[-170733,2,0,1,0],[-204586,2,-1,0,0],[-129620,0,1,-1,0],[108743,1,0,0,0],[104755,0,1,1,0]];
    const TB = [[5128122,0,0,0,1],[280602,0,0,1,1],[277693,0,0,1,-1],[173237,2,0,0,-1],[55413,2,0,-1,1],[46271,2,0,-1,-1],[32573,2,0,0,1],[17198,0,0,2,1],[9266,2,0,1,-1],[8822,0,0,2,-1]];
    const l = RAD * (Lp + Sm_(TL, Math.sin) / 1e6), b = RAD * Sm_(TB, Math.sin) / 1e6, dist = 385000.56 + Sm_(TR, Math.cos) / 1000;
    const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)), dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
    const lw = RAD * -lng, ph = RAD * lat, H = RAD * (280.46061837 + 360.98564736629 * d) - lw - ra;
    let alt = Math.asin(Math.sin(ph) * Math.sin(dec) + Math.cos(ph) * Math.cos(dec) * Math.cos(H)); alt -= Math.asin(6378.14 / dist * Math.cos(alt)); /* d28s: topocentric parallax (~0.95°) */ const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(ph) - Math.tan(dec) * Math.cos(ph));
    alt += RAD * 0.017 / Math.tan(alt + RAD * 10.26 / (alt / RAD + 5.10)) * (alt > -0.03 ? 1 : 0);   // refraction near the horizon
    // sun
    const Ms = RAD * (357.5291 + 0.98560028 * d), C0 = RAD * (1.9148 * Math.sin(Ms) + 0.02 * Math.sin(2 * Ms) + 0.0003 * Math.sin(3 * Ms)), ls = Ms + C0 + RAD * 102.9372 + Math.PI;
    const sdec = Math.asin(Math.sin(0) * Math.cos(e) + Math.cos(0) * Math.sin(e) * Math.sin(ls)), sra = Math.atan2(Math.sin(ls) * Math.cos(e), Math.cos(ls));
    const phi = Math.acos(Math.sin(sdec) * Math.sin(dec) + Math.cos(sdec) * Math.cos(dec) * Math.cos(sra - ra)), inc = Math.atan2(149598000 * Math.sin(phi), dist - 149598000 * Math.cos(phi));
    const ang = Math.atan2(Math.cos(sdec) * Math.sin(sra - ra), Math.sin(sdec) * Math.cos(dec) - Math.cos(sdec) * Math.sin(dec) * Math.cos(sra - ra));
    const pa = Math.atan2(Math.sin(H), Math.tan(ph) * Math.cos(dec) - Math.sin(dec) * Math.cos(H));   // parallactic angle
    const frac = (1 + Math.cos(inc)) / 2, phase = 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI;
    return { alt: alt / RAD, az: (az / RAD + 180 + 360) % 360, frac, phase, limb: ang - pa, pa }; }
  function phaseName(p) { return p < 0.03 || p > 0.97 ? "New moon" : p < 0.22 ? "Waxing crescent" : p < 0.28 ? "First quarter" : p < 0.47 ? "Waxing gibbous" : p < 0.53 ? "Full moon" : p < 0.72 ? "Waning gibbous" : p < 0.78 ? "Last quarter" : "Waning crescent"; }
  function moonTex() { const I = moonTex.i || (moonTex.i = Object.assign(new Image(), { src: "img/moon-near.png?v=d28p" })); return I.complete && I.naturalWidth ? I : null; }
  function moon(x, W, H, hz0, C) { const m = C.moonPos; if (!m || m.alt < -1.2 || m.frac < 0.02) return;
    const base = W / H < 1 ? 62 : W / H < 1.5 ? 50 : 40, ppd = H / base, dAz = ((m.az - C.faceAz + 540) % 360) - 180;
    const r = Math.max(8.8, 1.04 * ppd), lowF = clamp(1 - (m.alt - 0.5) / 2.5), flat = 1 - 0.16 * lowF;   // d28i: Sean — drawn 4x the true 0.52°; d28o: refraction flattening near the horizon
    const cx = W / 2 + dAz * ppd, cy = hz0 - m.alt * ppd, ridgeY = hz0 - (C.ridge || 0) * ppd;
    if (cx < -3 * r || cx > W + 3 * r || cy < -3 * r || cy - r * flat > ridgeY) return;
    // d28o: cloud transmittance by layer — thick low overcast hides it fully, mid dims strongly, thin cirrus barely (was: total cloud > 35 % incl. cirrus)
    const se = C.sunElev != null ? C.sunElev : -10, day = clamp((se + 4) / 10), L3 = C.cloudL || [C.cloud || 0, 0, 0];
    const tr = (1 - 0.95 * clamp((L3[0] - 20) / 75)) * (1 - 0.7 * clamp((L3[1] - 30) / 65)) * (1 - 0.25 * clamp(L3[2] / 100));
    const ext = 0.45 + 0.55 * clamp((m.alt + 1) / 4);   // extinction dims it right at the horizon
    const a = clamp(1 - 0.6 * day) * tr * ext * (0.25 + 0.75 * clamp(m.frac / 0.3)) * (1 - 0.5 * day * clamp(1 - m.frac / 0.15));   // d28o: thin crescent near the sun is dim, near-invisible in bright twilight if (a <= 0.02) return;
    const tint = clamp(1 - m.alt / 9), col = `rgba(${Math.round(250 - 5 * tint)},${Math.round(240 - 85 * tint)},${Math.round(222 - 165 * tint)},`;   // yellow-white aloft → deep orange at the horizon
    g.__agMoon = { cx, cy, r, a: +a.toFixed(3), alt: m.alt, frac: m.frac };
    if (C.moonWater && day < 0.85 && m.alt < 30) {   // reflection: a soft broken glitter path of short horizontal ripples, widening toward you, fading with depth
      let sd = 3; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647, T = (g.performance ? performance.now() : 0) / 1000, A0 = 0.55 * a * (1 - day) * (0.4 + 0.6 * m.frac), dep = (H - hz0) * 0.55;
      x.save(); for (let i = 0; i < 70; i++) { const f = Math.pow(rnd(), 1.6), yy = hz0 + 1 + f * dep, w = r * (0.35 + 1.4 * f) * (0.4 + rnd()), sx = (rnd() - 0.5) * r * (0.6 + 2.2 * f) + Math.sin(T * 0.8 + i) * r * 0.08;
        const al = A0 * (1 - f) * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(T * 1.3 + i * 2.1))); if (al < 0.01) continue;
        const q = x.createLinearGradient(cx + sx - w, 0, cx + sx + w, 0), rc = m.alt > 6 ? "rgba(215,224,240," : col; q.addColorStop(0, rc + "0)"); q.addColorStop(0.5, rc + (al * 0.95).toFixed(3) + ")"); q.addColorStop(1, rc + "0)"); x.fillStyle = q; x.fillRect(cx + sx - w, yy, w * 2, 0.8 + 2.2 * f); } x.restore(); }
    x.save(); x.beginPath(); x.rect(-W, -H, W * 3, ridgeY + H); x.clip();   // sinks behind the far shore's tree line / horizon
    // d28p: small, soft, cool halo (much smaller than the sun's) so it reads as the moon
    { const dk = 1 - day, wm = clamp(1 - m.alt / 12), hc = `${Math.round(205 + 45 * wm)},${Math.round(215 - 15 * wm)},${Math.round(238 - 90 * wm)}`, fa = a * (0.3 + 0.7 * m.frac);   // d28q: Sean "glow a bit more" — halo ~3.8r + faint wide aureole, scaled by sky darkness, warmer low
      if (dk > 0.05) { const au = x.createRadialGradient(cx, cy, r, cx, cy, r * 9); au.addColorStop(0, `rgba(${hc},${(0.1 * fa * dk * dk).toFixed(3)})`); au.addColorStop(1, `rgba(${hc},0)`); x.fillStyle = au; x.beginPath(); x.arc(cx, cy, r * 9, 0, 6.283); x.fill(); }
      const gw = x.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 3.8); gw.addColorStop(0, `rgba(${hc},${(fa * (0.08 + 0.26 * dk)).toFixed(3)})`); gw.addColorStop(0.4, `rgba(${hc},${(fa * (0.03 + 0.09 * dk)).toFixed(3)})`); gw.addColorStop(1, `rgba(${hc},0)`); x.fillStyle = gw; x.beginPath(); x.arc(cx, cy, r * 3.8, 0, 6.283); x.fill(); }
    // d28p: real near-side albedo (NASA SVS CGI Moon Kit / LRO, public domain) — maria, highlands, Tycho, Copernicus — north rotated by the
    // parallactic angle, tinted cool silver aloft → orange low; phase terminator on top (soft edge), faint earthshine maria on the dark side
    const T = moonTex(); x.translate(cx, cy); x.scale(1, flat);
    if (T) { const tint = clamp(1 - m.alt / 12), tc = [Math.round(232 + 20 * tint), Math.round(236 - 70 * tint), Math.round(245 - 150 * tint)], S = Math.ceil(r * 2 * (g.devicePixelRatio || 1));
      let oc = moonTex.oc; if (!oc) oc = moonTex.oc = document.createElement("canvas"); if (oc.width !== S) { oc.width = oc.height = S; }
      const o = oc.getContext("2d"); o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, S, S); o.globalCompositeOperation = "source-over"; o.drawImage(T, 0, 0, S, S);
      o.globalCompositeOperation = "multiply"; o.fillStyle = `rgb(${tc})`; o.fillRect(0, 0, S, S); o.globalCompositeOperation = "destination-in"; o.drawImage(T, 0, 0, S, S); o.globalCompositeOperation = "source-over";
      const pa = m.pa || 0, rot = -m.limb - Math.PI / 2, kk = 1 - 2 * m.frac;
      x.save(); x.rotate(pa); x.globalAlpha = clamp(0.1 * a * (1 - day)); x.drawImage(oc, -r, -r, r * 2, r * 2); x.restore();   // earthshine
      const lit = sc => { x.beginPath(); x.arc(0, 0, r * sc, -Math.PI / 2, Math.PI / 2, false); x.ellipse(0, 0, Math.abs(kk) * r * sc, r * sc, 0, Math.PI / 2, -Math.PI / 2, kk > 0); };
      for (const [sc, al, op] of [[1.03, 0.35], [1, 1], [1, 0.22 + 0.18 * (1 - day), "lighter"]]) { x.save(); x.rotate(rot); lit(sc); x.clip(); x.rotate(pa - rot); x.globalAlpha = clamp(a * al); if (op) x.globalCompositeOperation = op; x.drawImage(oc, -r, -r, r * 2, r * 2); x.restore(); }   // soft terminator: faint wider pass + main pass
    } else { x.rotate(-m.limb - Math.PI / 2); const k = 1 - 2 * m.frac; x.fillStyle = col + a.toFixed(3) + ")"; x.beginPath(); x.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false); x.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0); x.fill(); }
    x.restore(); }
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
    // d26g: world-locked props. The scene zooms by narrowing the camera FOV (pinch / zoom slider → fovMul), so screen offsets from the
    // image centre scale by k = tan(base/2)/tan(vfov/2). Props are drawn at zoom 1 on the unzoomed horizon, then scaled by k about the
    // centre — the horizon lands exactly on the scene's current horizon (C.hz) and position/size track the sky and sun.
    { const hzF = C.hz != null ? C.hz : 0.6, a = W / H, base = a < 1 ? 62 : a < 1.5 ? 50 : 40, k = C.vfov && C.vfov !== 20 ? Math.tan(base * Math.PI / 360) / Math.tan(C.vfov * Math.PI / 360) : 1;
      const hz0 = (0.5 + (hzF - 0.5) / k) * H; g.__agPropK = k;
      if (C.moonPos && C.faceAz != null) { x.save(); x.translate(W / 2, H / 2); x.scale(k, k); x.translate(-W / 2, -H / 2); moon(x, W, H, hz0, C); x.restore(); }
      if (C.steam) { x.save(); x.translate(W / 2, H / 2); x.scale(k, k); x.translate(-W / 2, -H / 2); steam(x, W, H, hz0, C, now); x.restore(); }   // d28j: river steam fog, world-locked
      if (C.house) { x.save(); x.translate(W / 2, H / 2); x.scale(k, k); x.translate(-W / 2, -H / 2); house(x, W, H, hz0, C); x.restore(); }   // d28g: 558 Plantation Pl across the lawn (Mattaponi land side)
      if (C.carrier || C.chinook || C.ghost) { x.save(); x.translate(W / 2, H / 2); x.scale(k, k); x.translate(-W / 2, -H / 2);
        if (C.carrier) { carrier(x, W, H, hz0, C, now); heli(x, W, H, hz0, C, now); } if (C.chinook) chinook(x, W, H, hz0, C, now); if (C.ghost) ghostTree(x, W, H, hz, C, now); x.restore(); } }
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
      // d28c: surf lines drawn as smooth tapered runs (was 90 hard-edged rectangles → stair steps on phones)
      const N = 90, pts = [];
      for (let k = 0; k <= N; k++) {
        const u = k / N, peak = S.combo ? Math.pow(Math.abs(Math.sin(u * Math.PI * 3 + r * 1.7)), 2) : 1, n = Math.sin(u * 37 + r * 5 + now * 0.0007) * 0.5 + 0.5;
        const on = S.off ? (n > 0.35 && peak > 0.4) : n > 0.15;
        pts.push(on ? { X: u * W, yy: y + rel * 30 * d * (1 - 2 * u) - peak * thick * 0.6, al: a * (0.35 + 0.4 * n) * (S.combo ? peak : 1), th: thick * (0.6 + n) } : null); }
      const run = (seg, foam) => { if (seg.length < 2) return; const g = x.createLinearGradient(seg[0].X, 0, seg[seg.length - 1].X, 0), L = seg.length - 1;
        seg.forEach((q, i) => { const tp = Math.min(1, Math.min(i, L - i) / 2.5); g.addColorStop(i / L, foam ? `rgba(235,225,230,${(q.al * 0.35 * tp).toFixed(3)})` : `rgba(255,236,226,${(q.al * tp).toFixed(3)})`); });
        const top = q => foam ? q.yy + thick : q.yy, bot = q => foam ? q.yy + thick + thick * 2.5 * ph : q.yy + q.th;
        x.fillStyle = g; x.beginPath(); x.moveTo(seg[0].X, (top(seg[0]) + bot(seg[0])) / 2);
        for (let i = 1; i <= L; i++) { const p0 = seg[i - 1], p1 = seg[i]; x.quadraticCurveTo(p0.X, top(p0), (p0.X + p1.X) / 2, (top(p0) + top(p1)) / 2); }
        x.lineTo(seg[L].X, (top(seg[L]) + bot(seg[L])) / 2);
        for (let i = L; i >= 1; i--) { const p0 = seg[i], p1 = seg[i - 1]; x.quadraticCurveTo(p0.X, bot(p0), (p0.X + p1.X) / 2, (bot(p0) + bot(p1)) / 2); }
        x.closePath(); x.fill(); };
      let seg = []; for (const q of pts.concat([null])) { if (q) seg.push(q); else { run(seg, false); if (!S.off && ph > 0.5) run(seg, true); seg = []; } }
    }
    x.restore();
  }
  // Grandview Beach landmark: bare dead trees (eroded maritime forest) standing in the surf — soft, haze-faded silhouettes
  // d26a: Fort Monroe — a distant US Navy carrier (Nimitz/Ford profile) hull-down on the horizon, left of the sun column.
  // Flat flight deck with the angled-deck overhang, island right of centre with mast + radar; hazy silhouette, gold rim at low sun,
  // a few tiny deck/nav lights in twilight, faint wake.
  const k1 = (hz, dpr) => (g.__agPropK || 1) === 1 ? Math.round(hz * dpr) / dpr : hz;
  function carrier(x, W, H, hz, C, now) { const e = C.elev != null ? C.elev : 5, L = Math.max(120, W * 0.26), u = L / 100, cx = W * 0.22, dpr = Math.min(2, g.devicePixelRatio || 1), y = k1(hz, dpr);   // d26g: 2× (26% of frame), waterline snapped to the device-pixel row of the horizon
    const lt = clamp((e + 2) / 12), haze = 0.92 - 0.12 * lt, col = `rgba(${Math.round(30 + 46 * lt)},${Math.round(33 + 48 * lt)},${Math.round(40 + 52 * lt)},${haze.toFixed(2)})`;   // d26f: darker, less haze — readable on a phone
    x.save(); x.translate(cx - L / 2, y); x.fillStyle = col; x.beginPath();
    x.moveTo(0, -3.2 * u); x.lineTo(1.5 * u, 0); x.lineTo(97 * u, 0); x.lineTo(100 * u, -3 * u);   // hull (bow right), flat waterline exactly at the horizon (y = 0)
    x.lineTo(100 * u, -4.2 * u); x.lineTo(70 * u, -4.4 * u); x.lineTo(58 * u, -5.4 * u); x.lineTo(14 * u, -5.4 * u); x.lineTo(2 * u, -4.6 * u); x.closePath(); x.fill();   // deck + angled-deck overhang (port side, aft)
    x.fillRect(60 * u, -10 * u, 7 * u, 4.8 * u); x.fillRect(61.5 * u, -12.5 * u, 4 * u, 2.6 * u);   // island, two tiers (starboard, right of centre)
    x.fillRect(63.2 * u, -17 * u, 0.9 * u, 4.6 * u); x.fillRect(61.6 * u, -15.6 * u, 4.2 * u, 0.7 * u);   // mast + yard
    x.beginPath(); x.ellipse(65.6 * u, -13.2 * u, 1.3 * u, 0.6 * u, 0, 0, 6.283); x.fill();   // radar
    for (const [a, b] of [[24, 30], [36, 41], [46, 51]]) { x.fillRect(a * u, -6.2 * u, (b - a) * u, 0.8 * u); }   // parked aircraft bumps
    const rim = e > -3 && e < 12 && !C.turned ? clamp(1 - Math.abs(e - 2) / 10) : 0;
    if (rim > 0.05) { x.fillStyle = `rgba(255,190,100,${(0.45 * rim).toFixed(2)})`; x.fillRect(14 * u, -5.6 * u, 44 * u, 0.5 * u); x.fillRect(60 * u, -10.2 * u, 7 * u, 0.5 * u); }
    if (e < 0) { const tw = clamp(-e / 6), bl = (Math.floor(now / 1000) % 2) ? 1 : 0.35;   // twilight: deck edge + island + masthead lights
      x.fillStyle = `rgba(255,236,190,${(0.8 * tw).toFixed(2)})`; for (const k of [10, 22, 34, 46, 56, 72, 86]) x.fillRect(k * u, -5.2 * u, 0.7, 0.7);
      x.fillStyle = `rgba(255,250,235,${(0.9 * tw).toFixed(2)})`; x.fillRect(63.5 * u, -17.3 * u, 1, 1);
      x.fillStyle = `rgba(255,70,60,${(0.85 * tw * bl).toFixed(2)})`; x.fillRect(66 * u, -12.8 * u, 1, 1); x.fillStyle = `rgba(80,255,120,${(0.7 * tw).toFixed(2)})`; x.fillRect(99 * u, -3.8 * u, 1, 1); }
    { const wb = x.createLinearGradient(0, -0.5 * u, 0, 1.4 * u); wb.addColorStop(0, "rgba(70,78,92,0)"); wb.addColorStop(0.35, `rgba(${Math.round(60 + 50 * lt)},${Math.round(68 + 52 * lt)},${Math.round(82 + 56 * lt)},.55)`); wb.addColorStop(1, "rgba(60,68,82,0)");
      x.fillStyle = wb; x.fillRect(-2 * u, -0.5 * u, 104 * u, 1.9 * u); }   // water band over the waterline so the hull sits IN the sea
    const wk = (now / 4000) % 1; x.strokeStyle = `rgba(235,238,240,${(0.18 + 0.1 * lt).toFixed(2)})`; x.lineWidth = 0.8;   // faint wake astern + bow wave
    x.beginPath(); x.moveTo(0, 0.4); x.lineTo(-18 * u - wk * 4 * u, 0.9); x.stroke(); x.beginPath(); x.moveTo(99 * u, 0.2); x.lineTo(104 * u, 0.6); x.stroke();
    x.restore(); }
  // d26b: Fort Monroe — a CH-53K King Stallion passing by (real time, independent of the slider: one ~13 s pass every 15 s).
  // Heavy-lift body, nose refuelling probe, side sponsons, tall tail pylon with a canted tail rotor, 7-blade main rotor as a blurred disc.
  function heli(x, W, H, hz, C, now) { const P = 15000, D = 13000, ph = now % P; if (ph > D) return; const f = ph / D, e = C.elev != null ? C.elev : 5;
    const u = Math.max(0.28, W / 1400), cx = -60 * u + f * (W + 120 * u), cy = hz - H * (0.3 + 0.03 * Math.sin(f * 3.1)) + Math.sin(now / 700) * 0.6;
    const lt = clamp((e + 2) / 12), col = `rgba(${Math.round(34 + 60 * lt)},${Math.round(38 + 62 * lt)},${Math.round(44 + 64 * lt)},${(0.8 - 0.15 * lt).toFixed(2)})`;
    x.save(); x.translate(cx, cy); x.scale(u, u); x.fillStyle = col; x.strokeStyle = col;
    x.beginPath(); x.moveTo(-26, -4); x.quadraticCurveTo(-24, -11, -12, -11); x.lineTo(16, -11); x.quadraticCurveTo(26, -10, 29, -3); x.quadraticCurveTo(28, 2, 20, 3); x.lineTo(-22, 3); x.closePath(); x.fill();   // fuselage (nose right)
    x.beginPath(); x.moveTo(-22, -9); x.lineTo(-50, -12); x.lineTo(-52, -26); x.lineTo(-47, -26); x.lineTo(-44, -14); x.lineTo(-22, -3); x.closePath(); x.fill();   // tail boom + tall pylon
    x.fillRect(-8, -15, 18, 4); x.fillRect(-2, -18, 5, 3);   // engine housings + rotor mast
    x.beginPath(); x.ellipse(2, 3, 11, 3, 0, 0, 6.283); x.fill();   // sponsons
    x.lineWidth = 1; x.beginPath(); x.moveTo(27, -6); x.lineTo(40, -9); x.stroke();   // refuelling probe
    x.fillRect(-14, 3, 1.2, 4); x.fillRect(14, 3, 1.2, 4);   // gear legs
    const spin = now / 40;
    x.save(); x.globalAlpha = 0.28; x.beginPath(); x.ellipse(0.5, -19, 40, 2.4, 0, 0, 6.283); x.fill(); x.restore();   // main rotor disc (motion blur)
    x.lineWidth = 0.7; x.globalAlpha = 0.55; for (let k = 0; k < 7; k++) { const a = spin + k * 0.8976, c = Math.cos(a); if (Math.abs(c) < 0.3) continue; x.beginPath(); x.moveTo(0.5, -19); x.lineTo(0.5 + 40 * c, -19 + 2 * Math.sin(a)); x.stroke(); }   // 7 blades flicker
    x.globalAlpha = 0.35; x.save(); x.translate(-50, -22); x.rotate(-0.35); x.beginPath(); x.ellipse(0, 0, 2, 8, 0, 0, 6.283); x.fill(); x.restore(); x.globalAlpha = 1;   // canted tail rotor
    const rim = e > -3 && e < 12 && !C.turned ? clamp(1 - Math.abs(e - 2) / 10) : 0;
    if (rim > 0.05) { x.fillStyle = `rgba(255,190,100,${(0.5 * rim).toFixed(2)})`; x.fillRect(-12, -11.6, 28, 0.9); }
    if (e < 0) { const tw = clamp(-e / 5), on = (now % 1200) < 120;
      if (on) { x.fillStyle = `rgba(255,60,50,${tw.toFixed(2)})`; x.fillRect(-3, -17, 2.2, 2.2); x.fillRect(-1, 3, 2, 2); }   // anti-collision beacons
      x.fillStyle = `rgba(90,255,130,${(0.8 * tw).toFixed(2)})`; x.fillRect(4, 1, 1.6, 1.6); x.fillStyle = `rgba(255,255,240,${(0.8 * tw).toFixed(2)})`; x.fillRect(-51, -25, 1.6, 1.6); }
    x.restore(); }
  // d26e: Mattaponi Meditation — a CH-47 Chinook flying LOW over the river, just above the treeline (real-time pass every 15 s, like the
  // Fort Monroe CH-53K). Long boxy fuselage, tandem 3-blade rotors (front low on the cockpit, rear on the tall aft pylon) as blurred discs,
  // fixed gear, rear ramp; a faint rotor-wash ripple on the water beneath it.
  // d28g: the cream two-storey farmhouse at 558 Plantation Pl (Sean's Zillow photo): dark gray roof, two front gables + entry gable,
  // black shutters, full-width white-railed wraparound porch, brick stair, round shrubs, trees around it. ~32 m wide, ~11 m to the ridge,
  // ~95 m across the lawn (camera 1.7 m). Front-lit by the low sun behind you at sunset; backlit (sun behind the house) at sunrise.
  // d28j: steam fog — soft wisps hugging the water: densest along the far tree line, a second thinner band near shore, thinning upward,
  // drifting slowly; lit sunrise pink/orange when the sun is near the horizon, cool gray-blue before dawn. Density ∝ chance.
  function steam(x, W, H, hz, C, now) {   // d28m: Sean's pot-steam refs — dense soft billowy layer at the water breaking into long thin curling filaments
    // that twist upward (curl-noise ribbons, features travel up the strand), translucent with bright backlit pink/orange edges, fading with height.
    g.__agSteam = C.steam; const e = C.elev != null ? C.elev : 0, burn = 1 - (u => u * u * (3 - 2 * u))(clamp(e / 5));   // d28n: burns off as the sun climbs: full ≤ 0°, gone by 5°
    if (burn <= 0.01) return; const d = (0.3 + 0.7 * clamp(C.steam.p / 85)) * (0.35 + 0.65 * burn), warm = clamp((e + 6) / 6) * clamp((10 - e) / 8), lit = clamp((e + 9) / 10);
    const r = Math.round(180 + 75 * lit), gC = Math.round(182 + 50 * lit - 25 * warm), b = Math.round(192 + 40 * lit - 65 * warm), col = a => `rgba(${r},${gC},${b},${a.toFixed(3)})`;
    const er = 255, eg = Math.round(200 + 30 * (1 - warm)), eb = Math.round(170 + 60 * (1 - warm)), ecol = a => `rgba(${er},${eg},${eb},${a.toFixed(3)})`, T = now / 1000;
    // billowy base: overlapping soft puffs sitting on the water, slowly breathing
    let sd = 5; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 46; i++) { const u = rnd(), v = rnd(), near = i >= 30, z = near ? 1.6 + 2.4 * v : 1, y0 = near ? hz + H * (0.03 + 0.16 * v * v) : hz + H * 0.003;
      if (rnd() > burn * 1.15) continue; const cx = ((u * W * 1.3 + T * 1.5 * z) % (W * 1.3)) - W * 0.15, rw = W * 0.05 * z * (0.4 + 0.6 * burn) * (0.7 + 0.6 * rnd()), rh = rw * (0.28 + 0.08 * Math.sin(T * 0.5 + i)), a = d * (near ? 0.22 : 0.38);
      x.save(); x.translate(cx, y0 - rh * 0.4); x.scale(1, rh / rw); const q = x.createRadialGradient(0, 0, 0, 0, 0, rw); q.addColorStop(0, col(a)); q.addColorStop(0.6, col(a * 0.4)); q.addColorStop(1, col(0)); x.fillStyle = q; x.beginPath(); x.arc(0, 0, rw, 0, 6.283); x.fill(); x.restore(); }
    // rising filaments: many plumes side by side; each strand is a ribbon whose sideways curl pattern scrolls upward (rise ~15 s)
    const NP = Math.round((30 + 36 * d) * (0.3 + 0.7 * burn)); x.lineCap = "round"; x.lineJoin = "round";
    for (let i = 0; i < NP; i++) { const u = rnd(), v = rnd(), near = i % 5 === 4, z = near ? 1.4 + 1.2 * v : 0.8 + 0.5 * v, base = near ? hz + H * (0.03 + 0.12 * v * v) : hz + H * 0.004;
      const bx = ((u * W * 1.3 + T * 1.2 * z) % (W * 1.3)) - W * 0.15, Hh = H * 0.09 * z * (0.3 + 0.7 * burn) * (0.7 + 0.6 * rnd()), sp = 0.9 + 0.4 * rnd(), s1 = rnd() * 50;
      for (let k = 0; k < 3; k++) { const sk = s1 + k * 2.7, N = 16, pts = [];
        for (let n = 0; n <= N; n++) { const f = n / N, y = base - Hh * f, ph = f * 3.4 - T * 0.4 * sp + sk;   // phase travels up the strand
          const amp = W * 0.026 * z * (0.2 + 1.4 * f), xo = amp * (Math.sin(ph) + 0.55 * Math.sin(ph * 2.3 + sk) + 0.3 * Math.sin(ph * 4.1 - T * 0.3)) + W * 0.008 * z * (k - 1) * (1 + 4 * f);
          pts.push([bx + xo, y, f]); }
        for (let n = 0; n < N; n++) { const [x1, y1, f] = pts[n], [x2, y2] = pts[n + 1], fade = burn * d * Math.pow(1 - f, 1.4) * (0.6 + 0.4 * Math.sin(T * 0.35 + sk + f * 3));
          x.strokeStyle = col(0.09 * fade); x.lineWidth = W * 0.032 * z * (0.35 + 0.65 * burn) * (1.3 - 0.5 * f); x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();   // soft translucent body
          x.strokeStyle = ecol(0.2 * fade); x.lineWidth = Math.max(0.6, W * 0.0022 * z * (1 - 0.5 * f)); x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); } } }   // bright backlit edge filament
  }
  function house(x, W, H, hz, C) {
    const a = W / H, vf = a < 1 ? 62 : a < 1.5 ? 50 : 40, ppd = H / vf, D = 95, m = ppd * 180 / Math.PI / D;   // px per metre at D
    const cx = W * 0.6, gy = hz + 1.7 * m, e = C.elev != null ? C.elev : 3, front = !!C.house.front;
    const L = Math.max(0.12, Math.min(1, (e + 6) / 14)), sun = front ? Math.max(0, Math.min(1, (e + 1.5) / 6)) : 0;
    const sh = (r, g, b, k) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
    const lit = (r, g, b) => { const k = L * (front ? 0.75 + 0.5 * sun : 0.45); return `rgb(${Math.min(255, Math.round(r * k * (1 + 0.18 * sun)))},${Math.min(255, Math.round(g * k * (1 + 0.04 * sun)))},${Math.min(255, Math.round(b * k * (1 - 0.12 * sun)))})`; };
    const X = v => cx + v * m, Y = v => gy - v * m;
    // trees behind/around the house
    x.fillStyle = sh(32, 44, 30, L * 0.9 + 0.1);
    for (let i = -9; i <= 9; i++) { const tx = X(i * 3.4 + (i % 3) * 0.8), th = (i < -4 || i > 5 ? 14 : 12.5) + ((i * 37) % 5); x.beginPath(); x.ellipse(tx, Y(th * 0.62), 3.2 * m, th * 0.42 * m, 0, 0, 6.283); x.fill(); }
    x.beginPath(); x.ellipse(X(-21), Y(7), 5 * m, 8 * m, 0, 0, 6.283); x.ellipse(X(21), Y(6.5), 4.5 * m, 7.5 * m, 0, 0, 6.283); x.fill();
    const wall = lit(236, 226, 186), roof = sh(70, 72, 76, L * 0.75 + 0.1), trim = lit(250, 248, 240), shut = sh(18, 18, 20, 1), win = sh(40, 46, 54, L * 0.8 + 0.2);
    // side wings (lower roofs left/right) + main block
    x.fillStyle = wall; x.fillRect(X(-16), Y(5.5), 32 * m, 5.5 * m);
    x.fillStyle = roof; x.beginPath(); x.moveTo(X(-16.5), Y(5.5)); x.lineTo(X(-13), Y(8.6)); x.lineTo(X(13), Y(8.6)); x.lineTo(X(16.5), Y(5.5)); x.fill();
    x.fillStyle = wall; x.fillRect(X(-9), Y(8.8), 18 * m, 4.6 * m);
    x.fillStyle = roof; x.beginPath(); x.moveTo(X(-10), Y(8.8)); x.lineTo(X(-7), Y(12.4)); x.lineTo(X(7), Y(12.4)); x.lineTo(X(10), Y(8.8)); x.fill();
    for (const gx of [-5.2, 5.2]) {   // two front gables
      x.fillStyle = wall; x.beginPath(); x.moveTo(X(gx - 3.3), Y(8.8)); x.lineTo(X(gx), Y(12.2)); x.lineTo(X(gx + 3.3), Y(8.8)); x.fill();
      x.strokeStyle = trim; x.lineWidth = Math.max(1, 0.25 * m); x.beginPath(); x.moveTo(X(gx - 3.6), Y(8.6)); x.lineTo(X(gx), Y(12.4)); x.lineTo(X(gx + 3.6), Y(8.6)); x.stroke();
      x.fillStyle = win; x.beginPath(); x.arc(X(gx), Y(10.2), 0.45 * m, Math.PI, 0); x.fillRect(X(gx - 0.45), Y(10.2), 0.9 * m, 0.6 * m); x.fill(); }
    // upper windows with black shutters
    for (const wx of [-7.3, -5.9, -3.1, 3.1, 5.9, 7.3]) { x.fillStyle = win; x.fillRect(X(wx - 0.5), Y(8.4), 1 * m, 1.5 * m); x.fillStyle = shut; x.fillRect(X(wx - 0.85), Y(8.4), 0.32 * m, 1.5 * m); x.fillRect(X(wx + 0.53), Y(8.4), 0.32 * m, 1.5 * m); }
    // porch roof (full width) + entry gable
    x.fillStyle = roof; x.fillRect(X(-16.5), Y(5.1), 33 * m, 0.9 * m);
    x.fillStyle = wall; x.beginPath(); x.moveTo(X(-2.4), Y(5.6)); x.lineTo(X(0), Y(7.3)); x.lineTo(X(2.4), Y(5.6)); x.fill();
    x.strokeStyle = trim; x.beginPath(); x.moveTo(X(-2.7), Y(5.4)); x.lineTo(X(0), Y(7.5)); x.lineTo(X(2.7), Y(5.4)); x.stroke();
    // porch: shade under the roof, ground-floor windows + shutters, door, white columns and railing
    x.fillStyle = sh(150, 140, 112, L * (front ? 0.7 : 0.45)); x.fillRect(X(-16), Y(4.2), 32 * m, 3.0 * m);
    for (const wx of [-13, -10.5, -7, -4, 4, 7, 10.5, 13]) { x.fillStyle = win; x.fillRect(X(wx - 0.55), Y(3.4), 1.1 * m, 2 * m); x.fillStyle = shut; x.fillRect(X(wx - 0.95), Y(3.4), 0.35 * m, 2 * m); x.fillRect(X(wx + 0.6), Y(3.4), 0.35 * m, 2 * m); }
    x.fillStyle = sh(40, 30, 26, L * 0.8 + 0.1); x.fillRect(X(-0.7), Y(3.6), 1.4 * m, 2.4 * m);
    x.fillStyle = trim; for (let c = -16; c <= 16; c += 3.2) x.fillRect(X(c - 0.15), Y(4.2), Math.max(1, 0.3 * m), 3.0 * m);
    x.fillRect(X(-16), Y(2.15), 14.5 * m, Math.max(1, 0.18 * m)); x.fillRect(X(1.5), Y(2.15), 14.5 * m, Math.max(1, 0.18 * m));
    for (let c = -16; c <= 16; c += 0.55) if (Math.abs(c) > 1.5) x.fillRect(X(c), Y(2.15), Math.max(0.6, 0.07 * m), 0.95 * m);
    // brick foundation + stair
    x.fillStyle = sh(120, 62, 48, L * 0.85 + 0.05); x.fillRect(X(-16), Y(1.2), 32 * m, 1.2 * m);
    for (let i = 0; i < 4; i++) x.fillRect(X(-1.6 - i * 0.25), Y(1.2 - i * 0.3), (3.2 + i * 0.5) * m, 0.3 * m);
    // round shrubs
    x.fillStyle = sh(46, 72, 38, L * 0.9 + 0.1); for (const bx of [-14, -11, -7.5, 7.5, 11, 14]) { x.beginPath(); x.ellipse(X(bx), Y(0.75), 1.4 * m, 0.95 * m, 0, 0, 6.283); x.fill(); }
    // gravel drive toward you
    x.fillStyle = sh(170, 160, 140, L * 0.7 + 0.1); x.beginPath(); x.moveTo(X(-1.5), gy); x.lineTo(X(1.5), gy); x.lineTo(X(-6), H); x.lineTo(X(-30), H); x.closePath(); x.globalAlpha = 0.55; x.fill(); x.globalAlpha = 1;
    if (!front) { x.fillStyle = `rgba(20,24,34,${(0.35 * (1 - L)).toFixed(2)})`; x.fillRect(X(-24), Y(16), 48 * m, 16 * m); }   // dawn: backlit, in shadow
  }
  function chinook(x, W, H, hz, C, now) { const P = 15000, D = 13000, ph = (now + 6000) % P; if (ph > D) return; const f = ph / D, e = C.elev != null ? C.elev : 5;
    const u = Math.max(0.55, W / 760), cx = W + 70 * u - f * (W + 140 * u), cy = hz - H * 0.075 - 10 * u + Math.sin(now / 650) * 0.8;   // right → left, low
    const lt = clamp((e + 2) / 12), col = `rgba(${Math.round(36 + 58 * lt)},${Math.round(40 + 60 * lt)},${Math.round(38 + 56 * lt)},${(0.85 - 0.12 * lt).toFixed(2)})`;
    { const wy = hz + H * 0.035, t = now / 1000; x.save(); for (let i = 0; i < 3; i++) { const q = (t * 0.9 + i / 3) % 1, r = (18 + 34 * q) * u;   // rotor wash on the water
        x.strokeStyle = `rgba(225,230,232,${((1 - q) * 0.22).toFixed(3)})`; x.lineWidth = 1; x.beginPath(); x.ellipse(cx, wy, r, r * 0.12, 0, 0, 6.283); x.stroke(); }
      const g = x.createRadialGradient(cx, wy, 0, cx, wy, 30 * u); g.addColorStop(0, "rgba(230,234,236,.14)"); g.addColorStop(1, "rgba(230,234,236,0)"); x.fillStyle = g; x.beginPath(); x.ellipse(cx, wy, 30 * u, 4 * u, 0, 0, 6.283); x.fill(); x.restore(); }
    x.save(); x.translate(cx, cy); x.scale(-u, u); x.fillStyle = col; x.strokeStyle = col;   // drawn nose-right, mirrored to fly left
    x.beginPath(); x.moveTo(-34, -12); x.lineTo(22, -12); x.quadraticCurveTo(31, -11, 33, -4); x.quadraticCurveTo(32, 1, 26, 2); x.lineTo(-30, 2); x.lineTo(-38, -3); x.closePath(); x.fill();   // boxy fuselage + nose
    x.beginPath(); x.moveTo(-30, -12); x.lineTo(-40, -22); x.lineTo(-28, -22); x.lineTo(-20, -12); x.closePath(); x.fill();   // tall aft pylon
    x.fillRect(-26, -14, 16, 3);   // engine pods
    x.beginPath(); x.moveTo(-30, 2); x.lineTo(-40, 5); x.lineTo(-38, 2.5); x.closePath(); x.fill();   // rear ramp, slightly open
    for (const gx of [-22, 16]) { x.fillRect(gx, 2, 1.3, 4); x.beginPath(); x.arc(gx + 0.6, 6.5, 1.6, 0, 6.283); x.fill(); }   // fixed gear
    const spin = now / 45;
    for (const [rx, ry, sgn] of [[22, -14, 1], [-34, -24, -1]]) { x.save(); x.globalAlpha = 0.27; x.beginPath(); x.ellipse(rx, ry, 30, 2, 0, 0, 6.283); x.fill(); x.restore();
      x.fillRect(rx - 1, ry, 2, 2.5); x.lineWidth = 0.7; x.globalAlpha = 0.55; for (let k = 0; k < 3; k++) { const a = sgn * spin + k * 2.094, c = Math.cos(a); if (Math.abs(c) < 0.3) continue; x.beginPath(); x.moveTo(rx, ry); x.lineTo(rx + 30 * c, ry + 1.6 * Math.sin(a)); x.stroke(); } x.globalAlpha = 1; }
    const rim = e > -3 && e < 12 && !C.turned ? clamp(1 - Math.abs(e - 2) / 10) : 0;
    if (rim > 0.05) { x.fillStyle = `rgba(255,190,100,${(0.5 * rim).toFixed(2)})`; x.fillRect(-30, -12.6, 52, 0.9); }
    if (e < 0) { const tw = clamp(-e / 5), on = (now % 1100) < 110; if (on) { x.fillStyle = `rgba(255,60,50,${tw.toFixed(2)})`; x.fillRect(-32, -23, 2.2, 2.2); x.fillRect(0, 2, 2, 2); }
      x.fillStyle = `rgba(255,255,240,${(0.8 * tw).toFixed(2)})`; x.fillRect(-38, -3, 1.6, 1.6); }
    x.restore(); }
  // d25v: Grandview's weathered dead tree standing in the surf (Sean's photo), drawn procedurally: forked silver-gray trunk,
  // twisting bare limbs, a small dark sign hanging by a wire, foam washing round the base. Right side of the frame, clear of the sun
  // column (sun/glitter sit at the centre); silhouetted at low sun with a gold rim on the sun-facing (left) edges.
  let GT = null;
  function ghostGeom() { if (GT) return GT; let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647); const segs = [];
    const br = (x0, y0, a, L, w, d) => { const n = 4; let x1 = x0, y1 = y0, aa = a; const pts = [[x0, y0]];
      for (let i = 0; i < n; i++) { aa += (rnd() - 0.5) * 0.55; x1 += Math.cos(aa) * L / n; y1 -= Math.sin(aa) * L / n; pts.push([x1, y1]); }
      segs.push({ pts, w, d }); if (d >= 4 || w < 0.003) return;
      const k = d < 2 ? 2 : 1 + (rnd() < 0.6 ? 1 : 0);
      for (let j = 0; j < k; j++) { const sp = (j - (k - 1) / 2) * (0.75 + rnd() * 0.4) + (rnd() - 0.5) * 0.25; br(x1, y1, aa + sp, L * (0.72 + rnd() * 0.18), w * 0.6, d + 1); } };
    br(0, 0, Math.PI / 2 + 0.05, 0.2, 0.045, 0);   // trunk, forks at the top
    const ai = segs.length; br(0.012, -0.13, 0.3, 0.13, 0.02, 2);          // low arm reaching right (the sign hangs from it)
    br(-0.008, -0.025, Math.PI - 0.15, 0.07, 0.018, 3);   // low stub reaching left over the water
    const arm = segs[ai].pts; GT = { segs, sign: arm[2] }; return GT; }
  function ghostTree(x, W, H, hz, C, now) { const G = ghostGeom(), S = H * 1.05, bx = W * 0.8, by = hz + H * 0.24, e = C.elev != null ? C.elev : 5;
    const lt = C.turned ? clamp((e + 4) / 10) : clamp((e - 1) / 12), rim = !C.turned && e > -3 && e < 12 ? clamp(1 - Math.abs(e - 2) / 10) : 0;   // turned (sun behind you): front-lit, no rim
    const c0 = [26 + 120 * lt, 24 + 116 * lt, 24 + 108 * lt].map(Math.round), P = p => [bx + p[0] * S, by + p[1] * S];
    x.save(); x.lineCap = x.lineJoin = "round";
    const path = s => { x.beginPath(); const a = P(s.pts[0]); x.moveTo(a[0], a[1]); for (let i = 1; i < s.pts.length - 1; i++) { const b = P(s.pts[i]), c = P(s.pts[i + 1]); x.quadraticCurveTo(b[0], b[1], (b[0] + c[0]) / 2, (b[1] + c[1]) / 2); } const z = P(s.pts[s.pts.length - 1]); x.lineTo(z[0], z[1]); };
    for (const s of G.segs) { path(s); x.strokeStyle = `rgb(${c0})`; x.lineWidth = Math.max(0.8, s.w * S); x.stroke(); }
    if (rim > 0.02) { x.globalCompositeOperation = "lighter"; x.translate(-Math.max(0.6, S * 0.002), 0);
      for (const s of G.segs) { if (s.w * S < 1.2) continue; path(s); x.strokeStyle = `rgba(255,${170 + 40 * lt | 0},80,${0.4 * rim})`; x.lineWidth = Math.max(0.5, s.w * S * 0.14); x.stroke(); }
      x.setTransform(x.getTransform().a, 0, 0, x.getTransform().d, 0, 0); x.globalCompositeOperation = "source-over"; }
    // the sign: dark box on a wire, swinging a little in the wind
    { const [sx, sy] = P(G.sign), sw = Math.sin(now / 900) * 0.06 * (0.4 + clamp((C.wind || 0) / 25)), L = S * 0.045, ex = sx + Math.sin(sw) * L, ey = sy + Math.cos(sw) * L, bw = S * 0.04, bh = S * 0.025;
      x.strokeStyle = `rgba(${c0},.8)`; x.lineWidth = 0.8; x.beginPath(); x.moveTo(sx, sy); x.lineTo(ex, ey); x.stroke();
      x.fillStyle = `rgb(${Math.round(30 + 40 * lt)},${Math.round(24 + 30 * lt)},${Math.round(20 + 24 * lt)})`; x.fillRect(ex - bw / 2, ey, bw, bh); }
    // surf washing round the base: animated foam rings + a darker wet band on the trunk
    { const t = now / 1000, fl = 0.75 + 0.25 * lt;
      x.fillStyle = `rgba(${c0.map(v => v * 0.6 | 0)},.5)`; x.fillRect(bx - S * 0.03, by - S * 0.012, S * 0.06, S * 0.012);
      for (let i = 0; i < 4; i++) { const ph = (t * 0.35 + i / 4) % 1, r = S * (0.035 + 0.06 * ph), a = (1 - ph) * 0.55 * fl;
        x.strokeStyle = `rgba(238,240,240,${a.toFixed(3)})`; x.lineWidth = 1.2 + 2 * (1 - ph); x.beginPath(); x.ellipse(bx, by, r, r * 0.16, 0, Math.PI * 0.05, Math.PI * 1.95); x.stroke(); }
      const g2 = x.createRadialGradient(bx, by, 0, bx, by, S * 0.05); g2.addColorStop(0, `rgba(245,246,246,${0.6 * fl})`); g2.addColorStop(1, "rgba(245,246,246,0)"); x.fillStyle = g2; x.beginPath(); x.ellipse(bx, by + 1, S * 0.05, S * 0.012, 0, 0, 6.283); x.fill(); }
    x.restore(); }
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
  g.Wx = { conditions, draw, label, moonCalc, phaseName };
})(window);
