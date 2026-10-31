// PREVIEW-ONLY extras (d28z9). Not ported to Premium: (1) state-zoom chips on the map, (2) 360° pro gestures.
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

  // ===== d28z9 preview-only features =====
  const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const curSpot = () => S().spot || (d.querySelector(".stage") && new URLSearchParams(location.search).get("spot"));
  const spotObj = id => (g.SPOTS || []).find(s => s.id === id);
  const result = id => (S().results || []).find(r => r.spot.id === id);
  // (4) favorites
  function favRow() { const m = d.getElementById("statezoom") || d.getElementById("regions"); if (!m) return; let row = d.getElementById("favrow"); const F = LS.get("agFav", []);
    if (!F.length) { if (row) row.remove(); return; } if (!row) { row = d.createElement("div"); row.id = "favrow"; row.className = "chips favrow"; m.before(row);
      row.addEventListener("click", e => { const b = e.target.closest("[data-fav]"); if (!b) return; const s = spotObj(b.dataset.fav); if (g.__agMap && s) g.__agMap.flyTo([s.lat, s.lng], 10, { duration: 0.8 }); g.__agOpenDetail && g.__agOpenDetail(b.dataset.fav); }); }
    row.innerHTML = "★ " + F.map(id => { const s = spotObj(id); return s ? `<button class="chip" data-fav="${id}">${s.name.split(",")[0]}</button>` : ""; }).join(""); }
  // (1) magnetic snap to slider ticks (golden hour, sunrise/sunset, best colour, twilight) within ~3 % of the slider span
  function snap(sl) { if (sl.__agSnap) return; sl.__agSnap = 1; sl.addEventListener("change", () => { const span = (+sl.max - +sl.min) || 1, v = +sl.value; let best = null, bd = span * 0.03;
      d.querySelectorAll(".scrub-marks .mk[data-t]").forEach(m => { const dd = Math.abs(+m.dataset.t - v); if (dd < bd) { bd = dd; best = +m.dataset.t; } });
      if (best != null && best !== v) { sl.value = best; sl.dispatchEvent(new Event("input", { bubbles: true })); if (navigator.vibrate) navigator.vibrate(8); } }); }
  // (2) yesterday / today / tomorrow + crossfade
  function fade() { const cv = d.getElementById("pv"), st = cv && cv.parentElement; if (!cv || !st) return; try { const im = new Image(); im.src = cv.toDataURL("image/jpeg", 0.7); im.className = "ag-xfade"; st.appendChild(im); requestAnimationFrame(() => requestAnimationFrame(() => im.classList.add("out"))); setTimeout(() => im.remove(), 900); } catch (e) {} }
  async function goDay(k, id) { fade(); const s = S();
    if (k < 0) { const keys = g.__agPastKeys && g.__agPastKeys(); if (!keys || !keys.length || !g.__agGoPast) return alert("Yesterday's archive isn't available yet."); await g.__agGoPast(keys[0]); }
    else { if (s.arch) { const ex = d.getElementById("arch-exit"); ex && ex.click(); await new Promise(r => setTimeout(r, 300)); } const b = d.querySelector(`.day[data-day="${k}"]`); b && b.click(); await new Promise(r => setTimeout(r, 300)); }
    g.__agOpenDetail && g.__agOpenDetail(id, true); }
  // (5) save a 2× still: WebGL scene re-rendered at 2× + weather/prop overlay + foreground photos + © mark
  async function still() { const cv = d.getElementById("pv"), st = cv && cv.parentElement; if (!cv) return; const W = cv.clientWidth * 2, H = cv.clientHeight * 2, out = d.createElement("canvas"); out.width = W; out.height = H; const x = out.getContext("2d");
    const L = g.PhotoStage && g.PhotoStage.last, off = d.createElement("canvas"); off.width = W; off.height = H; off.style.width = W / 2 + "px";
    let ok = false; try { if (L && g.Photoreal && g.Photoreal.render(off, Object.assign({}, L, { fast: false }))) { x.drawImage(off, 0, 0, W, H); ok = true; } } catch (e) {}
    if (!ok) x.drawImage(cv, 0, 0, W, H);
    st.querySelectorAll("canvas:not(#pv), img.pv-fg").forEach(el => { if (el.hidden || getComputedStyle(el).display === "none" || el.classList.contains("ag-xfade")) return; const r = el.getBoundingClientRect(), r0 = cv.getBoundingClientRect(); try { x.save(); x.filter = el.style.filter || "none"; x.drawImage(el, (r.left - r0.left) * 2, (r.top - r0.top) * 2, r.width * 2, r.height * 2); x.restore(); } catch (e) {} });
    x.font = `${Math.round(H * 0.018)}px system-ui`; x.textAlign = "right"; x.fillStyle = "rgba(255,255,255,.75)"; x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 4; x.fillText("© Sean Tuttle Afterglow", W - H * 0.02, H - H * 0.02);
    const blob = await new Promise(r => out.toBlob(r, "image/jpeg", 0.92)), name = `afterglow-${curSpot() || "view"}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.jpg`, file = new File([blob], name, { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: "Afterglow" }); return; } catch (e) {} }
    const a = d.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; d.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
  // (6) golden-hour / Trifecta alerts (local notifications while the page/PWA is open; service-worker showNotification when one is registered)
  const notify = async (title, body) => { try { const r = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (r) return r.showNotification(title, { body, icon: "icons/icon-192.png" }); new Notification(title, { body }); } catch (e) {} };
  const timers = {};
  function arm() { const B = LS.get("agBell", {}); for (const id in B) { clearTimeout(timers[id]); const r = result(id); if (!r) continue; const marks = r.ev && r.ev.times, gt = (B[id].t || 0) * 1000 - 30 * 60000, dt = gt - Date.now();
      if (dt > 0 && dt < 864e5) timers[id] = setTimeout(() => notify("Golden hour in 30 min", (spotObj(id) || {}).name || id), dt);
      const tri = r.ev && r.ev.tri; if (tri && tri.n >= 2 && !B[id].triSeen && (tri.on || (tri.bow || 0) >= 40)) { B[id].triSeen = Date.now(); LS.set("agBell", B); notify("Trifecta odds are up", `${(spotObj(id) || {}).name}: color + rainbow${tri.bolt ? " + lightning" : ""} possible`); } } }
  async function bell(id, btn) { const B = LS.get("agBell", {}); if (B[id]) { delete B[id]; LS.set("agBell", B); clearTimeout(timers[id]); btn.classList.remove("on"); return; }
    if (!("Notification" in g)) return alert("This browser can't show notifications. On iPhone: Share → Add to Home Screen, then open Afterglow from the icon.");
    const p = await Notification.requestPermission(); if (p !== "granted") return alert("Notifications are blocked for this site.");
    const gm = d.querySelector(".scrub-marks .mk.golden"); B[id] = { t: gm ? +gm.dataset.t : 0 }; LS.set("agBell", B); btn.classList.add("on"); arm(); }
  // (3) Milky Way: galactic plane (b = 0) → RA/Dec → alt/az for the slider time, drawn on the Wx overlay; sun < −15° (full at −18°), clear sky, moon not bright
  const r2d = 180 / Math.PI, d2r = Math.PI / 180;
  function galPlane(t, lat, lon) { const JD = t / 86400 + 2440587.5, lst = ((280.46061837 + 360.98564736629 * (JD - 2451545) + lon) % 360 + 360) % 360, aG = 192.85948 * d2r, dG = 27.12825 * d2r, lN = 122.93192 * d2r, ph = lat * d2r, P = [];
    for (let l = 0; l <= 360; l += 4) { const L = l * d2r, dec = Math.asin(Math.cos(dG) * Math.cos(lN - L)), ra = aG + Math.atan2(Math.sin(lN - L), -Math.sin(dG) * Math.cos(lN - L)), H = lst * d2r - ra;
      const alt = Math.asin(Math.sin(ph) * Math.sin(dec) + Math.cos(ph) * Math.cos(dec) * Math.cos(H)), az = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(ph) - Math.tan(dec) * Math.cos(ph)) * r2d + 180 + 360) % 360;
      P.push([az, alt * r2d, Math.exp(-Math.pow(((l + 180) % 360 - 180) / 70, 2))]); } return P; }
  function milky(cv, C, t) { const se = C.sunElev != null ? C.sunElev : 0, L3 = C.cloudL || [C.cloud || 0, 0, 0], clr = Math.max(0, 1 - Math.max(L3[0], L3[1], 0.7 * L3[2]) / 60), dark = Math.max(0, Math.min(1, (-15 - se) / 3));
    const M = C.moonPos, moon = M && M.alt > 0 ? M.frac * Math.min(1, M.alt / 10) : 0, a = dark * clr * (1 - 0.85 * moon); if (a < 0.03 || C.lat == null || C.faceAz == null) return;
    const x = cv.getContext("2d"), W = cv.clientWidth, H = cv.clientHeight, dpr = cv.width / Math.max(1, W), base = W / H < 1 ? 62 : W / H < 1.5 ? 50 : 40, k = C.vfov && C.vfov !== 20 ? Math.tan(base * Math.PI / 360) / Math.tan(C.vfov * Math.PI / 360) : 1, hz0 = (0.5 + ((C.hz != null ? C.hz : 0.6) - 0.5) / k) * H, ppd = H / base;
    const P = galPlane(t, C.lat, C.lng); x.save(); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.translate(W / 2, H / 2); x.scale(k, k); x.translate(-W / 2, -H / 2); x.beginPath(); x.rect(0, 0, W, hz0); x.clip(); x.globalCompositeOperation = "screen"; x.lineCap = "round";
    for (const [w, al] of [[16, 0.035], [9, 0.05], [4, 0.06]]) { x.lineWidth = w * ppd; for (let i = 1; i < P.length; i++) { const p0 = P[i - 1], p1 = P[i]; if (p0[1] < 2 && p1[1] < 2) continue; const da0 = ((p0[0] - C.faceAz + 540) % 360) - 180, da1 = ((p1[0] - C.faceAz + 540) % 360) - 180; if (Math.abs(da0 - da1) > 90) continue;
        x.strokeStyle = `rgba(215,215,240,${(al * a * (0.5 + 0.8 * (p0[2] + p1[2]) / 2) * Math.min(1, (p0[1] + p1[1]) / 30)).toFixed(3)})`; x.beginPath(); x.moveTo(W / 2 + da0 * ppd, hz0 - p0[1] * ppd); x.lineTo(W / 2 + da1 * ppd, hz0 - p1[1] * ppd); x.stroke(); } }
    x.restore(); }
  function hookWx() { if (!g.Wx || !g.Wx.draw) return setTimeout(hookWx, 500); if (g.Wx.draw.__ag) return; const o = g.Wx.draw; const f = function (cv, C, t, now) { const r = o.apply(this, arguments); try { if (C && t) milky(cv, C, t); } catch (e) {} return r; }; f.__ag = 1; g.Wx.draw = f; }
  // per-spot UI injected whenever the detail stage appears
  function stageUI() { const st = d.querySelector(".stage"), top = st && st.querySelector(".stage-top"), id = S().spot || null; if (!st || !top) return;
    const sid = id; const sl = d.getElementById("scrub"); if (sl) snap(sl);
    if (!top.querySelector(".ag-tools")) { const box = d.createElement("div"); box.className = "ag-tools";
      box.innerHTML = '<div class="ag-days" role="group" aria-label="Day"><button data-k="-1">Yest.</button><button data-k="0">Today</button><button data-k="1">Tmrw</button></div><button class="ag-fav" aria-label="Favorite">☆</button><button class="ag-bell" aria-label="Golden hour alert">🔔</button><button class="ag-snap" aria-label="Save still">📷</button>';
      top.appendChild(box);
      box.addEventListener("click", e => { e.stopPropagation(); const b = e.target.closest("button"); if (!b) return; const id2 = S().spot || sid; if (!id2) return;
        if (b.dataset.k != null) goDay(+b.dataset.k, id2);
        else if (b.classList.contains("ag-fav")) { let F = LS.get("agFav", []); F = F.includes(id2) ? F.filter(x => x !== id2) : [id2, ...F]; LS.set("agFav", F); favRow(); stageUI.sync(); }
        else if (b.classList.contains("ag-bell")) bell(id2, b); else if (b.classList.contains("ag-snap")) still(); }); }
    stageUI.sync(); }
  stageUI.sync = () => { const box = d.querySelector(".ag-tools"), id = S().spot; if (!box || !id) return; const f = LS.get("agFav", []).includes(id); const fb = box.querySelector(".ag-fav"); fb.textContent = f ? "★" : "☆"; fb.classList.toggle("on", f); box.querySelector(".ag-bell").classList.toggle("on", !!LS.get("agBell", {})[id]);
    const dd = S().arch ? -1 : (S().day || 0); box.querySelectorAll(".ag-days button").forEach(b => b.classList.toggle("on", +b.dataset.k === dd)); };
  new MutationObserver(() => { if (d.querySelector(".stage") && !d.querySelector(".ag-tools")) stageUI(); }).observe(d.body, { childList: true, subtree: true });
  const css2 = d.createElement("style"); css2.textContent = ".ag-tools{display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap}.ag-tools>button,.ag-days button{background:rgba(20,22,35,.6);border:1px solid rgba(255,255,255,.25);color:#fff;border-radius:999px;padding:4px 9px;font-size:12px}.ag-days{display:inline-flex;gap:2px}.ag-tools .on{background:rgba(255,160,60,.55)}.ag-xfade{position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;opacity:1;transition:opacity .8s}.ag-xfade.out{opacity:0}.favrow{margin-top:6px;align-items:center;color:#ffb347}";
  d.head.appendChild(css2);
  hookWx(); setTimeout(() => { favRow(); arm(); }, 4000); setInterval(arm, 15 * 60000);
  // (3) "?" help — callouts anchored to the controls visible right now; tap anywhere / ✕ / Esc closes
  function help() { if (d.getElementById("ag-help")) return; const b = d.createElement("button"); b.id = "ag-help"; b.textContent = "?"; b.setAttribute("aria-label", "Help: what the controls do"); d.body.appendChild(b);
    const txt = (sel, t) => ({ el: () => typeof sel === "function" ? sel() : d.querySelector(sel), t });
    const byText = re => () => [...d.querySelectorAll("button,a")].find(x => re.test(x.textContent) && x.offsetParent);
    const L = [txt("#pv-look", "360° view: swipe to look around · pinch to zoom · two-finger drag to tilt · double-tap zoom in · two-finger tap zoom out"),
      txt(".mode-toggle", "Switch between Sunrise and Sunset forecasts"), txt(".tricard,.tri-badge", "Trifecta: epic sky + rainbow + lightning odds"),
      txt("#statezoom", "Tap a state to zoom the map to its spots"), txt("#scrub", "Drag the time slider to watch the sky change"),
      txt("#pv-turn", "Turn 180° to see the sky behind you (rainbows!)"), txt(byText(/archive/i), "Archive: past predictions"), txt("#pv-fb", "Send a photo + rating to teach the forecast"), txt(".ag-days", "Jump to yesterday (archive), today or tomorrow"), txt(".ag-fav", "Save this spot to your favorites row"), txt(".ag-bell", "Alert 30 min before golden hour + Trifecta heads-up"), txt(".ag-snap", "Save a high-res still of this view"), txt(".scrub-marks", "Slider snaps gently to golden hour, sunset, best color and twilight"), txt("#favrow", "Your favorite spots")];
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
