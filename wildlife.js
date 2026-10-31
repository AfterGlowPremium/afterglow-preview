// d28zl (PREVIEW ONLY): procedural wildlife — Windmill Point heron (west), Buckroe osprey (bay/east), Fort Monroe dolphins (water views).
// One 2-D overlay canvas, drawn only while a matching scene is open; random waits/positions/behaviours; never more than one event at a time.
(function (g) {
  const d = document, S = () => g.__agState || {}, R = (a, b) => a + Math.random() * (b - a), PI = Math.PI;
  let NOW = 0, cv, x, W = 0, H = 0, raf = 0, last = 0, ev = null, nextAt = 0, heron = null, curKey = "";
  const q = () => new URLSearchParams(location.search);
  const spot = () => S().spot || q().get("spot") || "";
  const mode = () => (d.querySelector(".stage .ev-toggle a.on") || {}).dataset?.ev || S().mode || q().get("mode") || "sunset";
  const facing = () => { const st = d.querySelector(".stage"); const m = st && st.textContent.match(/Facing [A-Z]{1,3} (\d{1,3})°/); return m ? +m[1] : null; };
  const isEast = () => { const a = facing(); return a != null ? a < 180 : mode() === "sunrise"; };
  const backlit = () => (mode() === "sunset") !== isEast();
  function which() { const id = spot(); if (!d.querySelector(".stage #pv")) return null; const e = isEast();
    if (id === "windmillpt" && !e) return "heron"; if (id === "saltponds" && e) return "osprey"; if (id === "oldpoint" || id === "oldpointlight") return "dolphins"; return null; }
  // ---- geometry: horizon & water distance → screen
  function hz() { const c = g.__agCam; if (!c) return H * 0.55; const th = Math.tan(c.vfov * PI / 360); return H * (0.5 + Math.tan(c.pitch) / (2 * th)); }
  function pxPerM(D) { const c = g.__agCam, th = Math.tan(((c && c.vfov) || 50) * PI / 360); return H / (2 * th * D); }
  function waterY(D, eye) { return hz() + (eye || 2.5) * pxPerM(D); }
  // ---- colours by light
  function ink(lit, base) { return lit ? base : "rgba(18,14,24,.94)"; }
  // ---- splash / ripples (analytic, no per-particle state beyond a seed list)
  function mkSplash(px, py, s, n) { const p = []; for (let i = 0; i < n; i++) p.push([R(-1, 1) * s * 1.6, -R(.8, 2.4) * s * 2.2]); return { px, py, s, p, t0: NOW }; }
  function drawSplash(sp, now, lit) { const t = now - sp.t0; if (t > 2.6) return false; const gr = sp.s * 9;
    x.save(); x.fillStyle = lit ? "rgba(235,240,245,.85)" : "rgba(255,230,200,.55)";
    if (t < 1.2) for (const [vx, vy] of sp.p) { const X = sp.px + vx * t, Y = sp.py + vy * t + gr * t * t; if (Y > sp.py) continue; x.beginPath(); x.arc(X, Y, Math.max(.6, sp.s * .09), 0, 2 * PI); x.fill(); }
    x.strokeStyle = lit ? "rgba(255,255,255,.5)" : "rgba(255,220,180,.45)"; x.lineWidth = Math.max(.6, sp.s * .05);
    for (let k = 0; k < 3; k++) { const tt = t - k * .35; if (tt <= 0) continue; const r = sp.s * (0.4 + tt * 1.4); x.globalAlpha = Math.max(0, 1 - tt / 2.2) * .8; x.beginPath(); x.ellipse(sp.px, sp.py, r, r * .16, 0, 0, 2 * PI); x.stroke(); }
    x.restore(); return true; }
  // =========================== HERON (resident; random behaviour queue) ===========================
  const POSE = { S: [.2, .95, .08, .82, .3, .86, .6], lean: [.42, .72, .25, .74, .4, .8, .95], strike: [.52, .06, .3, .6, .52, .32, 1.4], up: [.3, .92, .15, .8, .36, .84, .15] };
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k), ease = k => k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k);
  function heronAnchor() { const img = d.querySelector(".stage img.pv-fg.pv-hr"), st = d.querySelector(".stage"); if (!st) return null; const r0 = st.getBoundingClientRect();
    d.querySelectorAll(".stage img.pv-hr").forEach(el => el.style.visibility = "hidden"); if (img) { const r = img.getBoundingClientRect(), s = Math.max(r.width / 1600, r.height / 1000); const oy = r.height - 1000 * s;
      return { fx: r.left - r0.left + 175 * s, fy: r.top - r0.top + oy + 965 * s, h: (965 - 701) * s * 1.05 }; }
    return { fx: W * .18, fy: H * .9, h: H * .14 }; }
  function newHeron() { return { dx: 0, queue: [], act: null, t0: 0, pose: POSE.S, step: 0, fish: null, splash: null }; }
  function heronPlan(hr) { const r = Math.random(); // random next behaviour
    if (r < .3) return { k: "wade", dur: R(4, 10), dir: Math.random() < .5 ? -1 : 1 };
    if (r < .6) return { k: "freeze", dur: R(5, 16) };
    const hit = Math.random() < .25; return { k: "hunt", dur: hit ? 12 : 5.5, hit }; }
  function drawHeron(now, lit) { const A = heronAnchor(); if (!A) return; const hr = heron || (heron = newHeron()); const h = A.h;
    if (!hr.act || now - hr.t0 > hr.act.dur) { hr.act = heronPlan(hr); hr.t0 = now; }
    const a = hr.act, t = now - hr.t0; let pose = POSE.S, lift = 0, lean = 0, shake = 0, fish = null, bulge = -1;
    if (a.k === "wade") { const st = t / 2.2, ph = st % 1; hr.dx = Math.max(-W * .06, Math.min(W * .1, hr.dx + a.dir * h * .0025)); lift = Math.sin(ph * PI) * (Math.floor(st) % 2 ? 1 : -1); pose = mix(POSE.S, POSE.lean, .25); }
    else if (a.k === "hunt") { if (t < 2) pose = mix(POSE.S, POSE.lean, ease(t / 2)); else if (t < 2.18) pose = mix(POSE.lean, POSE.strike, (t - 2) / .18); else if (t < 2.8) pose = POSE.strike; else if (!a.hit) pose = mix(POSE.strike, POSE.S, ease((t - 2.8) / 1.4));
      else { if (t < 4) pose = mix(POSE.strike, POSE.up, ease((t - 2.8) / 1.2)); else pose = POSE.up; const ft = t - 2.8;
        if (ft < 2.2) fish = { ang: 0 }; else if (ft < 2.9) fish = { ang: (ft - 2.2) / .7 * PI * 1.0, hop: Math.sin((ft - 2.2) / .7 * PI) }; else if (ft < 3.8) fish = { ang: PI, swallow: (ft - 2.9) / .9 };
        if (ft > 3.6 && ft < 5.8) bulge = (ft - 3.6) / 2.2; if (ft > 6 && ft < 7.2) shake = 1; if (ft > 7.2) pose = mix(POSE.up, POSE.S, ease((ft - 7.2) / 1.5)); }
      if (t > 2.1 && !hr.sp) hr.sp = mkSplash(0, 0, h * .06, a.hit ? 10 : 7); if (t < 1) hr.sp = null; }
    const fx = A.fx + hr.dx, fy = A.fy, U = (u, v) => [fx + u * h, fy - v * h];
    const col = ink(lit, "#7f8b9b"); const draw = () => {
      x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = col; x.fillStyle = col; const jit = shake ? Math.sin(now * 60) * h * .012 : 0;
      // legs (slow high step)
      x.lineWidth = Math.max(1, h * .018); const lf = (s, l) => { const [hx, hy] = U(.02 * s, .5); const fyL = l > 0 ? .02 + l * .16 : 0, fxL = .02 * s + (l > 0 ? l * .06 : 0); const [kx, ky] = U(.03 * s + (l > 0 ? l * .1 : 0), .26 + (l > 0 ? l * .12 : 0)); const [ex, ey] = U(fxL, fyL); x.beginPath(); x.moveTo(hx, hy); x.lineTo(kx, ky); x.lineTo(ex, ey); x.stroke(); };
      lf(-1, Math.max(0, -lift)); lf(1, Math.max(0, lift));
      // body
      x.save(); const [bx, by] = U(0, .6); x.translate(bx + jit, by); x.rotate(-.35 - (pose[6] - .6) * .15); x.beginPath(); x.ellipse(0, 0, h * .2, h * .072, 0, 0, 2 * PI); x.fill();
      x.beginPath(); x.moveTo(-h * .2, -h * .02); x.lineTo(-h * .32, h * .07); x.lineTo(-h * .18, h * .05); x.fill(); if (shake) for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(-h * .15 + i * h * .045, h * .05); x.lineTo(-h * .16 + i * h * .045 + R(-1, 1) * h * .02, h * .1 + R(0, 1) * h * .03); x.lineWidth = h * .012; x.stroke(); } x.restore();
      // neck (S-curve bezier) + head + bill
      const [n0x, n0y] = U(.16, .66), [c1x, c1y] = U(pose[2], pose[3]), [c2x, c2y] = U(pose[4], pose[5]), [hx, hy] = U(pose[0], pose[1]);
      x.lineWidth = Math.max(1.5, h * .04); x.beginPath(); x.moveTo(n0x + jit, n0y); x.bezierCurveTo(c1x + jit, c1y, c2x + jit, c2y, hx + jit, hy); x.stroke();
      if (bulge >= 0) { const k = bulge, it = 1 - k, P = [it ** 3 * hx + 3 * it * it * k * c2x + 3 * it * k * k * c1x + k ** 3 * n0x, it ** 3 * hy + 3 * it * it * k * c2y + 3 * it * k * k * c1y + k ** 3 * n0y]; x.beginPath(); x.ellipse(P[0], P[1], h * .03, h * .024, 0, 0, 2 * PI); x.fill(); }
      x.beginPath(); x.ellipse(hx + jit, hy, h * .045, h * .028, pose[6] * .6, 0, 2 * PI); x.fill();
      x.beginPath(); x.moveTo(hx - h * .02, hy - h * .012); x.lineTo(hx - h * .09, hy - h * .04); x.lineWidth = h * .01; x.stroke();   // plume
      const ba = pose[6], bl = h * .15, tip = [hx + Math.cos(ba) * bl, hy + Math.sin(ba) * bl]; x.beginPath(); x.moveTo(hx + Math.cos(ba - .5) * h * .02, hy + Math.sin(ba - .5) * h * .02); x.lineTo(tip[0], tip[1]); x.lineTo(hx + Math.cos(ba + .5) * h * .02, hy + Math.sin(ba + .5) * h * .02); x.fill();
      if (fish && !(fish.swallow > 1)) { const L = h * .1 * Math.max(0, 1 - (fish.swallow || 0)); x.save(); x.translate(tip[0] - Math.cos(ba) * L * .2 * (fish.swallow || 0), tip[1] - (fish.hop || 0) * h * .08); x.rotate(fish.swallow != null ? ba + PI : ba + PI / 2 + fish.ang);
        x.fillStyle = lit ? "#cfd8e0" : "rgba(220,215,220,.85)"; x.beginPath(); x.ellipse(0, 0, L * .5, L * .14, 0, 0, 2 * PI); x.fill(); x.beginPath(); x.moveTo(-L * .45, 0); x.lineTo(-L * .65, -L * .12); x.lineTo(-L * .65, L * .12); x.fill(); x.restore(); }
      if (hr.sp && hr.sp.px === 0) { hr.sp.px = tip[0]; hr.sp.py = fy; hr.sp.t0 = now; } };
    draw(); x.save(); x.beginPath(); x.rect(0, fy, W, H - fy); x.clip(); x.translate(0, 2 * fy); x.scale(1, -1); x.globalAlpha = .22; draw(); x.restore();
    if (hr.sp && !drawSplash(hr.sp, now, lit)) hr.sp = null;
    return true; }
  // =========================== OSPREY ===========================
  function drawOsprey(px, py, S, hd, f, flap, opts, lit) { g.__agWildPos = [px, py, S, hd]; // hd = heading (rad, screen), f = lateral foreshortening, flap = 0..1 wing up-stroke
    const u = [Math.cos(hd), Math.sin(hd)], v = [-u[1], u[0]], P = (a, b) => [px + (u[0] * a + v[0] * b * f) * S, py + (u[1] * a + v[1] * b * f) * S];
    const fold = opts.fold || 0, span = (1 - fold * .75) * (1 - flap * .55), crook = .45 * span;
    const body = lit ? "#efece6" : "rgba(16,12,22,.95)", dark = lit ? "#3b2f2a" : "rgba(10,8,14,.98)";
    for (const s of [-1, 1]) { const wing = [P(.06, .05 * s), P(.14 - fold * .25, crook * s), P(-.22 - fold * .3, span * s), P(-.3 - fold * .2, span * .7 * s), P(-.14, .1 * s)];
      x.fillStyle = body; x.beginPath(); wing.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill();
      x.fillStyle = dark; const w = P(.1 - fold * .2, crook * s * .95); x.beginPath(); x.ellipse(w[0], w[1], S * .06, S * .035 * Math.max(.4, f), hd, 0, 2 * PI); x.fill();   // dark wrist patch
      const tp = P(-.24 - fold * .3, span * s * .93); x.beginPath(); x.moveTo(tp[0], tp[1]); const t2 = P(-.28 - fold * .2, span * .72 * s), t3 = P(-.12 - fold * .25, span * .9 * s); x.lineTo(t2[0], t2[1]); x.lineTo(t3[0], t3[1]); x.fill(); }   // dark primaries
    x.fillStyle = body; let b = P(0, 0); x.beginPath(); x.ellipse(b[0], b[1], S * .3, S * .075, hd, 0, 2 * PI); x.fill();
    const tl = opts.tailDown ? [P(-.28, 0), P(-.48, .07), P(-.48, -.07)] : [P(-.25, 0), P(-.45, .06), P(-.45, -.06)]; x.beginPath(); tl.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.fill();
    const hp = P(.3, 0); x.beginPath(); x.arc(hp[0], hp[1], S * .065, 0, 2 * PI); x.fill(); x.strokeStyle = dark; x.lineWidth = Math.max(1, S * .025); const e1 = P(.28, -.03), e2 = P(.2, -.06); x.beginPath(); x.moveTo(e1[0], e1[1]); x.lineTo(e2[0], e2[1]); x.stroke();   // eye-stripe
    x.fillStyle = dark; const bk = P(.4, .01); x.beginPath(); x.moveTo(P(.35, -.02)[0], P(.35, -.02)[1]); x.lineTo(bk[0], bk[1]); x.lineTo(P(.35, .03)[0], P(.35, .03)[1]); x.fill();
    if (opts.legs) { x.strokeStyle = dark; x.lineWidth = Math.max(1, S * .03); const a0 = P(-.02, 0), a1 = opts.legs === "fwd" ? P(.42, .02) : [a0[0] + S * .02, a0[1] + S * .2]; x.beginPath(); x.moveTo(a0[0], a0[1]); x.lineTo(a1[0], a1[1]); x.stroke(); }
    if (opts.fish) { const c = P(-.05, 0), L = S * .32; x.save(); x.translate(c[0], c[1] + S * .1); x.rotate(hd); x.fillStyle = lit ? "#c9d3dc" : "rgba(210,205,215,.85)"; x.beginPath(); x.ellipse(0, 0, L * .5, L * .12, 0, 0, 2 * PI); x.fill(); x.beginPath(); x.moveTo(-L * .45, 0); x.lineTo(-L * .65, -L * .13); x.lineTo(-L * .65, L * .13); x.fill(); x.fillStyle = "#111"; x.beginPath(); x.arc(L * .36, -L * .03, L * .03, 0, 2 * PI); x.fill(); x.restore(); }   // fish head-first (head at +heading end)
  }
  function ospreyEvent() { const dir = Math.random() < .5 ? 1 : -1, dive = q().get("wild") === "now" || Math.random() < .6, D = R(22, 45); return { k: "osprey", t0: NOW, dir, dive, D, x0: R(.3, .7), dur: dive ? 17 : 9 }; }
  function runOsprey(e, now, lit) { const t = now - e.t0, wy = waterY(e.D), S = pxPerM(e.D) * 1.6, dir = e.dir, cx = W * e.x0, hy = wy - S * 6; let px, py, hd, f = .5, flap = 0, o = {};
    const L = k => dir > 0 ? k : 1 - k; const fwd = dir > 0 ? 0 : PI;
    if (!e.dive) { const k = t / e.dur; px = W * L(-.15 + k * 1.3); py = hy - S * 1.5 + Math.sin(k * 6) * S * .3; hd = fwd + dir * -.05; f = .55; flap = (Math.sin(t * 5) * .5 + .5) * (Math.sin(t * .9) > .3 ? 1 : 0); return t < e.dur && (drawOsprey(px, py, S, hd, f, flap, {}, lit), true); }
    if (t < 4) { const k = ease(t / 4); px = W * L(-.12) + (cx - W * L(-.12)) * k; py = hy - S * 2 + S * 2 * k; hd = fwd + dir * -.08; f = .6; flap = Math.sin(t * 3) * .25 + .25; }
    else if (t < 7.5) { px = cx + Math.sin(t * 1.3) * S * .1; py = hy + Math.sin(t * 2.1) * S * .08; hd = -PI / 2; f = 1; flap = Math.sin(t * 26) * .5 + .5; o.tailDown = 1; o.legs = "down"; }
    else if (t < 8.4) { const k = (t - 7.5) / .9; px = cx + dir * S * 1.2 * k; py = hy + (wy - hy) * k * k; hd = PI / 2 - dir * .35; f = .5; o.fold = Math.min(1, k * 2.5); if (k > .75) { o.legs = "fwd"; o.fold = .6; hd = PI / 2 - dir * .9; } }
    else if (t < 10) { if (!e.sp) e.sp = mkSplash(cx + dir * S * 1.2, wy, S * .9, 22); px = cx + dir * S * 1.2; py = wy - S * .1; hd = -PI / 2; f = .9; flap = .9 - (t - 8.4) * .05; o.fold = 0; }
    else if (t < 12.5) { const k = (t - 10) / 2.5; px = cx + dir * S * (1.2 + k * 2); py = wy - S * .1 - k * S * 3; hd = fwd + dir * -.35; f = .7; flap = Math.sin(t * 9) * .5 + .5; o.fish = 1; if (t > 11.4 && t < 12) { px += Math.sin(t * 70) * S * .06; if (!e.sp2) e.sp2 = mkSplash(px, py + S * .2, S * .4, 14); } }
    else { const k = (t - 12.5) / (e.dur - 12.5); px = cx + dir * S * 3.2 + dir * k * W * .8; py = wy - S * 3.1 - k * S * 3; hd = fwd + dir * -.15; f = .55; flap = Math.sin(t * 6) * .5 + .5; o.fish = 1; }
    if (t > e.dur) return false; if (e.sp) drawSplash(e.sp, now, lit); if (e.sp2) drawSplash(e.sp2, now, lit);
    // osprey fish is always carried with its head toward the heading (hd) — see drawOsprey
    drawOsprey(px, py, S, hd, f, flap, o, lit); return true; }
  // =========================== DOLPHINS ===========================
  function dolphinEvent() { const n = 2 + Math.floor(Math.random() * 3), dir = Math.random() < .5 ? 1 : -1, D = R(28, 110), sp = R(.035, .06);
    return { k: "dolphins", t0: NOW, dir, D, sp, dur: 1 / sp + 2, pod: Array.from({ length: n }, (_, i) => ({ off: i * R(.6, 1.6) + R(0, .5), lane: R(-1, 1), ph: R(0, 3), per: R(3.2, 5), slap: Math.random() < .2 })) }; }
  function runDolphins(e, now, lit) { const t = now - e.t0; if (t > e.dur + 6) return false; const col = ink(lit, "#6f7a85");
    for (const p of e.pod) { const D = e.D + p.lane * 25, wy = waterY(D), s = pxPerM(D); const tt = t - p.off; if (tt < 0) continue; const k = tt * e.sp; if (k > 1.15) continue;
      const X = W * (e.dir > 0 ? -.1 + k * 1.2 : 1.1 - k * 1.2); const c = ((tt + p.ph) % p.per) / 1.6; if (c > 1) continue;   // surfacing roll lasts 1.6 s every per seconds
      const L = s * 2.6, Hh = s * .55; x.save(); x.translate(X, wy); x.scale(e.dir, 1); x.beginPath(); x.rect(-L * 2, -L * 2, L * 4, L * 2); x.clip(); x.fillStyle = col;
      // body arc: front part (rostrum/blowhole) first, then dorsal fin, then tail stock — a rotating arc emerging & sinking
      const a0 = -PI * .9 + c * PI * 1.2; x.beginPath(); for (let i = 0; i <= 14; i++) { const a = a0 - i * .11, r = L * .9; x.lineTo(Math.cos(a) * r * .7 - L * .2, Math.sin(a) * Hh * 2.2 + Hh * 1.6); } for (let i = 14; i >= 0; i--) { const a = a0 - i * .11, r = L * .9 - Hh * .5; x.lineTo(Math.cos(a) * r * .7 - L * .2, Math.sin(a) * Hh * 1.8 + Hh * 1.6); } x.fill();
      const fa = a0 - .7, fx = Math.cos(fa) * L * .63 - L * .2, fy = Math.sin(fa) * Hh * 2.2 + Hh * 1.6; if (fy < Hh * .2) { x.beginPath(); x.moveTo(fx - s * .25, fy + 1); x.quadraticCurveTo(fx - s * .05, fy - s * .55, fx + s * .22, fy - s * .5); x.quadraticCurveTo(fx + s * .05, fy - s * .2, fx + s * .2, fy + 1); x.fill(); }   // curved dorsal fin
      x.restore();
      if (c < .25) { x.save(); x.globalAlpha = (1 - c / .25) * .5; x.fillStyle = lit ? "#fff" : "rgba(255,225,200,.8)"; x.beginPath(); x.ellipse(X + e.dir * L * .35, wy - s * (.3 + c * 2), s * (.15 + c), s * (.2 + c * 1.2), 0, 0, 2 * PI); x.fill(); x.restore(); }   // breath puff
      if (!p.r || now - p.r.t0 > p.per) p.r = mkSplash(X, wy, s * .9, p.slap && Math.random() < .5 ? 12 : 0);
      if (p.r) drawSplash(p.r, now, lit); }
    return true; }
  // =========================== loop ===========================
  function size() { const st = d.querySelector(".stage"), pv = st && st.querySelector("#pv"); if (!pv) return false; if (!cv || !st.contains(cv)) { cv = d.createElement("canvas"); cv.id = "ag-wild"; cv.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2"; pv.after(cv); x = cv.getContext("2d"); const E = x.ellipse.bind(x); x.ellipse = (a, b, rx, ry, ...r) => E(a, b, Math.abs(rx) + 1e-3, Math.abs(ry) + 1e-3, ...r); const A0 = x.arc.bind(x); x.arc = (a, b, r, ...q) => A0(a, b, Math.abs(r) + 1e-3, ...q); }
    const k = Math.min(1.5, g.devicePixelRatio || 1), w = pv.clientWidth, h = pv.clientHeight; cv.style.width = w + "px"; cv.style.height = h + "px"; cv.style.left = pv.offsetLeft + "px"; cv.style.top = pv.offsetTop + "px";
    if (cv.width !== Math.round(w * k)) { cv.width = Math.round(w * k); cv.height = Math.round(h * k); } W = w; H = h; x.setTransform(k, 0, 0, k, 0, 0); return true; }
  function frame(ms) { raf = 0; const w = which(); if (w !== "heron") d.querySelectorAll(".stage img.pv-fg,.stage img.pv-fg2").forEach(el => { if (el.style.visibility) el.style.visibility = ""; }); if (!w || !size()) { if (cv) x && x.clearRect(0, 0, cv.width, cv.height); ev = null; heron = null; return; }
    raf = requestAnimationFrame(frame); if (ms - last < 33) return; last = ms; const now = NOW = ms / 1000, lit = !backlit();
    const key = spot() + w; if (key !== curKey) { curKey = key; ev = null; heron = null; nextAt = now + (q().get("wild") === "now" ? .5 : R(3, 12)); }
    x.clearRect(0, 0, W, H);
    if (w === "heron") { drawHeron(now, lit); return; }
    if (!ev && now > nextAt) ev = w === "osprey" ? ospreyEvent() : dolphinEvent();
    if (ev) { if (!ev.t0 || ev.t0 > now) ev.t0 = now; const alive = ev.k === "osprey" ? runOsprey(ev, now, lit) : runDolphins(ev, now, lit); if (!alive) { ev = null; const long = Math.random() < .25; nextAt = now + (w === "osprey" ? R(45, 90) : R(40, 80)) * (long ? R(1.5, 3) : 1); } }
  }
  const kick = () => { if (!raf && which()) raf = requestAnimationFrame(frame); };
  setInterval(() => { if (!which()) d.querySelectorAll('.stage img.pv-fg,.stage img.pv-fg2').forEach(el => { if (el.style.visibility) el.style.visibility = ''; }); kick(); }, 1000); new MutationObserver(kick).observe(d.body, { childList: true, subtree: true });
  g.__agWild = { seek: t => { const w = which(); if (!ev && w && w !== "heron") ev = w === "osprey" ? ospreyEvent() : dolphinEvent(); if (ev) ev.t0 = NOW - t; if (heron) heron.t0 = NOW - t; }, force: () => { nextAt = 0; ev = null; }, dbg: () => ({ w: which(), ev: ev && { k: ev.k, t: NOW - ev.t0, D: ev.D, dive: ev.dive }, W, H, nextAt, NOW, hz: hz(), ppm: pxPerM(100), raf }) };
})(window);
