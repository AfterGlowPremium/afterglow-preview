// d28zzh: sun and moon discs are 15% smaller. Run: node --test tests/
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = path.join(__dirname, "..");
const load = (ctx, f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });

test("AG_SUN_MOON_SCALE is 0.85 and every disc uses it", () => {
  const w = { console, Math, JSON, document: { createElement: () => ({ getContext: () => null }) } };
  w.window = w; w.globalThis = w;
  const ctx = vm.createContext(w);
  load(ctx, "config.js");
  assert.equal(w.AG_SUN_MOON_SCALE, 0.85);
  load(ctx, "photoreal.js");
  assert.equal(w.Photoreal.SUN_MOON_SCALE, 0.85);
  const D = w.Photoreal.SUN_DISC;
  assert.equal(D.in0, 0.0264); assert.equal(D.out0, 0.0294); assert.equal(D.r0, 0.0282);
  assert.ok(Math.abs(D.in - 0.0264 * 0.85) < 1e-12, "shader inner edge " + D.in);
  assert.ok(Math.abs(D.out - 0.0294 * 0.85) < 1e-12, "shader outer edge " + D.out);
  assert.ok(Math.abs(D.r - 0.0282 * 0.85) < 1e-12, "shader limb radius " + D.r);
  // 1.62° * 0.85 = 1.377° ≈ 0.02397 rad
  assert.ok(Math.abs(D.r * 180 / Math.PI - 1.62 * 0.85) < 0.005, "angular size " + (D.r * 180 / Math.PI));

  const fsSrc = fs.readFileSync(path.join(ROOT, "photoreal.js"), "utf8");
  assert.match(fsSrc, /\$\{SUN_DISC_IN\.toFixed\(6\)\}/);
  assert.match(fsSrc, /\$\{SUN_DISC_OUT\.toFixed\(6\)\}/);
  assert.match(fsSrc, /\$\{SUN_DISC_R\.toFixed\(6\)\}/);
  // original hardcoded disc radii must no longer be live shader constants
  assert.doesNotMatch(fsSrc, /smoothstep\(\.0264,\s*\.0294,/);
  assert.doesNotMatch(fsSrc, /ang\/\.0282/);

  const preview = fs.readFileSync(path.join(ROOT, "preview.js"), "utf8");
  assert.match(preview, /sunR\s*=\s*H\s*\*\s*0\.128\s*\*\s*SUN_MOON_SCALE/);
  assert.match(preview, /AG_SUN_MOON_SCALE\s*\|\|\s*0\.85/);

  const wx = fs.readFileSync(path.join(ROOT, "wx.js"), "utf8");
  assert.match(wx, /Math\.max\(13\.2,\s*1\.56\s*\*\s*ppd\)\s*\*\s*S/);
  assert.match(wx, /AG_SUN_MOON_SCALE\s*\|\|\s*0\.85/);

  // glow/halo that is a multiple of the disc radius should keep using sunR / r (so it shrinks with the disc)
  assert.match(preview, /sunR\s*\*\s*4/);
  assert.match(wx, /r\s*\*\s*3\.8/);
  assert.match(wx, /r\s*\*\s*9/);
});
