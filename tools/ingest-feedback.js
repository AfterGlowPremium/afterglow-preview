// d24y: afterglow-feedback.json (the app's Export) → /workspace/groundtruth/feedback/: one JPEG per entry + index.json rows
// { id, spot, mode, at, shot, viewT, actual, acc, note, photo } that the ground-truth/calibration scripts can read. Re-running skips known ids.
// Usage: node tools/ingest-feedback.js afterglow-feedback.json [outDir]
const fs = require("fs"), path = require("path");
const inp = process.argv[2], out = process.argv[3] || "/workspace/groundtruth/feedback"; if (!inp) { console.error("usage: node tools/ingest-feedback.js export.json [outDir]"); process.exit(2); }
fs.mkdirSync(out, { recursive: true }); const ix = path.join(out, "index.json"); let rows = []; try { rows = JSON.parse(fs.readFileSync(ix, "utf8")); } catch (e) {}
const have = new Set(rows.map(r => r.id)); let n = 0;
for (const e of JSON.parse(fs.readFileSync(inp, "utf8"))) {
  const id = `${(e.at || "").replace(/[:.]/g, "-")}-${e.spot}`; if (have.has(id)) continue; let photo = null;
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(e.photo || ""); if (m) { photo = id + ".jpg"; fs.writeFileSync(path.join(out, photo), Buffer.from(m[1], "base64")); }
  rows.push({ id, spot: e.spot, mode: e.mode || "sunset", at: e.at, shot: e.shot || null, viewT: e.viewT || null, actual: e.actual, acc: e.acc, note: e.note || "", photo }); have.add(id); n++;
}
fs.writeFileSync(ix, JSON.stringify(rows, null, 1)); console.log(`ingested ${n} new, ${rows.length} total -> ${ix}`);
