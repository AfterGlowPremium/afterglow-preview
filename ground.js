// d23: what is really on the ground BEHIND you for the 180° Turn — beach sand, marsh, lawn, the far shore's treeline / houses /
// dunes, or open water — so the photoreal shader can light it with the real sun (front-lit at sunset when you face east,
// backlit at sunrise when you face west, flat and diffuse under overcast) instead of the old flat silhouettes.
// Distances in metres, tree heights in metres, azimuths in radians from the view centre (+ = right).
// Hand-measured from OSM coastline / satellite imagery for the Virginia spots; everything else gets a per-type generic.
(function (g) {
  const SAND = 1, MARSH = 2, LAWN = 3;
  // [id] = { east: behind-at-sunset (facing ~ENE), west: behind-at-sunrise (facing ~WSW) }
  const GEO = {
    // Buckroe Beach: east = open Chesapeake Bay over the bay-mouth (no land in the view; the Eastern Shore is ~25 mi off, below the horizon).
    // west = the beach, then Buckroe Beach Park lawn and the low line of 2–3 storey beach houses and loblolly pines along 1st St / Pembroke Ave.
    saltponds: { east: { near: SAND, nearD: 9, water: true, d: 0 },
                 west: { land: true, near: SAND, nearD: 38, far: LAWN, d: 95, dl: 75, dr: 130, th: 14, town: 0.55, camH: 0.0017 } },
    // Lions Bridge (Mariners' Museum Park): east = Lake Maury — narrow lake, the park's tall hardwood/pine shore ~230 m across,
    // opening up the lake to the left (north); the near bank and spillway to the right. west = the open James River, Isle of Wight shore ~7–9 km.
    lionsbridge: { east: { near: LAWN, nearD: 5, water: true, d: 230, dl: 950, dr: 120, th: 23, town: 0, camH: 0.004, lake: 0.35 },   // sheltered lake: no bay swell, wind ripples only
                   west: { near: LAWN, nearD: 5, water: true, d: 7500, dl: 9000, dr: 6000, th: 20, town: 0.08, camH: 0.004 } },
    // Chick's Beach: east = Lynnhaven Inlet and the Lesner Bridge, Cape Story / First Landing pines beyond; open bay to the left (north).
    // west = the open bay; the Ocean View shoreline recedes off to the left (southwest).
    lesner: { east: { near: SAND, nearD: 10, water: true, d: 2600, dl: 2600, dr: 1100, th: 18, town: 0.35, a0: -0.12 },
              west: { near: SAND, nearD: 10, water: true, d: 6000, dl: 3000, dr: 6000, th: 14, town: 0.4, a1: -0.22 } },
    // d24 1st Street Jetty (Rudee Inlet north jetty, VB oceanfront): east = open Atlantic with surf, the rock jetty and the inlet's south
    // shore (low Rudee/Croatan buildings) on the right; west = the beach, the boardwalk and the wall of 10–20 storey oceanfront hotels.
    vb1st: { east: { near: SAND, nearD: 25, water: true, d: 450, dl: 450, dr: 300, th: 9, town: 0.6, a0: 0.38 },
             west: { land: true, near: SAND, nearD: 55, far: LAWN, d: 110, dl: 120, dr: 95, th: 48, town: 1, camH: 0.0017 },
             front: { west: { land: true, near: SAND, nearD: 55, far: LAWN, d: 110, dl: 120, dr: 95, th: 48, town: 1, camH: 0.0017 },
                     east: { near: SAND, nearD: 25, water: true, d: 450, dl: 450, dr: 300, th: 9, town: 0.6, a0: 0.38 } } },
  };
  const NEAR = { Beach: SAND, Pier: 0, Boardwalk: SAND, Lighthouse: SAND, Dunes: SAND, Marsh: MARSH, Park: LAWN, Woods: LAWN, Town: LAWN, Harbor: 0, Waterfront: 0, Bluff: LAWN, Summit: 0 };
  const FAR_W = { open: { d: 0 }, lowshore: { d: 5000, th: 14, town: 0.3 }, trees: { d: 700, th: 20, town: 0.03 }, town: { d: 1500, th: 12, town: 0.7 },
    islands: { d: 7000, th: 12, town: 0.15 }, bridge: { d: 3500, th: 12, town: 0.3 }, skyline: { d: 0 }, hills: { d: 0 } };
  function generic(B) {
    const nearT = NEAR[B.type] != null ? NEAR[B.type] : LAWN;
    if (B.water === false) {
      if (B.type === "Dunes") return { land: true, near: SAND, nearD: 25, far: SAND, d: 70, th: 0, dune: 1, camH: 0.0017 };
      if (B.type === "Town") return { land: true, near: LAWN, nearD: 30, far: LAWN, d: 90, th: 12, town: 0.75, camH: 0.0017 };
      if (B.type === "Woods") return { land: true, near: LAWN, nearD: 18, far: LAWN, d: 45, th: 22, town: 0, camH: 0.0017 };
      if (B.type === "Marsh") return { land: true, near: MARSH, nearD: 400, far: MARSH, d: 450, th: 15, town: 0.25, camH: 0.0017 };
      return { land: true, near: nearT || SAND, nearD: 40, far: LAWN, d: 110, th: 12, town: 0.45, camH: 0.0017 };
    }
    return Object.assign({ near: nearT, nearD: nearT === MARSH ? 18 : nearT === SAND ? 9 : 4, water: true }, FAR_W[B.far] || FAR_W.lowshore);
  }
  // sp = the app's spot (with .behind = { type, far, water }); rise = sunrise mode (behind = west)
  function behind(sp, rise) {
    const B = Object.assign({ type: "Beach", far: "lowshore", water: true }, sp.behind || {});
    const o = Object.assign({}, (GEO[sp.id] || {})[rise ? "west" : "east"] || generic(B));
    o.water = !o.land; return o;
  }
  // d24: what you face when the spot's own view is land (e.g. 1st Street Jetty at sunset = the hotels) — null = the usual horizon
  function front(sp, rise) { const F = (GEO[sp.id] || {}).front; const o = F && F[rise ? "east" : "west"]; return o ? Object.assign({}, o, { water: !o.land }) : null; }
  g.Ground = { behind, front, GEO };
})(window);
