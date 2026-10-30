// PREVIEW-ONLY extras (d28z4). Not ported to Premium: (1) state-zoom chips on the map, (2) 360° pro gestures.
(function (g) {
  const d = document, S = () => g.__agState || {}, Q = () => g.__agQueue && g.__agQueue();
  // (1) state zoom — tap a state chip, the map fits every spot in that state
  function chips() { const m = g.__agMap, reg = d.getElementById("regions"); if (!m || !reg || !g.SPOTS) return setTimeout(chips, 400);
    const top = {}; g.SPOTS.forEach(s => { top[s.state] = Math.max(top[s.state] ?? -90, s.lat); });
    const sts = Object.keys(top).sort((a, b) => top[b] - top[a]), row = d.createElement("div"); row.id = "statezoom"; row.className = "chips statezoom"; row.setAttribute("aria-label", "Zoom to a state");
    row.innerHTML = sts.map(s => `<button class="chip" data-st="${s}">${s}</button>`).join(""); reg.after(row);
    row.addEventListener("click", e => { const b = e.target.closest("[data-st]"); if (!b) return; row.querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === b));
      const pts = g.SPOTS.filter(s => s.state === b.dataset.st).map(s => [s.lat, s.lng]); if (pts.length === 1) m.flyTo(pts[0], 11, { duration: 1 }); else m.flyToBounds(pts, { padding: [40, 40], maxZoom: 12, duration: 1 }); }); }
  // (2) 360° pro gestures: 1-finger swipe look (inertia), pinch zoom, 2-finger vertical drag tilt, double-tap zoom in, 2-finger tap zoom out, mouse drag
  g.__agLookPro = true;
  const zoomTo = z => { const zs = d.getElementById("pv-zoom"); if (!zs) return; zs.value = Math.max(0.55, Math.min(4, z)); zs.dispatchEvent(new Event("input")); S().zoom = +zs.value; };
  const ppd = st => { const H = st.clientHeight || 600; return H / (st.clientWidth / H < 1 ? 62 : 50) * (S().zoom || 1); };
  const P = new Map(); let one = null, two = null, vx = 0, lt = 0, raf = 0, lastTap = 0, twoT = 0, moved = false;
  const skip = e => e.target.closest && e.target.closest(".stage-rail,.stage-bottom,.stage-top,button,input,a,details");
  const inStage = e => { const st = e.target.closest && e.target.closest(".stage"); return st && S().look && !skip(e) ? st : null; };
  const yawBy = dd => { const s = S(); s.yaw = (((s.yaw || 0) + dd) % 360 + 540) % 360 - 180; };
  d.addEventListener("pointerdown", e => { const st = inStage(e); if (!st) return; cancelAnimationFrame(raf); P.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false;
    if (P.size === 1) { one = { x: e.clientX, y: e.clientY, t: performance.now() }; vx = 0; two = null; }
    else if (P.size === 2) { const [a, b] = [...P.values()]; two = { d: Math.hypot(a.x - b.x, a.y - b.y), y: (a.y + b.y) / 2, z: S().zoom || 1, p: S().lpitch || 0, t: performance.now() }; one = null; } }, true);
  d.addEventListener("pointermove", e => { if (!P.has(e.pointerId)) return; const st = d.querySelector(".stage"); if (!st) return; P.set(e.pointerId, { x: e.clientX, y: e.clientY }); const k = ppd(st);
    if (one && P.size === 1) { const dx = e.clientX - one.x, dy = e.clientY - one.y, now = performance.now(); if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      yawBy(-dx / k); S().lpitch = Math.max(-8, Math.min(25, (S().lpitch || 0) + dy / k)); vx = -dx / k / Math.max(8, now - one.t) * 16; one = { x: e.clientX, y: e.clientY, t: now }; Q(); }
    else if (two && P.size === 2) { const [a, b] = [...P.values()], dd = Math.hypot(a.x - b.x, a.y - b.y), my = (a.y + b.y) / 2; if (Math.abs(dd - two.d) > 6 || Math.abs(my - two.y) > 6) moved = true;
      if (Math.abs(dd - two.d) > Math.abs(my - two.y)) zoomTo(two.z * dd / Math.max(1, two.d)); else { S().lpitch = Math.max(-8, Math.min(25, two.p + (my - two.y) / k)); Q(); } } }, true);
  const up = e => { if (!P.has(e.pointerId)) return; const n = P.size; P.delete(e.pointerId); const now = performance.now();
    if (n === 2 && two && !moved && now - two.t < 300) zoomTo((S().zoom || 1) * 0.8);   // two-finger tap → zoom out
    if (n === 1 && one) { if (!moved) { if (now - lastTap < 320) { zoomTo((S().zoom || 1) * 1.25); lastTap = 0; } else lastTap = now; }   // double-tap → zoom in
      else if (Math.abs(vx) > 0.05) { const spin = () => { vx *= 0.92; yawBy(vx); Q(); if (Math.abs(vx) > 0.02 && S().look) raf = requestAnimationFrame(spin); }; raf = requestAnimationFrame(spin); } }   // inertia
    if (!P.size) { one = two = null; } };
  d.addEventListener("pointerup", up, true); d.addEventListener("pointercancel", up, true);
  d.addEventListener("dblclick", e => { if (inStage(e)) { e.stopPropagation(); e.preventDefault(); } }, true);   // handled by the double-tap above
  d.addEventListener("touchmove", e => { if (inStage(e)) e.preventDefault(); }, { passive: false, capture: true });
  chips();
  // (3) "?" help — callouts anchored to the controls visible right now; tap anywhere / ✕ / Esc closes
  function help() { if (d.getElementById("ag-help")) return; const b = d.createElement("button"); b.id = "ag-help"; b.textContent = "?"; b.setAttribute("aria-label", "Help: what the controls do"); d.body.appendChild(b);
    const txt = (sel, t) => ({ el: () => typeof sel === "function" ? sel() : d.querySelector(sel), t });
    const byText = re => () => [...d.querySelectorAll("button,a")].find(x => re.test(x.textContent) && x.offsetParent);
    const L = [txt("#pv-look", "360° view: swipe to look around · pinch to zoom · two-finger drag to tilt · double-tap zoom in · two-finger tap zoom out"),
      txt(".mode-toggle", "Switch between Sunrise and Sunset forecasts"), txt(".tricard,.tri-badge", "Trifecta: epic sky + rainbow + lightning odds"),
      txt("#statezoom", "Tap a state to zoom the map to its spots"), txt("#scrub", "Drag the time slider to watch the sky change"),
      txt("#pv-turn", "Turn 180° to see the sky behind you (rainbows!)"), txt(byText(/archive/i), "Archive: past predictions"), txt("#pv-fb", "Send a photo + rating to teach the forecast")];
    let ov = null; const close = () => { if (ov) { ov.remove(); ov = null; } };
    b.addEventListener("click", e => { e.stopPropagation(); if (ov) return close(); ov = d.createElement("div"); ov.id = "ag-helpov"; ov.innerHTML = '<button class="x" aria-label="Close help">✕</button>'; d.body.appendChild(ov); const VW = innerWidth, VH = innerHeight, used = [];
      for (const it of L) { const el = it.el(); if (!el) continue; const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > VH || r.right < 0 || r.left > VW) continue;
        const c = d.createElement("div"); c.className = "c"; c.textContent = it.t; ov.appendChild(c); const w = Math.min(200, VW - 16); c.style.width = w + "px";
        const h = c.offsetHeight || 40, side = r.left > VW * 0.55; let top = side ? r.top + r.height / 2 - h / 2 : r.bottom + 6, left = side ? r.left - w - 10 : r.left + r.width / 2 - w / 2; if (side && left < 8) { left = VW - w - 8; top = r.bottom + 6; } if (top + h > VH - 4) top = r.top - h - 6;
        left = Math.max(8, Math.min(VW - w - 8, left)); top = Math.max(4, top); for (let k = 0; k < 20; k++) { const hit = used.find(u => left < u.l + u.w && left + w > u.l && top < u.t + u.h + 4 && top + h + 4 > u.t); if (!hit) break; top = hit.t + hit.h + 6; } used.push({ l: left, t: top, w, h });
        c.style.top = Math.min(VH - h - 4, top) + "px"; c.style.left = left + "px";
        const hl = d.createElement("i"); hl.className = "hl"; Object.assign(hl.style, { left: r.left - 3 + "px", top: r.top - 3 + "px", width: r.width + 6 + "px", height: r.height + 6 + "px" }); ov.appendChild(hl); }
      ov.addEventListener("click", close); });
    d.addEventListener("keydown", e => { if (e.key === "Escape") close(); }); }
  const css = d.createElement("style"); css.textContent = "#ag-help{position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:9000;width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(20,22,35,.7);color:#fff;font:600 15px system-ui;opacity:.75}#ag-helpov{position:fixed;inset:0;z-index:9001;background:rgba(5,6,15,.45)}#ag-helpov .c{position:fixed;background:#fff8ec;color:#222;font:13px/1.3 system-ui;padding:7px 9px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.4)}#ag-helpov .hl{position:fixed;border:2px solid #ffb347;border-radius:10px;pointer-events:none}#ag-helpov .x{position:fixed;right:12px;top:calc(12px + env(safe-area-inset-top));width:34px;height:34px;border-radius:50%;border:0;background:#fff;font-size:16px}"; d.head.appendChild(css);
  help();
})(window);
