// d24u: every spot × scene type × zoom × sunrise/sunset × Turn view: storm-tower bases must sit on that scene's horizon line and be clipped
// to the sky above it. The expected horizon is solved independently from the shader's ray setup (photoreal.js main()), not from camera().
const fs = require("fs"), vm = require("vm"), path = require("path"), root = path.join(__dirname, "..");
const noop = () => {}, grad = { addColorStop: noop };
const mkctx = () => new Proxy({}, { get: (o, k) => k in o ? o[k] : /Gradient$/.test(k) ? () => grad : k === "getImageData" ? () => ({ data: [] }) : noop, set: (o, k, v) => (o[k] = v, true) });
const mkcanvas = () => { const c = { width: 0, height: 0, clientWidth: 0, clientHeight: 0 }; const x = mkctx(); c.getContext = () => x; return c; };
const win = { devicePixelRatio: 1, document: { createElement: mkcanvas }, console }; win.window = win;
const ctx = vm.createContext(win); for (const f of ["spots.js", "wx.js", "photoreal.js"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx);
const PREV_HZ = +(/const r = rng\(spot\.id \+ ev\.tSet\), s = ev\.s, hz = H \* ([0-9.]+)/.exec(fs.readFileSync(path.join(root, "preview.js"), "utf8"))[1]);
function shaderHorizon(P, W, H) {   // bisection on rd.y + dip = 0 along the screen's centre column, same maths as the fragment shader
  const asp = W / H, vf = (asp < 1 ? 62 : asp < 1.5 ? 50 : 40) * (P.fovMul || 1), d2r = Math.PI / 180, th = Math.tan(vf * d2r / 2);
  const p = (vf * (P.hero && P.surf ? 0.04 : P.surf > 1.2 ? 0.09 : 0.17)) * d2r * (P.fovMul || 1) / Math.max(0.2, P.fovMul || 1), dip = Math.sqrt(2 * (P.heroCam || P.camH || 0.002) / 6371);
  const f = fy => { const uvy = (0.5 - fy), d = [0, uvy * 2 * th, -1], n = Math.hypot(...d); return (d[1] * Math.cos(p) - d[2] * Math.sin(p)) / n + dip; };
  let a = 0, b = 1; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (f(m) > 0) a = m; else b = m; } return (a + b) / 2;
}
const cells = [[-52, 66, 54, 6.2], [-28, 94, 50, 4.7], [-20, 118, 55, 6.7], [-8, 134, 57, 7.8], [0, 150, 48, 7.5], [10, 48, 58, 13.7], [20, 30, 52, 12]];
let n = 0, bad = [];
for (const sp of win.SPOTS) for (const rise of [false, true]) for (const turned of [false, true]) for (const zoom of [1, 1.5, 2, 3, 4]) for (const [W, H] of [[390, 560], [1280, 720]])
  for (const kind of ["photo", "surf", "hero", "pier", "canvas"]) {
    const P = { fovMul: 1 / zoom, surf: kind === "surf" ? 1.8 : kind === "hero" ? 1.5 : 0.3, hero: kind === "hero", heroCam: kind === "hero" ? 0.0015 : 0, camH: kind === "pier" ? 0.008 : sp.water ? 0.002 : 0.0025 };
    const live = kind !== "canvas", C = { storms: { cells }, elev: rise ? 2 : -3, turned };
    if (live) { const cam = ctx.Photoreal.camera(P, W, H); C.hz = cam.hz; C.vfov = cam.vfov; } else { C.hz = 0.66; C.vfov = 20; }
    const want = (live ? shaderHorizon(P, W, H) : PREV_HZ) * H, cv = mkcanvas(); cv.clientWidth = W; cv.clientHeight = H;
    ctx.Wx.draw(cv, C, 0, 1000); n++;
    const tb = C._towerBases || []; if (!tb.length) { bad.push(`${sp.id} ${kind} z${zoom} ${W}x${H}: no towers drawn`); continue; }
    for (const b of tb) if (Math.abs(b.clipY - want) > 0.5 || b.baseY < b.clipY - 0.01 || Math.abs(b.baseY - b.hid - want) > 0.5) bad.push(`${sp.id} ${rise ? "rise" : "set"} ${turned ? "turn" : ""} ${kind} z${zoom} ${W}x${H}: base ${b.baseY.toFixed(1)} clip ${b.clipY.toFixed(1)} want ${want.toFixed(1)}`);
  }
console.log(`horizon check: ${n} scenes (${win.SPOTS.length} spots × sunrise/sunset × turn × 5 zooms × 2 aspects × 5 scene types), ${bad.length} failures`);
if (bad.length) { console.log(bad.slice(0, 20).join("\n")); process.exit(1); }
