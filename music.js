// Background music, owned by the shell page (index.html) so it plays straight through every page/view of the app (which runs in the iframe).
// Track: audio/song2-lofi.m4a (AAC) with audio/song2-lofi.mp3 as fallback — Sean's song with a baked-in lo-fi treatment
// (warm low-pass ~3.6 kHz, -6 dB high shelf, gentle compression, tanh tape saturation, faint vinyl crackle + hiss; -25.5 LUFS vs -15.9 original),
// so it's quiet and soft even where WebAudio gain isn't available (iOS ignores <audio>.volume). Originals: audio/song2.m4a/.mp3.
// On by default. The first tap/click/key anywhere (shell or app iframe) unlocks audio INSIDE the gesture (iOS rule) and starts the song
// silently (gain 0); the audible fade-in (≈2 s, like the sky transition) fires when the app reports its sky scene has settled
// (scene.js → postMessage "ag-scene"), or 0.4 s after the tap if nothing is loading, or after a 2.5 s fallback. Already playing → untouched.
// Volume runs through a WebAudio GainNode so the fade also works on iOS (where <audio>.volume is read-only).
// 🎵 toggles mute; if music is on but not yet playing, tapping 🎵 starts it. Remembers "off" (localStorage "afterglow-music2").
(function () {
  const KEY = "afterglow-music2", VOL = 0.45, FADE = 2000, FALLBACK = 2500, BUSY_MAX = 8000, IDLE = 400;
  const SRC = new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"') ? "audio/song2-lofi.m4a?v=lf1" : "audio/song2-lofi.mp3?v=lf1";
  const EVS = ["touchend", "click", "pointerup", "mouseup", "keydown"];   // activation events on iOS/Android (touchstart/pointerdown are not)
  let au = null, ctx = null, gain = null, routed = false, on = false, audible = false, lvl = 0, raf = 0;
  let armT = 0, busy = false, fbTimer = 0, idleTimer = 0, gest = false;
  const docs = [], frames = [];
  const log = window.AGMusicLog = [];
  const b = document.createElement("button"); b.id = "music-btn"; b.textContent = "🎵"; b.setAttribute("aria-label", "Background music");
  const ctxOK = () => !routed || (ctx && ctx.state === "running");
  const playing = () => !!au && !au.paused && ctxOK();
  const ui = () => { b.className = on ? "on" : "off"; b.setAttribute("aria-pressed", String(on)); b.title = on ? (playing() ? "Mute music" : "Tap to start music") : "Play music"; };
  function setLvl(v) { lvl = v; clearTimeout(fadeTm); if (routed && gain) { try { gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setValueAtTime(v, ctx.currentTime); } catch (e) {} au.volume = 1; } else au.volume = Math.max(0, Math.min(1, v)); }
  let fadeTm = 0;
  function fade(to, ms, done) { cancelAnimationFrame(raf); clearTimeout(fadeTm);
    if (routed && gain && ctx.state === "running") {   // ramp on the audio thread: smooth even while the sky render keeps the main thread busy
      try { const g = gain.gain, now = ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(to, now + ms / 1000);
        lvl = to; fadeTm = setTimeout(() => done && done(), ms); return; } catch (e) {} } const from = lvl, t0 = performance.now();
    const st = now => { const f = Math.max(0, Math.min(1, (now - t0) / ms)), e = f * f * (3 - 2 * f); setLvl(from + (to - from) * e); if (f < 1) raf = requestAnimationFrame(st); else done && done(); };
    raf = requestAnimationFrame(st); }
  function make() {
    if (au) return;
    au = new Audio(); au.src = SRC; au.loop = true; au.preload = "auto"; au.setAttribute("playsinline", ""); au.volume = 0;
    au.addEventListener("playing", check);
    au.addEventListener("pause", () => { if (on) { audible = false; clearTimeout(fbTimer); fbTimer = 0; hookAll(); } ui(); });   // system pause (iOS interruption) → next tap restarts
  }
  function route() {   // create/resume the AudioContext inside a gesture and send the song through a GainNode
    try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      if (!ctx) { try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}   // iOS: don't let the ringer switch silence WebAudio
        ctx = new C(); ctx.onstatechange = () => { if (on && ctx.state !== "running") { audible = false; hookAll(); } else check(); ui(); }; }
      if (ctx.state !== "running") ctx.resume().then(check, () => {});
      if (!routed) { const s = ctx.createMediaElementSource(au); gain = ctx.createGain(); gain.gain.value = lvl; s.connect(gain).connect(ctx.destination); routed = true; au.volume = 1; }
      const sb = ctx.createBufferSource(); sb.buffer = ctx.createBuffer(1, 1, 22050); sb.connect(ctx.destination); sb.start(0);   // extra iOS unlock
    } catch (e) {}
  }
  function check() {   // running for real? stop listening, and schedule the audible fade-in for the scene beat
    if (!on || !playing()) { ui(); return; }
    unhookAll(); ui();
    if (!audible && !fbTimer) { armT = performance.now(); log.push(["armed", Math.round(armT)]);
      const due = performance.now() + FALLBACK; fbTimer = setTimeout(() => fallback(due), FALLBACK);
      clearTimeout(idleTimer); if (gest) idleTimer = setTimeout(() => { if (!busy) fadeIn("idle"); }, IDLE); }   // tapped and nothing is loading → the sky is already settled
  }
  function fallback(due) {   // no settle yet: if a page/scene is still loading, wait for it (up to 8 s from the tap), else fade now
    if (due && performance.now() - due > 500) { fbTimer = setTimeout(() => fadeIn("fallback-late"), 300); return; }   // timer ran late = a render was blocking; its settle is about to arrive
    const left = BUSY_MAX - (performance.now() - armT);
    if (busy && left > 50) { fbTimer = setTimeout(() => fadeIn("fallback-max"), left); return; }
    fadeIn("fallback");
  }
  function fadeIn(why) {
    clearTimeout(fbTimer); clearTimeout(idleTimer); fbTimer = 0;
    if (!on || audible || !playing()) return;
    audible = true; log.push(["fade", Math.round(performance.now()), why]); window.AGMusicFadeAt = performance.now();
    fade(VOL, FADE);
  }
  function tryPlay(gesture) {   // MUST run synchronously inside the gesture handler on iOS
    make(); if (!on) return;
    if (gesture) { route(); gest = true; }
    if (!au.paused) { check(); return; }
    if (!audible) setLvl(0);
    try { const p = au.play(); if (p && p.then) p.then(check, () => { if (on) hookAll(); ui(); }); } catch (e) {}
  }
  function onGesture(e) { if (e && e.target && (e.target === b || (b.contains && b.contains(e.target)))) return; tryPlay(true); }
  function hook(w) { try { if (!w || !w.document || docs.some(x => x[0] === w.document)) return; const d = w.document;
      EVS.forEach(n => { w.addEventListener(n, onGesture, true); d.addEventListener(n, onGesture, true); }); docs.push([d, w]); } catch (e) {} }
  function unhookAll() { docs.splice(0).forEach(([d, w]) => { try { EVS.forEach(n => { w.removeEventListener(n, onGesture, true); d.removeEventListener(n, onGesture, true); }); } catch (e) {} }); }
  function hookAll() { hook(window); frames.forEach(f => hook(f)); }
  function listen(w) {   // shell calls this on every iframe page load (and on a timer)
    for (let i = docs.length - 1; i >= 0; i--) { try { if (docs[i][1] === w && docs[i][0] !== w.document) docs.splice(i, 1); } catch (e) { docs.splice(i, 1); } }
    if (!frames.includes(w)) frames.push(w);
    if (on && !playing()) hook(w);
  }
  addEventListener("message", e => {   // scene beats from the app (scene.js)
    if (e.origin !== location.origin || !e.data || e.data.type !== "ag-scene") return;
    log.push([e.data.state, Math.round(performance.now()), e.data.what]);
    if (e.data.state === "busy") { busy = true; return; }
    busy = false; window.AGMusicSettledAt = performance.now();
    if (fbTimer && !audible) fadeIn("settled:" + e.data.what);
  });
  function set(v) {
    on = v;
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {}
    if (on) { hookAll(); tryPlay(true); if (playing() && !audible) fadeIn("button"); }
    else if (au) { unhookAll(); clearTimeout(fbTimer); fbTimer = 0; audible = false; fade(0, 900, () => { if (!on) au.pause(); }); }
    ui();
  }
  b.addEventListener("click", e => { e.stopPropagation();
    if (on && !playing()) { tryPlay(true); ui(); return; }   // on but blocked so far → this tap starts it (doesn't mute)
    set(!on); });
  let pref = null; try { pref = localStorage.getItem(KEY); } catch (e) {}
  on = pref !== "off"; ui();
  if (on) { make(); hookAll(); tryPlay(false); }   // autoplay where allowed (desktop); phones wait for the first tap
  window.AGMusic = { hook: listen, get playing() { return playing(); }, get audible() { return audible; }, get time() { return au ? au.currentTime : 0; }, get on() { return on; }, get level() { return lvl; } };
  document.addEventListener("visibilitychange", () => { if (!document.hidden && on && au && (au.paused || !ctxOK())) { hookAll(); tryPlay(false); } });
  const mount = () => document.body.appendChild(b);
  document.body ? mount() : addEventListener("DOMContentLoaded", mount);
})();
