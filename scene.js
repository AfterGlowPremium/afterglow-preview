// Tells the shell (index.html → music.js) when the sky has settled into its scene, so the music fades in on the same beat.
// Posts {type:"ag-scene", state:"busy"|"settled", what} to the parent. Separate file: no edits to app.js/photostage.js needed.
(function () {
  const P = window.parent; if (!P || P === window) return;
  const post = (state, what) => { try { P.postMessage({ type: "ag-scene", state, what }, location.origin); } catch (e) {} };
  const settle = what => requestAnimationFrame(() => requestAnimationFrame(() => post("settled", what)));   // after the frame is on screen
  // leaving this page (Sunrise/Sunset buttons, mode toggle, featured link, retry) → busy until the next page settles
  addEventListener("click", e => { const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (a && !a.target && a.origin === location.origin) post("busy", "nav"); }, true);
  addEventListener("pagehide", () => post("busy", "nav"));
  const home = document.documentElement.classList.contains("show-home");
  if (home) { if (document.readyState === "complete") settle("welcome"); else addEventListener("load", () => settle("welcome")); }
  else post("busy", "load");
  // map view ready: the "Reading the sky…" screen starts fading out
  const hookLoading = () => { const ld = document.getElementById("loading"); if (!ld) return;
    let done = ld.classList.contains("done"); if (done && !home) settle("map");
    new MutationObserver(() => { const d = ld.classList.contains("done"); if (d && !done) settle("map"); done = d; }).observe(ld, { attributes: true, attributeFilter: ["class"] }); };
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", hookLoading) : hookLoading();
  // spot sheet opening → busy until its scene draws (or 1.5 s if it has no PhotoStage render)
  let lastDraw = 0;
  const hookDetail = () => { const dt = document.getElementById("detail"); if (!dt) return; let open = dt.classList.contains("open");
    new MutationObserver(() => { const o = dt.classList.contains("open"); if (o && !open) { const t = performance.now(); post("busy", "detail");
      setTimeout(() => { if (lastDraw < t) settle("detail"); }, 1500); } open = o; }).observe(dt, { attributes: true, attributeFilter: ["class"] }); };
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", hookDetail) : hookDetail();
  // spot scenes (incl. the flat-gray overcast render): the first PhotoStage.draw after a quiet spell = a new scene
  const wrap = () => { const PS = window.PhotoStage; if (!PS || !PS.draw || PS.draw.__agScene) return !!PS;
    const orig = PS.draw; let last = 0;
    const w = function () { const now = performance.now(), fresh = now - last > 900; last = lastDraw = now; if (fresh) post("busy", "scene");
      try { return orig.apply(this, arguments); } finally { if (fresh) settle("scene"); } };
    w.__agScene = true; PS.draw = w; return true; };
  if (!wrap()) { const iv = setInterval(() => { if (wrap()) clearInterval(iv); }, 200); setTimeout(() => clearInterval(iv), 20000); }
})();
