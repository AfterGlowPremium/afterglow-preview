// d25z: server-side forecast prefetch. Loads the preview app headless (jsdom) in each mode so the request set is EXACTLY the app's,
// lets it fetch the live NOAA HRRR/GFS forecast from Open-Meteo, and writes data/snap-base.json + data/snap-<mode>.json — the files
// every client reads first (CDN-cached, no Open-Meteo quota per user). Validates: same spot list, first day = today (America/New_York),
// full (not lite) data; never overwrites good files with a failure.
const { JSDOM, VirtualConsole } = require("jsdom"), fs = require("fs");
const ymd = t => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function grab(mode, LS) {
  const vc = new VirtualConsole(); vc.on("warn", (...m) => console.log("  [app]", String(m[0]).slice(0, 140)));
  const d = await JSDOM.fromURL(`https://afterglowpremium.github.io/afterglow-preview/app.html?mode=${mode}&prefetch=1&x=${Date.now()}`, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { for (const [k, v] of Object.entries(LS)) w.localStorage.setItem(k, v); w.fetch = (u, o) => fetch(new URL(String(u), w.location.href).href, o); w.AbortController = AbortController; w.AbortSignal = AbortSignal; w.TextDecoder = TextDecoder;
      w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => k === "canvas" ? {} : (k in t ? t[k] : () => ({ addColorStop() {}, data: [] })), set: (t, k, v) => (t[k] = v, true) }); } });
  const w = d.window; let B, D;
  for (let i = 0; i < 1200 && !(B && D); i++) { await sleep(100); B = w.localStorage.getItem("afterglow-v15-base"); D = w.localStorage.getItem("afterglow-v15-" + mode); }
  const out = { ...w.localStorage }; w.close(); return { B: B && JSON.parse(B), D: D && JSON.parse(D), LS: out };
}
(async () => {
  let LS = {}, ok = 0;
  for (const mode of ["sunset", "sunrise"]) {
    for (let a = 0; a < 3; a++) {
      const r = await grab(mode, LS); const B = r.B, D = r.D;
      const good = B && D && !B.lite && B.S && B.S.length && D.W && D.E && ymd(B.S[0].daily.time[0] * 1000 + 43200e3) === ymd(Date.now()) && Date.now() - B.at < 3600e3;
      if (good) { LS = r.LS; fs.writeFileSync("data/snap-base.json", JSON.stringify(B)); fs.writeFileSync(`data/snap-${mode}.json`, JSON.stringify(D)); ok++; console.log(`${mode}: ok, ${B.S.length} spots, day0 ${ymd(B.S[0].daily.time[0] * 1000 + 43200e3)}`); break; }
      console.log(`${mode}: attempt ${a + 1} failed (${B ? "lite/old/day" : "no data"}), backing off`); await sleep([20000, 65000, 0][a]);
    }
    await sleep(65000);   // one app load ≈ 600 weighted Open-Meteo calls — stay under the per-minute quota before the next mode
  }
  fs.writeFileSync("data/forecast-latest.json", JSON.stringify({ at: new Date().toISOString(), ok }));
  console.log("prefetch done:", ok, "of 2 modes");
  process.exit(0);
})();
