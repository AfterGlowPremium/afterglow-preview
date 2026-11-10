// d28zzg headless check (not run by CI): boots the app, fails on page errors / console errors from our own scripts, then drives the
// feedback panel with Supabase MOCKED (no request leaves the box): Send disabled until the slider moves, a repeated photo is refused,
// and a row is sent with the full locked forecast + photo hash, falling back without them when the table lacks the new columns.
// Usage: python3 -m http.server 8817 &  NODE_PATH=<dir with puppeteer-core> node tests/browser-smoke.js [http://localhost:8817/] [chrome path]
const puppeteer = require("puppeteer-core"), fs = require("fs"), path = require("path");
const URL0 = process.argv[2] || "http://localhost:8817/", CHROME = process.argv[3] || "/usr/bin/google-chrome";
const sleep = ms => new Promise(r => setTimeout(r, ms)); let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log("  ✔ " + m); } else { fails++; console.log("  ✖ " + m); } };
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
  const errs = [], sent = []; let rowPosts = 0;
  p.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  p.on("console", m => { if (m.type() === "error") { const loc = (m.location() && m.location().url) || ""; errs.push(`console.error ${m.text().slice(0, 200)} @ ${loc}`); } });
  await p.setRequestInterception(true);
  p.on("request", r => { const u = r.url();
    if (/supabase\.co/.test(u)) {   // never reach the real backend (CORS headers so the page accepts the mock)
      const C = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
      if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: C, body: "" });
      if (/\/rest\/v1\/feedback/.test(u) && r.method() === "POST") { rowPosts++; const body = JSON.parse(r.postData() || "{}"); sent.push(body);
        if ("snap" in body) return r.respond({ status: 400, headers: C, contentType: "application/json", body: JSON.stringify({ code: "PGRST204", message: "Could not find the 'photo_sha256' column of 'feedback' in the schema cache" }) });
        return r.respond({ status: 201, headers: C, body: "" }); }
      return r.respond({ status: 200, headers: C, contentType: "application/json", body: "{}" }); }
    r.continue(); });
  await p.goto(URL0 + "?mode=sunset", { waitUntil: "domcontentloaded" });
  let f = null; for (let i = 0; i < 90 && !f; i++) { await sleep(1000); f = p.frames().find(x => /app\.html/.test(x.url())); if (f) { const n = await f.evaluate(() => (window.__agState && window.__agState.results || []).length).catch(() => 0); if (!n) f = null; } }
  ok(!!f, "app frame booted with forecast results");
  if (f) {
    const info = await f.evaluate(() => ({ b: window.AG_BUILD, oc: !!window.AGObsCheck, fb: !!window.AGFb, n: window.__agState.results.length }));
    ok(info.b === "d28zzg" && info.oc && info.fb, `build ${info.b}, obscheck ${info.oc}, fbutil ${info.fb}, ${info.n} spots scored`);
    await f.evaluate(() => { localStorage.removeItem("afterglow-feedback"); window.AGX.panel({ spot: window.__agState.results[0].spot.id }); });
    await sleep(300);
    ok(await f.$eval("#fb-send", e => e.disabled), "Send disabled before the rating slider is moved");
    ok((await f.$eval("#fb-o", e => e.textContent)) === "—", "no default rating shown");
    // photo with EXIF (the unit-test builder) twice → second refused
    const jpg = path.join(__dirname, "fixtures", "exif.jpg"); const inp = await f.$("#fb-photo");
    await inp.uploadFile(jpg); await sleep(1500);
    const n1 = await f.$$eval(".fb-th", a => a.length); ok(n1 === 1, "first photo accepted");
    await inp.uploadFile(jpg); await sleep(1500);
    ok((await f.$$eval(".fb-th", a => a.length)) === 1 && /already added/.test(await f.$eval("#fb-msg", e => e.textContent)), "same photo again is refused: " + await f.$eval("#fb-msg", e => e.textContent));
    await f.$eval("#fb-score", e => { e.value = 72; e.dispatchEvent(new Event("input", { bubbles: true })); });
    ok(!(await f.$eval("#fb-send", e => e.disabled)) && (await f.$eval("#fb-o", e => e.textContent)) === "72", "slider moved → Send enabled, shows 72");
    await f.click("#fb-send"); for (let i = 0; i < 20 && !/Sent|Saved/.test(await f.$eval("#fb-msg", e => e.textContent)); i++) await sleep(500);
    const msg = await f.$eval("#fb-msg", e => e.textContent); ok(/Sent/.test(msg), "send completed: " + msg);
    ok(rowPosts === 2 && "snap" in sent[0] && sent[0].photo_sha256 && !("snap" in sent[1]), "row sent with snap + photo_sha256, retried without them on PGRST204");
    const s0 = sent[0] || {}, pr = s0.pred || {};
    ok(s0.rating === 72 && pr.rated === 1 && pr.b === "d28zzg" && /^[0-9a-f]{64}$/.test(pr.sha || ""), `pred carries rated/build/sha (${JSON.stringify(pr).length} chars)`);
    ok(pr.gps && pr.gps.lat === 37.61 && pr.cap && pr.cap.src === "exif", "photo GPS + EXIF capture time in payload");
    ok(s0.snap && s0.snap.ev && s0.snap.ev.s && s0.snap.fc && "fetchedAt" in s0.snap.fc && s0.snap.build === "d28zzg", `snap = full locked forecast (${JSON.stringify(s0.snap || {}).length} chars, con ${!!(s0.snap && s0.snap.ev.con)}, solarPath ${!!(s0.snap && s0.snap.solarPath)})`);
    const loc = await f.evaluate(() => JSON.parse(localStorage.getItem("afterglow-feedback")));
    ok(loc.length === 1 && loc[0].up && loc[0].lock && loc[0].lock.ev, "phone backup keeps the locked forecast when the server didn't take it");
    ok(await f.$eval("#fb-send", e => e.disabled), "rating must be set again for the next send");
    await f.evaluate(() => localStorage.removeItem("afterglow-feedback"));
  }
  const ours = errs.filter(e => !/Failed to load resource|net::|status of 4\d\d|status of 5\d\d|tile|unpkg|429/i.test(e));
  ok(ours.length === 0, `no page errors / app console errors (${errs.length} total, ${ours.length} from app code)`); ours.concat(errs.slice(0, 8)).forEach(e => console.log("    " + e));
  await b.close(); console.log(`browser smoke: ${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
