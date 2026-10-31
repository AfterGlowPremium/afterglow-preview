// d28zl (PREVIEW ONLY): procedural wildlife — Windmill Point heron (west), Buckroe osprey (bay/east), Fort Monroe dolphins (water views).
// One 2-D overlay canvas, drawn only while a matching scene is open; random waits/positions/behaviours; never more than one event at a time.
(function (g) {
  const d = document, S = () => g.__agState || {}, R = (a, b) => a + Math.random() * (b - a), PI = Math.PI;
  let NOW = 0, cv, x, W = 0, H = 0, raf = 0, last = 0, ev = null, nextAt = 0, heron = null, curKey = "";
  const q = () => new URLSearchParams(location.search), FORCE = () => /^(1|now|on|dive)$/.test(q().get("wild") || "");
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
  // ---- Great blue heron: ~1.2 m; lit with the scene (true colours by day, silhouette only when strongly backlit near/after sunset).
  // Behaviour after Cornell "All About Birds": slow stalking with the head held still while the body moves, long stand-and-wait,
  // neck retracted in a kink then slowly extended, peering with the head tilted, strike = full-body lunge with the neck snapping
  // straight, prey swallowed head-first (throat ripple), then a shake / feather fluff.
  //            head x,y   neck c1      neck c2     bill  tilt
  const POSE = { rest: [.2, .84, .07, .74, .27, .74, .12, 0], alert: [.3, 1, .17, .8, .22, .96, .08, 0], stalk: [.44, .8, .22, .7, .4, .82, .3, 0],
    peer: [.43, .72, .22, .68, .36, .76, .95, 1], coil: [.22, .74, .09, .68, .3, .64, .75, 0], strike: [.66, .07, .34, .5, .55, .24, 1.25, 0], hold: [.34, .9, .18, .78, .34, .86, .05, 0] };
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k), ease = k => k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k), cl = (v, a, b) => Math.max(a, Math.min(b, v));
  function sunEl() { const st = d.querySelector(".stage"); const m = st && st.textContent.match(/sun ([−-]?\d+(?:\.\d+)?)°/); return m ? +m[1].replace("−", "-") : 10; }
  function heronAnchor() { const st = d.querySelector(".stage"); if (!st) return null; d.querySelectorAll(".stage img.pv-hr").forEach(el => el.style.visibility = "hidden");
    const h = Math.max(70, Math.min(H * .3, (g.innerHeight || H) * .15)); return { fx: W * .24, fy: Math.min(H - h * .08, Math.max(hz() + h * .5, H * .86)), h }; }
  function newHeron() { return { dx: 0, act: null, t0: 0, queue: [{ k: "stalk", dur: 5.5 }, { k: "wait", dur: 3, pose: "rest" }, { k: "hunt", dur: 6, hit: false }, { k: "wait", dur: 2.5, pose: "stalk" }, { k: "hunt", dur: 13, hit: true }] }; }
  function heronPlan() { const r = Math.random();
    if (r < .3) return { k: "stalk", dur: R(4, 11) }; if (r < .62) return { k: "wait", dur: R(5, 20), pose: Math.random() < .5 ? "rest" : "stalk" };
    if (r < .72) return { k: "peerOnly", dur: R(3, 6) }; const hit = Math.random() < .3; return { k: "hunt", dur: hit ? 13 : 6, hit }; }
  const C = (a, b, k) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
  function drawHeron(now) { const A = heronAnchor(); if (!A) return; const hr = heron || (heron = newHeron()); const h = A.h;
    if (!hr.act || now - hr.t0 > hr.act.dur) { hr.act = hr.queue.length ? hr.queue.shift() : heronPlan(); hr.t0 = now; hr.sp = null; }
    const a = hr.act, t = now - hr.t0; let P = POSE[a.pose || "stalk"], step = 0, lean = 0, fluff = 0, fish = null, bulge = -1, headLag = 0;
    if (a.k === "stalk") { const T = 2.6, ph = (t % T) / T; hr.dx = cl(hr.dx + h * .0018, -W * .1, W * .45); if (hr.dx >= W * .45 - 1) hr.dx = -W * .05;
      step = ph < .6 ? Math.sin(ph / .6 * PI) : 0; step *= (Math.floor(t / T) % 2 ? 1 : -1); headLag = -(ph < .7 ? ph / .7 : 1 - (ph - .7) / .3) * h * .05; P = POSE.stalk; }   // head held still while body advances, then catches up
    else if (a.k === "wait") { P = POSE[a.pose]; }
    else if (a.k === "peerOnly") { P = mix(POSE.stalk, POSE.peer, ease(t / 1) * (1 - ease((t - a.dur + 1) / 1))); }
    else if (a.k === "hunt") {
      if (t < 1.4) P = mix(POSE.stalk, POSE.peer, ease(t / 1.4)); else if (t < 2.4) P = mix(POSE.peer, POSE.coil, ease((t - 1.4) / 1)); else if (t < 2.55) { P = mix(POSE.coil, POSE.strike, (t - 2.4) / .15); lean = (t - 2.4) / .15; }
      else if (t < 3.1) { P = POSE.strike; lean = 1; } else if (!a.hit) { const k = ease((t - 3.1) / 1.6); P = mix(POSE.strike, POSE.stalk, k); lean = 1 - k; }
      else { const ft = t - 3.1; lean = 1 - ease(ft / 1); P = mix(POSE.strike, POSE.hold, ease(ft / 1.1));
        if (ft < 2) fish = { a: 0 }; else if (ft < 2.7) fish = { a: (ft - 2) / .7 * PI, hop: Math.sin((ft - 2) / .7 * PI) }; else if (ft < 3.6) fish = { a: PI, sw: (ft - 2.7) / .9 };
        if (ft > 3.4 && ft < 5.6) bulge = (ft - 3.4) / 2.2; if (ft > 6 && ft < 7.6) fluff = Math.sin((ft - 6) / 1.6 * PI); if (ft > 7.6) P = mix(POSE.hold, POSE.rest, ease((ft - 7.6) / 1.5)); }
      if (t > 2.5 && !hr.sp) hr.sp = { pend: 1 }; }
    // ---- light: true colours, fading to silhouette only when strongly backlit near/after sunset
    const el = sunEl(), bl = backlit(); const sil = cl(bl ? 1 - (el - .5) / 5 : 1 - (el + 7) / 6, 0, 1) * .92, dk = [20, 16, 26], warm = el < 6 ? cl(1 - el / 6, 0, 1) * .25 : 0;
    const col = (rgb, m = 1) => C(rgb.map((v, i) => v * m * (i === 0 ? 1 + warm * .5 : i === 2 ? 1 - warm * .4 : 1)), dk, sil);
    const BODY = col([118, 132, 150]), WING = col([96, 110, 130]), DARK = col([40, 44, 56]), WHITE = col([232, 232, 228]), BILL = col([226, 170, 60]), RUST = col([150, 90, 60]), LEG = col([58, 52, 50]), NECK = col([128, 134, 148]);
    const fx = A.fx + hr.dx, fy = A.fy, U = (u, v) => [fx + u * h, fy - v * h], jit = fluff ? Math.sin(now * 55) * h * .01 * fluff : 0;
    const draw = (refl) => { x.lineCap = "round"; x.lineJoin = "round";
      // legs: tarsus (foot→heel, heel bends backward) + tibia (heel→hip); one leg lifted high, toes trailing
      const leg = (sx, lift) => { const hip = U(.0 + sx * .02 + lean * .05, .45), heel = U(-.035 + sx * .02 + lift * .07 + lean * .03, .22 + lift * .12), foot = U(sx * .02 + lift * .1, lift * .1);
        x.strokeStyle = LEG; x.lineWidth = Math.max(1, h * .014); x.beginPath(); x.moveTo(hip[0], hip[1]); x.lineTo(heel[0], heel[1]); x.lineTo(foot[0], foot[1]); x.stroke();
        if (lift > .05) { x.beginPath(); x.moveTo(foot[0], foot[1]); x.lineTo(foot[0] - h * .05, foot[1] + h * .03); x.stroke(); }
        x.strokeStyle = RUST; x.lineWidth = Math.max(1.5, h * .03); const th = U(sx * .02 + lean * .05, .47), th2 = U(-.01 + sx * .02 + lean * .04 + lift * .02, .4); x.beginPath(); x.moveTo(th[0], th[1]); x.lineTo(th2[0], th2[1]); x.stroke(); };
      leg(-1, Math.max(0, -step)); leg(1, Math.max(0, step));
      // body: tear-drop, front raised; leans forward in the strike; fluffs in the shake
      const [bx, by] = U(-.02 + lean * .07, .56 - lean * .05); x.save(); x.translate(bx + jit, by); x.rotate(-.32 + lean * .5);
      const th = h * (.085 + fluff * .02); x.fillStyle = BODY; x.beginPath(); x.moveTo(h * .18, -th * .2); x.bezierCurveTo(h * .12, -th * 1.4, -h * .14, -th * 1.2, -h * .22, th * .1); x.bezierCurveTo(-h * .12, th * 1.2, h * .12, th * 1.2, h * .18, -th * .2); x.fill();
      x.fillStyle = WING; x.beginPath(); x.ellipse(-h * .03, -th * .1, h * .15, th * .7, -.05, 0, 2 * PI); x.fill();   // folded wing
      x.strokeStyle = WING; x.lineWidth = Math.max(1, h * .008); for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(-h * .08 - i * h * .02, -th * .5); x.quadraticCurveTo(-h * .2 - i * h * .015, -th * .2 + jit, -h * .27 - i * h * .01, th * .4 + fluff * th * .6 * Math.sin(i + now * 30)); x.stroke(); }   // back plumes
      x.fillStyle = DARK; x.beginPath(); x.ellipse(h * .12, -th * .25, h * .035, th * .45, .3, 0, 2 * PI); x.fill();   // dark shoulder patch
      x.restore();
      // neck (kinked S / straight in strike) with streaky foreneck
      const base = U(.13 + lean * .08, .63 - lean * .06), c1 = U(P[2], P[3]), c2 = U(P[4], P[5]), hd = U(P[0] + headLag / h, P[1]);
      x.strokeStyle = NECK; x.lineWidth = Math.max(2, h * .042 * (1 + fluff * .3)); x.beginPath(); x.moveTo(base[0] + jit, base[1]); x.bezierCurveTo(c1[0] + jit, c1[1], c2[0], c2[1], hd[0], hd[1]); x.stroke();
      x.strokeStyle = WHITE; x.lineWidth = Math.max(1, h * .016); x.setLineDash([h * .02, h * .015]); x.beginPath(); x.moveTo(base[0] + h * .015, base[1] + h * .01); x.bezierCurveTo(c1[0] + h * .015, c1[1] + h * .01, c2[0] + h * .012, c2[1] + h * .008, hd[0] + h * .01, hd[1] + h * .01); x.stroke(); x.setLineDash([]);
      x.strokeStyle = WHITE; x.lineWidth = Math.max(1, h * .008); for (let i = 0; i < 4; i++) { const p0 = U(.12 + lean * .08 + i * .01, .6 - i * .02); x.beginPath(); x.moveTo(p0[0], p0[1]); x.lineTo(p0[0] - h * .01, p0[1] + h * .07); x.stroke(); }   // lower-neck plumes
      if (bulge >= 0) { const k = bulge, it = 1 - k, Q = [it ** 3 * hd[0] + 3 * it * it * k * c2[0] + 3 * it * k * k * c1[0] + k ** 3 * base[0], it ** 3 * hd[1] + 3 * it * it * k * c2[1] + 3 * it * k * k * c1[1] + k ** 3 * base[1]]; x.fillStyle = NECK; x.beginPath(); x.ellipse(Q[0], Q[1], h * .03, h * .025, 0, 0, 2 * PI); x.fill(); }
      // head: white face/crown, black stripe → plume; tilted (foreshortened) when peering
      const ba = P[6], tilt = P[7], hw = h * .045 * (1 - tilt * .35); x.save(); x.translate(hd[0], hd[1]); x.rotate(ba * .6);
      x.fillStyle = WHITE; x.beginPath(); x.ellipse(0, 0, hw, h * .028, 0, 0, 2 * PI); x.fill();
      x.fillStyle = DARK; x.beginPath(); x.ellipse(-hw * .2, -h * .014, hw * .9, h * .009, 0, 0, 2 * PI); x.fill(); x.strokeStyle = DARK; x.lineWidth = Math.max(1, h * .007); x.beginPath(); x.moveTo(-hw * .8, -h * .014); x.quadraticCurveTo(-hw * 1.8, -h * .02, -hw * 2.6, -h * .005 + jit); x.stroke(); x.restore();
      const bl2 = h * .13 * (1 - tilt * .3), tip = [hd[0] + Math.cos(ba) * bl2, hd[1] + Math.sin(ba) * bl2]; x.fillStyle = BILL; x.beginPath(); x.moveTo(hd[0] + Math.cos(ba - 1.2) * h * .016, hd[1] + Math.sin(ba - 1.2) * h * .016); x.lineTo(tip[0], tip[1]); x.lineTo(hd[0] + Math.cos(ba + 1.2) * h * .014, hd[1] + Math.sin(ba + 1.2) * h * .014); x.fill();
      if (fish && !refl) { const L = h * .1 * Math.max(0, 1 - (fish.sw || 0)); if (L > .5) { x.save(); x.translate(tip[0] - Math.cos(ba) * h * .1 * (fish.sw || 0), tip[1] - (fish.hop || 0) * h * .08); x.rotate(fish.sw != null ? ba + PI : ba + PI / 2 + fish.a);
        x.fillStyle = col([200, 210, 220]); x.beginPath(); x.ellipse(0, 0, L * .5, L * .14, 0, 0, 2 * PI); x.fill(); x.beginPath(); x.moveTo(-L * .45, 0); x.lineTo(-L * .65, -L * .12); x.lineTo(-L * .65, L * .12); x.fill(); x.restore(); } }
      if (!refl && hr.sp && hr.sp.pend) hr.sp = mkSplash(tip[0], fy, h * .07, a.hit ? 12 : 8); };
    draw(false); x.save(); x.beginPath(); x.rect(0, fy, W, H - fy); x.clip(); x.translate(0, 2 * fy); x.scale(1, -1); x.globalAlpha = .22; draw(true); x.restore();
    if (hr.sp && hr.sp.t0 && !drawSplash(hr.sp, now, sil < .5)) hr.sp = { done: 1 };
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
  function ospreyEvent() { const dir = Math.random() < .5 ? 1 : -1, dive = /now|dive/.test(q().get("wild") || "") || Math.random() < .6, D = R(22, 45); return { k: "osprey", t0: NOW, dir, dive, D, x0: R(.3, .7), dur: dive ? 17 : 9 }; }
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
  function size() { const st = d.querySelector(".stage"), pv = st && st.querySelector("#pv"); if (!pv) return false; if (!cv || !st.contains(cv)) { cv = d.createElement("canvas"); cv.id = "ag-wild"; cv.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:4"; pv.after(cv); x = cv.getContext("2d"); const E = x.ellipse.bind(x); x.ellipse = (a, b, rx, ry, ...r) => E(a, b, Math.abs(rx) + 1e-3, Math.abs(ry) + 1e-3, ...r); const A0 = x.arc.bind(x); x.arc = (a, b, r, ...q) => A0(a, b, Math.abs(r) + 1e-3, ...q); }
    const k = Math.min(1.5, g.devicePixelRatio || 1), w = pv.clientWidth, h = pv.clientHeight; cv.style.width = w + "px"; cv.style.height = h + "px"; cv.style.left = pv.offsetLeft + "px"; cv.style.top = pv.offsetTop + "px";
    if (cv.width !== Math.round(w * k)) { cv.width = Math.round(w * k); cv.height = Math.round(h * k); } W = w; H = h; x.setTransform(k, 0, 0, k, 0, 0); return true; }
  function frame(ms) { raf = 0; const w = which(); if (w !== "heron") d.querySelectorAll(".stage img.pv-fg,.stage img.pv-fg2").forEach(el => { if (el.style.visibility) el.style.visibility = ""; }); if (!w || !size()) { if (cv) x && x.clearRect(0, 0, cv.width, cv.height); ev = null; heron = null; return; }
    raf = requestAnimationFrame(frame); if (ms - last < 33) return; last = ms; const now = NOW = ms / 1000, lit = !backlit();
    const key = spot() + w; if (key !== curKey) { curKey = key; ev = null; heron = null; nextAt = now + (FORCE() ? .5 : R(3, 12)); }
    x.clearRect(0, 0, W, H);
    if (w === "heron") { drawHeron(now); return; }
    if (!ev && now > nextAt) ev = w === "osprey" ? ospreyEvent() : dolphinEvent();
    if (ev) { if (!ev.t0 || ev.t0 > now) ev.t0 = now; const alive = ev.k === "osprey" ? runOsprey(ev, now, lit) : runDolphins(ev, now, lit); if (!alive) { ev = null; const long = Math.random() < .25; nextAt = now + (FORCE() ? R(3, 8) : (w === "osprey" ? R(45, 90) : R(40, 80)) * (long ? R(1.5, 3) : 1)); } }
  }
  const kick = () => { if (!raf && which()) raf = requestAnimationFrame(frame); };
  setInterval(() => { if (!which()) d.querySelectorAll('.stage img.pv-fg,.stage img.pv-fg2').forEach(el => { if (el.style.visibility) el.style.visibility = ''; }); kick(); }, 1000); new MutationObserver(kick).observe(d.body, { childList: true, subtree: true });
  g.__agWild = { restart: () => { heron = null; }, seek: t => { const w = which(); if (!ev && w && w !== "heron") ev = w === "osprey" ? ospreyEvent() : dolphinEvent(); if (ev) ev.t0 = NOW - t; if (heron) heron.t0 = NOW - t; }, force: () => { nextAt = 0; ev = null; }, dbg: () => ({ w: which(), ev: ev && { k: ev.k, t: NOW - ev.t0, D: ev.D, dive: ev.dive }, W, H, nextAt, NOW, hz: hz(), ppm: pxPerM(100), raf }) };
})(window);
