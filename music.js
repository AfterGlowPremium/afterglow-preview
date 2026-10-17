// Background music, owned by the shell page (index.html) so it plays straight through every page/view of the app (which runs in the iframe).
// Track: audio/song2.m4a (Sean's song) with audio/song2.mp3 as fallback — replace both files to change songs.
// On by default. Tries to start as the startup/welcome screen loads; phones (iOS Safari especially) block that, so it starts on the first
// tap/click/key anywhere — in the shell or inside the app iframe. Gesture listeners stay attached until the song is ACTUALLY playing
// (checked via au.paused, not via the play() promise: iOS can resolve an autoplay and then pause it right away).
// 🎵 toggles mute; if music is on but not yet playing, tapping 🎵 starts it. Remembers "off" (localStorage "afterglow-music2").
(function () {
  const KEY = "afterglow-music2", VOL = 0.55, FADE = 1200;
  const SRC = new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"') ? "audio/song2.m4a" : "audio/song2.mp3";
  // only events that count as a user activation on iOS/Android (touchstart/pointerdown do NOT on iOS)
  const EVS = ["touchend", "click", "pointerup", "mouseup", "keydown"];
  let au = null, raf = 0, on = false, ctx = null;
  const docs = [];   // [window, handler] pairs currently hooked
  const b = document.createElement("button"); b.id = "music-btn"; b.textContent = "🎵"; b.setAttribute("aria-label", "Background music");
  const playing = () => !!au && !au.paused;
  const ui = () => { b.className = on ? "on" : "off"; b.setAttribute("aria-pressed", String(on)); b.title = on ? (playing() ? "Mute music" : "Tap to start music") : "Play music"; };
  const fade = (to, done) => { cancelAnimationFrame(raf); const from = au.volume, t0 = performance.now();
    const st = now => { const f = Math.max(0, Math.min(1, (now - t0) / FADE)); au.volume = Math.max(0, Math.min(1, from + (to - from) * f)); if (f < 1) raf = requestAnimationFrame(st); else done && done(); }; raf = requestAnimationFrame(st); };
  function make() {
    if (au) return;
    au = new Audio(); au.src = SRC; au.loop = true; au.preload = "auto"; au.volume = 0; au.setAttribute("playsinline", "");
    au.addEventListener("playing", () => { if (!on) { au.pause(); return; } au.muted = false; fade(VOL); unhookAll(); ui(); });
    au.addEventListener("pause", () => { if (on) hookAll(); ui(); });   // paused by the system (iOS interruption etc.) → next tap restarts it
  }
  function unlockCtx() {   // extra iOS unlock: resume a WebAudio context and play one silent sample inside the gesture
    try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; ctx = ctx || new C();
      if (ctx.state !== "running") ctx.resume(); const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); } catch (e) {}
  }
  function tryPlay(gesture) {   // MUST be called synchronously inside the gesture handler
    make(); if (!on || playing()) return;
    if (gesture) unlockCtx();
    au.muted = false;
    try { const p = au.play(); if (p && p.catch) p.catch(() => { if (on && au.paused) hookAll(); ui(); }); } catch (e) {}
  }
  function onGesture(e) { if (e && (e.target === b || (b.contains && b.contains(e.target)))) return; tryPlay(true); }
  function hook(w) {   // capture-phase on window AND document so app handlers (Leaflet stopPropagation etc.) can't swallow the tap
    try { if (!w || !w.document || docs.some(x => x[0] === w.document)) return;
      const d = w.document; EVS.forEach(n => { w.addEventListener(n, onGesture, true); d.addEventListener(n, onGesture, true); }); docs.push([d, w]); } catch (e) {}
  }
  function unhookAll() { docs.splice(0).forEach(([d, w]) => { try { EVS.forEach(n => { w.removeEventListener(n, onGesture, true); d.removeEventListener(n, onGesture, true); }); } catch (e) {} }); }
  let frames = [];   // extra windows (the app iframe) to hook while we're still waiting for a tap
  function hookAll() { hook(window); frames.forEach(f => { try { hook(f); } catch (e) {} }); }
  function listen(w) {   // called by the shell on every iframe page load (and on a timer); docs change per page load
    try { for (let i = docs.length - 1; i >= 0; i--) { try { if (docs[i][1] === w && docs[i][0] !== w.document) docs.splice(i, 1); } catch (e) { docs.splice(i, 1); } } } catch (e) {}
    if (!frames.includes(w)) frames.push(w);
    if (on && !playing()) hook(w);
  }
  function set(v) {
    on = v;
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {}
    if (on) { hookAll(); tryPlay(true); }
    else if (au) { unhookAll(); fade(0, () => { if (!on) au.pause(); }); }
    ui();
  }
  b.addEventListener("click", e => { e.stopPropagation();
    if (on && !playing()) { tryPlay(true); ui(); return; }   // on but blocked so far → this tap starts it (doesn't mute)
    set(!on); });
  let pref = null; try { pref = localStorage.getItem(KEY); } catch (e) {}
  on = pref !== "off"; ui();
  if (on) { make(); hookAll(); tryPlay(false); }   // startup screen: autoplay now if allowed; otherwise listeners wait for the first tap
  window.AGMusic = { hook: listen, get playing() { return playing(); }, get time() { return au ? au.currentTime : 0; }, get on() { return on; } };
  document.addEventListener("visibilitychange", () => { if (!document.hidden && on && au && au.paused) { hookAll(); tryPlay(false); } });
  const mount = () => document.body.appendChild(b);
  document.body ? mount() : addEventListener("DOMContentLoaded", mount);
})();
