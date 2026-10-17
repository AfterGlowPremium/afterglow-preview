// Background music, owned by the shell page (index.html) so it plays straight through every page/view of the app (which runs in the iframe).
// Track: audio/song2.m4a (Sean's song) with audio/song2.mp3 as fallback — replace both files to change songs.
// Tries to start as the startup/welcome screen loads; if the browser blocks autoplay, starts on the first touch/click/key anywhere
// (in the shell or inside the app iframe). 🎵 toggles mute. Fades in/out, loops, remembers "off" (localStorage "afterglow-music").
(function () {
  const KEY = "afterglow-music", VOL = 0.55, FADE = 1200;
  const SRC = new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"') ? "audio/song2.m4a" : "audio/song2.mp3";
  const EVS = ["pointerdown", "touchstart", "touchend", "keydown", "click", "wheel"];
  let au = null, raf = 0, on = false, waiting = false;
  const hooked = new WeakSet();
  const b = document.createElement("button"); b.id = "music-btn"; b.textContent = "🎵"; b.setAttribute("aria-label", "Background music");
  const ui = () => { b.className = on ? "on" : "off"; b.setAttribute("aria-pressed", String(on)); b.title = on ? "Mute music" : "Play music"; };
  const fade = (to, done) => { cancelAnimationFrame(raf); const from = au.volume, t0 = performance.now();
    const st = now => { const f = Math.max(0, Math.min(1, (now - t0) / FADE)); au.volume = Math.max(0, Math.min(1, from + (to - from) * f)); if (f < 1) raf = requestAnimationFrame(st); else done && done(); }; raf = requestAnimationFrame(st); };
  const make = () => { if (!au) { au = new Audio(SRC); au.loop = true; au.volume = 0; au.preload = "auto"; } };
  function start() {   // play (or keep playing) and fade in; never rewinds
    make(); if (!au.paused) { fade(VOL); waiting = false; return Promise.resolve(); }
    return au.play().then(() => { waiting = false; fade(VOL); });
  }
  function onGesture(e) { if (!on || !waiting || (e && e.target === b)) return; start().catch(() => {}); }
  function listen(w) { try { const d = w && w.document; if (!d || hooked.has(d)) return; hooked.add(d);   // per document: the iframe's window proxy stays the same across its page loads
    EVS.forEach(n => w.addEventListener(n, onGesture, { capture: true, passive: true })); } catch (e) {} }
  function set(v) {
    on = v; ui();
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {}
    if (on) start().catch(() => { waiting = true; });
    else if (au) { waiting = false; fade(0, () => { if (!on) au.pause(); }); }
  }
  b.addEventListener("click", e => { e.stopPropagation(); set(!on); });
  let pref = null; try { pref = localStorage.getItem(KEY); } catch (e) {}
  on = pref !== "off"; ui();
  listen(window);
  if (on) start().catch(() => { waiting = true; });   // startup screen: autoplay now if allowed, else first interaction anywhere
  // the app iframe is same-origin: catch taps inside it too (re-hooked on every page load in the frame)
  window.AGMusic = { hook: listen, get playing() { return !!au && !au.paused; }, get time() { return au ? au.currentTime : 0; }, get on() { return on; } };
  document.addEventListener("visibilitychange", () => { if (!document.hidden && on && au && au.paused) start().catch(() => { waiting = true; }); });
  const mount = () => document.body.appendChild(b);
  document.body ? mount() : addEventListener("DOMContentLoaded", mount);
})();
