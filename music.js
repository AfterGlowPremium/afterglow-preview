// Background music (DRAFT). Track: audio/track.m4a (Sean's song) with audio/track.mp3 as fallback — replace both files to change songs.
// Starts on first tap anywhere (unless previously muted); 🎵 toggles mute. Fades in/out, loops, remembers the choice (localStorage "afterglow-music").
(function () {
  const KEY = "afterglow-music", VOL = 0.55, FADE = 1200;
  const SRC = new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"') ? "audio/track.m4a" : "audio/track.mp3";
  let au = null, raf = 0, on = false;
  const fade = (to, done) => { cancelAnimationFrame(raf); const from = au.volume, t0 = performance.now();
    const st = now => { const f = Math.min(1, (now - t0) / FADE); au.volume = from + (to - from) * f; if (f < 1) raf = requestAnimationFrame(st); else done && done(); }; raf = requestAnimationFrame(st); };
  function set(v, btn) {
    on = v;
    if (on) { if (!au) { au = new Audio(SRC); au.loop = true; au.volume = 0; }
      au.play().then(() => fade(VOL)).catch(() => { on = false; btn.className = "off"; });
    } else if (au) fade(0, () => au.pause());
    btn.className = on ? "on" : "off"; btn.setAttribute("aria-pressed", String(on)); btn.title = on ? "Mute music" : "Play music";
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {}
  }
  // start immediately (script runs in <head>, during the startup/welcome screen)
  const b = document.createElement("button"); b.id = "music-btn"; b.textContent = "🎵"; b.className = "off"; b.setAttribute("aria-label", "Background music");
  if (localStorage.getItem(KEY) !== "off") {
    au = new Audio(SRC); au.loop = true; au.volume = 0; au.preload = "auto";
    b.className = "on"; on = true;
    const evs = ["pointerdown", "touchstart", "keydown", "click", "scroll", "wheel"];
    const go = e => { evs.forEach(n => removeEventListener(n, go, true)); if (on && e.target !== b) au.play().then(() => fade(VOL)).catch(() => {}); };
    au.play().then(() => fade(VOL)).catch(() => evs.forEach(n => addEventListener(n, go, { capture: true, passive: true })));
  }
  b.addEventListener("click", e => { e.stopPropagation(); set(!on, b); });
  const mount = () => document.body.appendChild(b);
  document.body ? mount() : addEventListener("DOMContentLoaded", mount);
})();
