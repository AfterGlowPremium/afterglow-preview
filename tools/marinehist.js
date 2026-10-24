// d25t: NWS archived marine forecasts (IEM AFOS archive of CWF/NSH) → data/marine-history.json, the past-day wave fallback when no buoy
// represents a spot. Per spot: its NWS marine zone; per zone: every issuance of the last 31 days with the FIRST period's waves/seas
// [issueT, loFt, hiFt, periodS|null, dirDeg|null]. The client only uses it when data/buoys has nothing, labelled "NWS marine forecast".
const fs = require("fs"), vm = require("vm");
const w = { console }; w.window = w; vm.createContext(w); vm.runInContext(fs.readFileSync("spots.js", "utf8") + ";window.S = SPOTS;", w);
const H = { "User-Agent": "afterglow (github.com/AfterGlowPremium)", Accept: "application/geo+json" };
const OLD = fs.existsSync("data/marine-history.json") ? JSON.parse(fs.readFileSync("data/marine-history.json", "utf8")) : {};
const CMP = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
const NOWATER = /Park/;   // sheltered marsh / park ponds: an open-water zone forecast doesn't describe them
async function zoneOf(s) {
  if (OLD.zones && OLD.zones[s.id]) return OLD.zones[s.id];
  for (const r of [0, .04, .08, .14]) for (const [dx, dy] of r ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[0, 0]]) {
    try { const j = await (await fetch(`https://api.weather.gov/zones?type=marine&point=${(s.lat + dy * r).toFixed(4)},${(s.lng + dx * r).toFixed(4)}`, { headers: H })).json();
      const f = (j.features || []).map(x => x.properties).find(p => /^[A-Z]{2}Z\d{3}$/.test(p.id));
      if (f) return { id: f.id, wfo: (f.cwa || f.forecastOffices || [""])[0].replace(/.*\//, "").replace(/^K/, ""), name: f.name }; } catch (e) {} }
  return null; }
function zonesIn(line) { const out = [], parts = line.replace(/-\d{6}-?$/, "").split("-"); let st = "";
  for (let p of parts) { if (/^[A-Z]{2}Z/.test(p)) { st = p.slice(0, 3); p = p.slice(3); } const m = p.match(/^(\d{3})(?:>(\d{3}))?$/); if (!m) continue;
    for (let n = +m[1]; n <= +(m[2] || m[1]); n++) out.push(st + String(n).padStart(3, "0")); } return out; }
function parse(txt, want) { const R = {};
  for (const prod of txt.split("\x01")) { const h = prod.match(/\n[A-Z]{4}\d\d [A-Z]{4} (\d\d)(\d\d)(\d\d)/); if (!h) continue;
    const now = new Date(); let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), +h[1], +h[2], +h[3])); if (d > now) d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, +h[1], +h[2], +h[3]));
    const t = d / 1000;
    for (const blk of prod.split(/\n\$\$/)) { const L = blk.split("\n"), zi = L.findIndex(l => /^[A-Z]{2}Z\d{3}.*-\d{6}-$/.test(l.trim()) || /^[A-Z]{2}Z\d{3}[->]/.test(l.trim())); if (zi < 0) continue;
      let zl = ""; for (let k = zi; k < L.length && /^[A-Z0-9>\-]+$/.test(L[k].trim()); k++) zl += L[k].trim(); const zs = zonesIn(zl).filter(z => want.has(z)); if (!zs.length) continue;
      const body = L.slice(zi).join(" ").replace(/\s+/g, " "), p1 = (body.match(/ \.[A-Z][A-Z ]+?\.\.\.(.*?)(?= \.[A-Z][A-Z ]+?\.\.\.|$)/) || [])[1]; if (!p1) continue;
      let lo, hi; const a = p1.match(/(?:Waves|Seas) (\d+) to (\d+) f(?:ee)?t/i), b = p1.match(/(?:Waves|Seas) (?:around )?(\d+) f(?:oo|ee)?t/i), c = p1.match(/(?:Waves|Seas) (\d+) f(?:oo|ee)?t or less/i), e = /(?:Waves|Seas) less than 1 f/i.test(p1);
      if (a) { lo = +a[1]; hi = +a[2]; } else if (c) { lo = 0; hi = +c[1]; } else if (b) { lo = hi = +b[1]; } else if (e) { lo = 0; hi = 1; } else continue;
      const wd = p1.match(/Wave Detail: ([NSEW]{1,3}) (\d+) f(?:oo|ee)?t at (\d+) seconds/i);
      for (const z of zs) (R[z] = R[z] || {})[t] = [t, lo, hi, wd ? +wd[3] : null, wd ? CMP[wd[1].toUpperCase()] : null]; } }
  return R; }
(async () => {
  const zones = {}; for (const s of w.S) zones[s.id] = NOWATER.test(s.type) ? null : await zoneOf(s);
  const byW = {}; for (const z of Object.values(zones)) if (z) (byW[z.wfo] = byW[z.wfo] || new Set()).add(z.id);
  const a = new Date(Date.now() - 31 * 864e5).toISOString().slice(0, 13) + ":00Z", b = new Date().toISOString().slice(0, 13) + ":00Z", fc = {};
  for (const [wfo, want] of Object.entries(byW)) for (const pil of ["CWF", "NSH"]) {
    try { const tx = await (await fetch(`https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py?pil=${pil}${wfo}&fmt=text&sdate=${a}&edate=${b}&limit=9999&order=asc`)).text();
      const R = parse(tx, want); for (const [z, o] of Object.entries(R)) if (!fc[z]) fc[z] = Object.values(o).sort((x, y) => x[0] - y[0]); } catch (e) { console.warn(pil + wfo, e.message); } }
  // light client: data/marine-history.json = spot→zone index only; one data/marine/<zone>.json per zone, fetched for the spot viewed
  fs.mkdirSync("data/marine", { recursive: true }); for (const f of fs.readdirSync("data/marine")) fs.unlinkSync("data/marine/" + f);
  for (const [z, a] of Object.entries(fc)) fs.writeFileSync(`data/marine/${z}.json`, JSON.stringify(a));
  fs.writeFileSync("data/marine-history.json", JSON.stringify({ at: new Date().toISOString(), zones, have: Object.keys(fc) }));
  const cov = Object.values(zones).filter(z => z && fc[z.id]).length; console.log(`marine-history: ${Object.keys(fc).length} zones, ${cov}/${w.S.length} spots with an archived NWS marine forecast`);
})();
