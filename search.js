// Spot search: 🔍 in the top controls opens a list of every spot grouped by state, north→south; typing filters; choosing pans the map and opens the spot like tapping its pin.
(function () {
  let map = null;
  if (window.L && L.Map) L.Map.addInitHook(function () { if (!map) map = this; });
  const css = `
.srch-btn{min-width:44px;min-height:40px;display:inline-flex;align-items:center;justify-content:center;font-size:16px!important;cursor:pointer;color:inherit}
.srch{position:fixed;inset:0;z-index:3000;display:none;background:rgba(5,8,16,.45);backdrop-filter:blur(2px)}
.srch.open{display:block}
.srch-box{position:absolute;top:calc(env(safe-area-inset-top,0px) + 10px);left:50%;transform:translateX(-50%);width:min(440px,calc(100vw - 20px));max-height:min(78vh,680px);display:flex;flex-direction:column;background:rgba(18,22,34,.97);border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden;color:#eef1f7;font:14px/1.3 system-ui,-apple-system,Segoe UI,sans-serif}
.srch-head{display:flex;gap:8px;align-items:center;padding:10px;border-bottom:1px solid rgba(255,255,255,.08)}
.srch-head input{flex:1;min-width:0;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;padding:0 12px;font-size:16px;outline:none}
.srch-head input:focus{border-color:rgba(255,179,71,.7)}
.srch-x{width:44px;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:transparent;color:#fff;font-size:20px;cursor:pointer}
.srch-list{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4px 0 8px}
.srch-st{position:sticky;top:0;background:rgba(18,22,34,.98);padding:8px 14px 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#ffb347;font-weight:700}
.srch-it{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;min-height:46px;padding:8px 14px;border:0;background:none;color:inherit;text-align:left;font-size:15px;cursor:pointer}
.srch-it small{color:#9aa3b5;font-size:12px;white-space:nowrap}
.srch-it:hover,.srch-it.act{background:rgba(255,179,71,.14)}
.srch-none{padding:18px 14px;color:#9aa3b5}
@media (min-width:900px){.srch{background:rgba(5,8,16,.25)}.srch-box{top:64px}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let ov, inp, list, act = -1, items = [];
  function markerFor(sp) {
    if (!map) return null; let hit = null;
    map.eachLayer(l => { if (hit || !(l instanceof L.Marker) || !l.getTooltip) return; const t = l.getTooltip(), c = t && t.getContent && t.getContent(); if (typeof c === "string" && c.indexOf(`<b>${sp.name}</b>`) === 0) hit = l; });
    return hit;
  }
  function spots() {   // states ordered by their northernmost spot, spots north→south inside each state (keeps one header per state)
    const L = (window.SPOTS || []).slice(), top = {}; L.forEach(s => { top[s.state] = Math.max(top[s.state] ?? -90, s.lat); });
    return L.sort((a, b) => a.state === b.state ? b.lat - a.lat : top[b.state] - top[a.state]);
  }
  function render() {
    const q = norm(inp.value.trim()); let html = "", last = null; items = [];
    spots().forEach(sp => {
      if (q && !norm(sp.name + " " + sp.state + " " + (sp.type || "")).includes(q)) return;
      if (sp.state !== last) { html += `<div class="srch-st">${esc(sp.state)}</div>`; last = sp.state; }
      html += `<button class="srch-it" data-id="${esc(sp.id)}"><span>${esc(sp.name)}</span><small>${esc(sp.state)} · ${sp.lat.toFixed(2)}°N</small></button>`;
      items.push(sp.id);
    });
    list.innerHTML = html || `<div class="srch-none">No spots match “${esc(inp.value)}”</div>`;
    act = q && items.length ? 0 : -1; hl();
  }
  function hl() { list.querySelectorAll(".srch-it").forEach((b, i) => b.classList.toggle("act", i === act)); const a = list.querySelectorAll(".srch-it")[act]; if (a) a.scrollIntoView({ block: "nearest" }); }
  function choose(id) {
    const sp = (window.SPOTS || []).find(s => s.id === id); if (!sp) return; close();
    const m = markerFor(sp);
    if (map) map.setView(m ? m.getLatLng() : [sp.lat, sp.lng], Math.max(map.getZoom(), 9), { animate: true });
    if (m) m.fire("click");
  }
  function open() { ov.classList.add("open"); inp.value = ""; render(); list.scrollTop = 0; setTimeout(() => inp.focus(), 30); }
  function close() { ov.classList.remove("open"); inp.blur(); }
  function build() {
    ov = document.createElement("div"); ov.className = "srch"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Search spots");
    ov.innerHTML = `<div class="srch-box"><div class="srch-head"><input type="search" placeholder="Search spots or state…" aria-label="Search spots" autocomplete="off" enterkeyhint="go"><button class="srch-x" aria-label="Close">✕</button></div><div class="srch-list"></div></div>`;
    document.body.appendChild(ov);
    inp = ov.querySelector("input"); list = ov.querySelector(".srch-list");
    inp.addEventListener("input", render);
    ov.querySelector(".srch-x").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); const b = e.target.closest(".srch-it"); if (b) choose(b.dataset.id); });
    inp.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { act = Math.min(items.length - 1, act + 1); hl(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { act = Math.max(0, act - 1); hl(); e.preventDefault(); }
      else if (e.key === "Enter" && items.length) choose(items[Math.max(0, act)]);
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && ov.classList.contains("open")) { e.preventDefault(); e.stopImmediatePropagation(); close(); } }, true);
    const ctl = document.querySelector(".top-ctl");
    if (ctl) { const b = document.createElement("button"); b.id = "search-btn"; b.className = "pill srch-btn"; b.title = "Search spots"; b.setAttribute("aria-label", "Search spots"); b.textContent = "🔍"; b.onclick = open; ctl.insertBefore(b, ctl.firstChild); }
  }
  window.AGSearch = { open, close };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
