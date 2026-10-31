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
    // d28z Buckroe Coffee Co. (1936 E Pembroke Ave, OSM node 12230776315): street scene both ways — Pembroke Ave lawns, 1–2 storey Hampton houses, loblolly/oak street trees
    buckroecoffee: { east: { land: true, near: LAWN, nearD: 14, far: LAWN, d: 40, dl: 35, dr: 50, th: 17, town: 0.75, camH: 0.0017 }, west: { land: true, near: LAWN, nearD: 14, far: LAWN, d: 45, dl: 40, dr: 55, th: 3, town: 0, camH: 0.0017 },   /* d28zc: generic storefront removed — the photo cut-out is the foreground */
      front: { east: { land: true, near: LAWN, nearD: 14, far: LAWN, d: 40, th: 17, town: 0.75, camH: 0.0017 }, west: { land: true, near: LAWN, nearD: 6, far: 0, d: 0, th: 0, town: 0, camH: 0.0017 } } },
    // d28z lighthouse spots (OSM man_made=lighthouse; viewpoints chosen so the tower sits in the default view — drawn by Wx lighthouses())
    oldpointlight: { east: { near: SAND, nearD: 6, water: true, d: 6000, dl: 4000, dr: 9000, th: 10, town: 0.3 }, west: { land: true, near: LAWN, nearD: 12, far: LAWN, d: 140, dl: 90, dr: 220, th: 16, town: 0.45, camH: 0.0017 },
      front: { east: { near: SAND, nearD: 6, water: true, d: 6000, th: 10, town: 0.3 }, west: { land: true, near: LAWN, nearD: 12, far: LAWN, d: 140, th: 16, town: 0.45, camH: 0.0017 } } },
    hatteraslight: { front: { west: { land: true, near: SAND, nearD: 20, far: LAWN, d: 400, th: 22, town: 0.05, camH: 0.0017 } } },   // d28zc: Buxton Woods maritime forest
    keywest: { front: { east: { land: true, near: LAWN, nearD: 15, far: LAWN, d: 150, th: 14, town: 0.8, camH: 0.0017 } } },   // d28zc: Mallory Sq east = Old Town
    windmillpt: { east: { land: true, near: LAWN, nearD: 18, far: LAWN, d: 26, dl: 30, dr: 34, th: 16, town: 0.85, reg: [1, 3, 0], camH: 0.0017 }, west: { near: SAND, nearD: 2, water: true, d: 2600, dl: 1800, dr: 3500, th: 14, town: 0.1, camH: 0.0019 },
      front: { east: { land: true, near: LAWN, nearD: 18, far: LAWN, d: 26, dl: 30, dr: 34, th: 16, town: 0.85, reg: [1, 3, 0], camH: 0.0017 }, west: { near: SAND, nearD: 2, water: true, d: 2600, dl: 1800, dr: 3500, th: 14, town: 0.1, camH: 0.0019 } } },   // d28zf: 484 Wind Mill Point Rd — E = 2-storey sided house + neighbours across the back lawn (~26 m), W = open Back River, far shore ~2-3 km
    stsimons: { front: { west: { near: SAND, nearD: 6, water: true, d: 6000, dl: 4000, dr: 9000, th: 18, town: 0.12 } } },   // d28zb: west = St. Simons Sound → Jekyll/Brunswick marsh + treeline (OSM survey), not open Atlantic
    roanokemarshes: { east: { near: SAND, nearD: 4, water: true, d: 3200, dl: 2500, dr: 4500, th: 9, town: 0.05 }, west: { land: true, near: LAWN, nearD: 15, far: LAWN, d: 150, dl: 120, dr: 250, th: 12, town: 0.6, camH: 0.0017 },
      front: { east: { near: SAND, nearD: 4, water: true, d: 3200, th: 9, town: 0.05 }, west: { land: true, near: LAWN, nearD: 15, far: LAWN, d: 150, th: 12, town: 0.6, camH: 0.0017 } } },
    thimbleshoal: { east: { water: true, d: 0 }, west: { water: true, d: 6500, dl: 7000, dr: 9000, th: 9, town: 0.35 }, front: { east: { water: true, d: 0 }, west: { water: true, d: 6500, th: 9, town: 0.35 } } },
    hatteraslight: { east: { near: SAND, nearD: 30, water: true, d: 0 }, west: { land: true, near: SAND, nearD: 40, far: LAWN, d: 160, dl: 140, dr: 200, th: 20, town: 0.05, camH: 0.0017 },
      front: { east: { near: SAND, nearD: 30, water: true, d: 0 }, west: { land: true, near: SAND, nearD: 40, far: LAWN, d: 160, th: 20, town: 0.05, camH: 0.0017 } } },
    bodielight: { west: { near: MARSH, nearD: 8, water: true, d: 2600, dl: 2200, dr: 3500, th: 8, town: 0.05, lake: 0.3 }, east: { land: true, near: MARSH, nearD: 20, far: LAWN, d: 420, dl: 380, dr: 520, th: 8, town: 0, camH: 0.0017 },
      front: { west: { near: MARSH, nearD: 8, water: true, d: 2600, th: 8, town: 0.05, lake: 0.3 }, east: { land: true, near: MARSH, nearD: 20, far: LAWN, d: 420, th: 8, town: 0, camH: 0.0017 } } },
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
    // d28e Mattaponi (Melrose Landing, satellite-checked): west = the river (~150 m) then ~2 km of cordgrass tidal marsh cut by creeks,
    // fading to a low ragged cypress/gum swamp treeline — no buildings. east = the landing's grass, then pine/hardwood woods (no houses in view).
    melrose: { west: { near: LAWN, nearD: 6, water: true, d: 2100, dl: 2600, dr: 1700, th: 19, town: 0, marsh: 160, swamp: 1, lake: 0.3, camH: 0.003 },
               east: { land: true, near: LAWN, nearD: 28, far: LAWN, d: 70, th: 21, town: 0, camH: 0.0017 },
               front: { west: { near: LAWN, nearD: 6, water: true, d: 2100, dl: 2600, dr: 1700, th: 19, town: 0, marsh: 160, swamp: 1, lake: 0.3, camH: 0.003 },
                        east: { land: true, near: LAWN, nearD: 28, far: LAWN, d: 70, th: 21, town: 0, camH: 0.0017 } } },
    // d28f Grandview (Sean): facing west = the back of the beach, then wide Grandview Preserve / Back River marsh cut by tidal creeks,
    // to a distant low ragged tree line ~2.6 km out, no buildings. East (the open Chesapeake Bay) keeps the generic/surveyed view.
    grandview: { west: { near: MARSH, nearD: 2450, water: true, d: 2600, dl: 3000, dr: 2300, th: 18, town: 0, marsh: 1, swamp: 1, lake: 0.05, camH: 0.0019 }, front: { west: { near: MARSH, nearD: 2450, water: true, d: 2600, dl: 3000, dr: 2300, th: 18, town: 0, marsh: 1, swamp: 1, lake: 0.05, camH: 0.0019 } } },
  };
  // d28v (VA / NC / FL only — other regions keep the d23 generic facade): regional architecture + native trees (research: /workspace/research/regional_architecture.md) — [house style, tree species, tower share]
  // styles 1 New England shingle/Cape, 2 Tidewater brick colonial & ranch, 3 Outer Banks raised shake on pilings, 4 Lowcountry raised + tin hip roof,
  // 5 Florida stucco + barrel tile, 6 Key West conch, 7 Victorian, 8 urban brick, 9 Gulf raised pastel on stilts.
  // trees 0 eastern hardwood, 1 spruce/fir/white pine, 2 pitch pine + scrub oak, 3 loblolly + sweetgum/oak, 4 live oak + Spanish moss + sabal, 5 palms + sea grape, 6 maritime forest, 7 mangrove
  const REG = {}; const R = (ids, v) => ids.split(" ").forEach(k => { REG[k] = v; });
  R("chincoteague", [3, 3, 0]); R("capecharles", [7, 3, 0]); R("fisherman", [3, 3, 0]);
  R("yorktown jamestown melrose huntington lionsbridge hoffler bennettscreek wickham windmillpt grandview plumtree northlanding backbay capehenry littlecreek", [2, 3, 0]);
  R("oldpoint", [2, 3, 0]);   /* d28za: Fort Monroe — live oaks/loblolly, no palms (Sean) */ R("saltponds oceanview willoughby lesner", [2, 3, 0.15]); R("buckroecoffee", [2, 3, 0]); R("oldpointlight thimbleshoal", [2, 3, 0]); R("roanokemarshes", [3, 6, 0]); R("bodielight hatteraslight", [3, 6, 0]); R("vb1st", [2, 3, 0.95]); R("sandbridge", [3, 6, 0]);
  R("duck jockeys avon buxton ocracoke hatteraslh avalonpier jennettes frisco sturns rodanthe", [3, 6, 0]);
  R("wrightsville sunsetbeach", [9, 4, 0.1]); R("fernandina", [7, 4, 0]);
  R("jaxpier", [5, 5, 0.45]); R("newsmyrna", [5, 5, 0.3]); R("titusville", [5, 5, 0.05]); R("cocoa", [5, 5, 0.3]); R("sebastian", [5, 5, 0]);
  R("laketrail", [5, 5, 0.4]); R("miamibeach", [5, 5, 0.75]); R("keywest", [6, 5, 0]); R("bahiahonda", [6, 7, 0]);
  R("naples siesta", [5, 5, 0.35]); R("clearwater", [5, 5, 0.6]); R("sanibel fortdesoto", [9, 7, 0]); R("cedarkey", [4, 4, 0]);
  R("stgeorge", [9, 3, 0]); R("pcb", [9, 3, 0.75]); R("pensacola", [9, 3, 0.5]);
  try { sessionStorage.removeItem("agHouses"); } catch (e) {}   // d28w: Houses toggle removed — clear any stale "old" choice
  const regOf = id => REG[id] || [0, 0, 0];
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
  // d28zg (Sean): scenery depends only on the FACING DIRECTION, never on the mode — sunrise default (east) == sunset Face East,
  // sunrise Face West == sunset default (west). One source per direction:
  //   east = GEO.front.east ▸ GEO.east ▸ GEO180.set.behind ▸ GEO180.rise.front      west = GEO.front.west ▸ GEO.west ▸ GEO180.set.front (land) ▸ normal horizon
  const G180 = id => (window.GEO180 || {})[id] || {};
  // d28zk: Sean-approved VA/NC audit fixes (Esri + OSM + 3DEP; woods 20 m, houses 9–12 m). East/west by direction only.
  (function () { const O = (id, dir, o) => { const Gi = GEO[id] = GEO[id] || {}; Gi.front = Gi.front || {}; Gi.front[dir] = o; Gi[dir] = o; };
    const OCEAN = { near: SAND, nearD: 40, water: true, d: 0, th: 0, town: 0 };
    O("chincoteague", "east", OCEAN); O("duck", "east", OCEAN); O("ocracoke", "east", OCEAN);   // ocean-beach sunrise: beach + open Atlantic
    O("sunsetbeach", "east", { near: SAND, nearD: 30, water: true, d: 20000, dl: 150, dr: 30000, th: 10, town: 0.6 });   // along a S-facing beach: houses/dunes left, ocean right
    O("wrightsville", "west", { near: SAND, nearD: 20, water: true, d: 350, dl: 300, dr: 400, th: 12, town: 0.7 });   // Banks Channel ~0.3 km, Harbor Island rooftops
    O("yorktown", "west", { near: SAND, nearD: 30, water: true, d: 150, dl: 120, dr: 3000, th: 20, town: 0.3 });   // wooded bluff ahead, York River opening right
    O("littlecreek", "west", { near: SAND, nearD: 30, water: true, d: 250, dl: 200, dr: 15000, th: 10, town: 0.6 });   // beach/dunes + base buildings, bay right
    O("willoughby", "west", { near: SAND, nearD: 20, water: true, d: 6000, dl: 5000, dr: 8000, th: 12, town: 0.3 });   // Hampton Roads water, HRBT/Hampton shore beyond
    O("oldpointlight", "west", { near: SAND, nearD: 8, water: true, d: 1500, dl: 600, dr: 6000, th: 14, town: 0.4 });   // Mill Creek mouth / Hampton Roads
    if (GEO.grandview && GEO.grandview.west) { GEO.grandview.west = Object.assign({}, GEO.grandview.west, { nearD: 700, d: 900, dl: 1200, dr: 800 }); if (GEO.grandview.front) GEO.grandview.front.west = GEO.grandview.west; }   // marsh ~0.7 km, creek, low trees
    O("plumtree", "east", { near: MARSH, nearD: 1000, water: true, d: 0, th: 0, town: 0, lake: 0.3 });   // refuge marsh ~1 km, then open bay
    O("northlanding", "east", { near: SAND, nearD: 12, water: true, d: 300, dl: 200, dr: 300, th: 20, town: 0, lake: 0.3 });   // river ~0.3 km, then 20 m treeline
    // d28zo: single-pin model for former two-vantage spots — east = what is really east of the named spot (Esri/OSM-checked)
    const LANDV = (d0, th, town, near) => ({ land: true, near: near || LAWN, nearD: 25, far: 3, d: d0, th, town, camH: 0.0017 });
    O("westprom", "east", LANDV(80, 12, 0.8)); O("herring", "east", LANDV(60, 6, 0, SAND)); O("menemsha", "east", LANDV(150, 15, 0.2)); O("capemay", "east", LANDV(100, 15, 0.3, SAND));
    O("assateague", "east", LANDV(300, 6, 0.1, MARSH)); O("harbourtown", "east", LANDV(60, 14, 0.6)); O("stsimons", "east", LANDV(60, 12, 0.6)); O("fernandina", "east", LANDV(40, 10, 0.9));
    O("laketrail", "east", LANDV(80, 12, 0.7)); O("miamibeach", "east", LANDV(60, 30, 1));
    O("firstenc", "west", { near: SAND, nearD: 30, water: true, d: 0, th: 0, town: 0 });   // open Cape Cod Bay
    O("tybee", "west", { near: SAND, nearD: 20, water: true, d: 1000, dl: 800, dr: 1500, th: 6, town: 0, marsh: 1 });   // Back River, marsh beyond
    O("titusville", "west", LANDV(60, 12, 0.7)); O("annapolis", "west", LANDV(50, 12, 0.9));   // town behind the waterfront
    O("shemcreek", "west", { near: MARSH, nearD: 600, water: true, d: 4000, dl: 3000, dr: 5000, th: 8, town: 0.6, marsh: 1 });   // marsh, Charleston skyline far
    O("newsmyrna", "west", LANDV(300, 5, 0.1, SAND));   // dunes / park, river hidden
  })();
  function eastO(sp) { const Gi = GEO[sp.id] || {}, F = Gi.front || {}, H = G180(sp.id); return F.east || Gi.east || (H.set && H.set.behind) || (H.rise && H.rise.front) || null; }
  function westO(sp) { const Gi = GEO[sp.id] || {}, F = Gi.front || {}, H = G180(sp.id); return F.west || Gi.west || (H.set && H.set.front && H.set.front.land ? H.set.front : null); }
  const fin = (sp, o) => { o = Object.assign({ reg: regOf(sp.id) }, o); o.water = !o.land; return o; };
  // sp = the app's spot (with .behind = { type, far, water }); rise = sunrise mode (behind = west)
  function behind(sp, rise) {
    const o = rise ? westO(sp) : eastO(sp);
    return fin(sp, o || generic(Object.assign({ type: "Beach", far: "lowshore", water: true }, sp.behind || {})));
  }
  // what you face (null = the usual horizon from the spot's SCENE far/water)
  function front(sp, rise) { const o = rise ? eastO(sp) : westO(sp); return o ? fin(sp, o) : null; }
  g.Ground = { behind, front, GEO, REG };
})(window);
