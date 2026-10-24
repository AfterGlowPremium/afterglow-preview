// Afterglow photoreal sky renderer (WebGL2).
// Physically-based: spherical Earth, Rayleigh + Mie + ozone single scattering (Chapman optical depth, Earth's shadow),
// three cloud decks (cirrus ~9 km, altocumulus ~4.5 km, low ~1.4 km) on curved shells lit by the sunlight that actually
// reaches each cloud point (so cirrus stays lit minutes after the low deck goes grey), aerial perspective, a microfacet
// ocean that reflects the rendered sky with a sun glitter path, filmic tone mapping, lens glare and film grain.
// Every input is a forecast number from the app (HRRR/GOES/METAR-driven where available).
(function (g) {
  const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;

  const FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform vec3 uSun;      // geometric sun direction (local frame, y up, -z = view azimuth)
uniform vec3 uSunA;     // apparent (refracted) sun direction
uniform vec3 uSunC;     // sun direction for lighting cloud decks: lifted by the refraction a grazing ray picks up along its whole path
uniform vec3 uCov;      // high, mid, low cloud fraction 0..1
uniform float uBlock;   // western low-cloud blockage along the sunset line 0..1
uniform float uAod;     // aerosol optical depth (550 nm)
uniform float uRH;      // low-level relative humidity 0..1
uniform float uExpo;
uniform float uWater, uPier, uShore, uHills;
uniform float uCity, uBridge;
uniform vec4 uGnd;   // d23 ground: x near-ground type (0 none, 1 sand beach, 2 marsh grass, 3 lawn/park), y near depth m, z far-ground type (land views), w 1 = land-only view
uniform vec4 uFS;    // d23 lit shoreline/land facade: x distance m (0 = open water), y tree height m, z house fraction 0..1, w dune fraction 0..1
uniform vec4 uFSv;   // d23: x distance at the left edge (m), y at the right edge, z/w azimuth range (rad) where the shore exists
uniform float uCamH;    // camera height km
uniform float uPitch, uFov;
uniform vec2 uSeed;
uniform float uWind;    // upper wind direction (rad) – cloud streak orientation
uniform float uLQ;      // 1 = low quality (dragging)
uniform float uGrainT;
uniform float uDog;
uniform float uMeter;
uniform float uPixScale;
uniform float uTwi;
uniform float uMidH;    // mid-deck base km (HRRR cloud base / GOES cloud-top height), default 4.5
uniform float uBlockGap; // 0..1 clear slot on the far horizon toward the sun (from the 120/200 km path forecast)
uniform float uChop;    // water surface roughness from forecast wind/gusts: 0 glassy mirror .. 1 rough
uniform float uSwell;   // swell / wave height 0..1 (marine forecast, exposure-weighted)
uniform float uCaps;    // whitecap coverage 0..1
uniform float uPhase;
uniform float uSurf;    // DRAFT: breaking-wave face height (m) for surf spots, 0 = off
uniform float uOff;     // DRAFT: offshore wind 0..1 (grooms faces, spray blown back off the lips)
uniform float uSurfT;   // DRAFT: wave clock (s)
uniform float uSurfL; uniform float uSwAng;   // d19: swell crest angle vs the view (rad, + = swell from the right)
uniform vec3 uTint; uniform float uBack;   // DRAFT: dials from looks.js — water tint, backlight scale
uniform float uGlow; uniform float uUnder; uniform float uTops;   // d17 afterglow regimes
uniform vec3 uOvcT;   // d22: overcast diffuse tint (time of day; JS)
uniform float uFast; uniform float uGray; uniform float uHero; uniform float uHeroD; uniform float uMess; uniform float uFaceK;   // d23w: breaking face = uFaceK x Hs (1.0 wind swell .. 1.3 long-period groundswell)
   // v17: uMess 0 clean … 1 blown-out onshore crumbler
    // DRAFT: 1 = hero curling barrel wave (own shape) at uHeroD metres   // DRAFT: breaker spacing (m)   // wave motion phase (advances with the slider / Play)

const float PI = 3.14159265;
const float R0 = 6360.0;
const float RT = 6420.0;
const float HR = 8.0;
const float HM = 1.2;
const vec3 BR = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const vec3 BO = vec3(0.650e-3, 1.881e-3, 0.085e-3);
const float ESUN = 22.0;
float BMs, BMe;
float gGnd = 0.;   // d23: 1 on lit ground/shore pixels (keeps some colour under overcast, like the real marsh grass)

// ---------- noise ----------
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*f*(f*(f*6.-15.)+10.);
  float a = h12(i), b = h12(i+vec2(1,0)), c = h12(i+vec2(0,1)), d = h12(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y); }
// band-limited fbm: octaves finer than the pixel footprint fade out (no sparkle near the horizon)
float fbm(vec2 p, float fp, int oct){
  float s = 0., a = .5, w = 0., l = 1.;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 8; i++){
    if (i >= oct) break;
    float k = 1. - smoothstep(.25, .6, fp / l);
    s += a * k * vn(p) + a * (1. - k) * .5; w += a;
    p = m * p + 3.1; a *= .5; l *= .5;
  }
  return s / w;
}
// d24x: discrete fair-weather cumulus — a share of cells (≈ cover) each holds one puff, so 5–25 % cover draws separate small clouds
float cuPuffs(vec2 p, float cov){ vec2 i = floor(p), f = fract(p); float best = 0.;
  for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++){ vec2 g = vec2(x,y), c = i + g, h = h22(c + 7.31);
    if (h.x < cov * 1.35){ vec2 r = g + .25 + .5*h22(c) - f; float rad = .2 + .22*h.y; best = max(best, 1. - smoothstep(rad*.4, rad, length(r*vec2(1., 1.6) + vec2(0., .12)))); } }
  return best; }
float worley(vec2 p){ vec2 i = floor(p), f = fract(p); float d = 9.;
  for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++){ vec2 g = vec2(x,y); vec2 r = g + .15 + .7*h22(i+g) - f; d = min(d, dot(r,r)); }
  return sqrt(d); }

// ---------- atmosphere ----------
float chapman(float X, float h, float mu){
  float c = sqrt(X + h);
  if (mu >= 0.) return c / (c*mu + 1.) * exp(-h);
  float x0 = sqrt(1. - mu*mu) * (X + h); float c0 = sqrt(x0);
  return 2.*c0*exp(X - x0) - c/(1. - c*mu)*exp(-h);
}
vec2 sph(vec3 ro, vec3 rd, float r){ float b = dot(ro,rd), c = dot(ro,ro) - r*r, d = b*b - c; if (d < 0.) return vec2(-1.); d = sqrt(d); return vec2(-b-d, -b+d); }
float ozoneLen(vec3 p, vec3 d){
  vec2 a = sph(p, d, R0+35.), b = sph(p, d, R0+15.);
  float la = max(a.y, 0.) - max(a.x, 0.);
  float lb = b.x < -.5 && b.y < -.5 ? 0. : max(b.y, 0.) - max(b.x, 0.);
  return max(la - lb, 0.) * .5;   // tent profile ~ half of the shell path
}
// sunlight transmittance from world point p (Earth-centred) toward sun
vec3 sunT(vec3 p, vec3 s){
  float r = length(p); float mu = dot(p, s) / r; float h = max(r - R0, 0.);
  float sh = 1.;
  if (mu < 0.){
    // Earth's shadow, softened by refraction (~0.6°) and multiple scattering: below the geometric tangent we keep the
    // grazing-ray colour and fade it out over a few km of tangent depth
    float hmin = r*sqrt(1.-mu*mu) - R0;
    if (hmin < -6.) return vec3(0.);
    sh = smoothstep(-6., .5, hmin); sh *= sh;
    if (hmin < .05) mu = -sqrt(max(0., 1. - (R0+.05)*(R0+.05)/(r*r)));
  }
  float tr = HR * chapman(R0/HR, h/HR, mu);
  float tm = HM * chapman(R0/HM, h/HM, mu);
  vec3 tau = BR*tr + BMe*tm + BO*ozoneLen(p, s);
  return exp(-min(tau, vec3(60.))) * sh;
}
float phR(float c){ return 3./(16.*PI)*(1.+c*c); }
float phHG(float c, float g){ float g2 = g*g; return (1.-g2)/(4.*PI*pow(1.+g2-2.*g*c, 1.5)); }

struct Acc { vec3 L; vec3 T; };
void seg(inout Acc A, vec3 ro, vec3 rd, float t0, float t1, int n, float cs){
  float pr = phR(cs), pm = mix(phHG(cs, .82), phHG(cs, .2), .25);
  for (int i = 0; i < 12; i++){
    if (i >= n) break;
    float a = (float(i)+.5)/float(n);
    float ta = t0 + (t1-t0)*a, dt = (t1-t0)/float(n);
    vec3 p = ro + rd*ta; float h = length(p) - R0;
    float dR = exp(-h/HR), dM = exp(-h/HM), dO = max(0., 1.-abs(h-25.)/15.);
    vec3 ext = BR*dR + BMe*dM + BO*dO;
    vec3 Ts = sunT(p, uSun);
    vec3 S = Ts * (BR*dR*pr + BMs*dM*pm) * ESUN;
    // crude multiple-scattering fill (keeps blue hour from going black)
    S += ESUN * (BR*dR) * .045 * sunT(p + normalize(p)*20., uSun) ;
    if (uGray > 0.){   // d22: air under a solid deck gets no direct beam (no glare blob toward the sun), only soft diffuse light from the cloud base
      float below = uGray * (1. - smoothstep(1.2, 1.9, h)), muA = uSun.y;
      vec3 Sd = ESUN * (BR*dR + BMs*dM) * .08 * (max(muA, 0.) * .55 + .05 * smoothstep(-.11, .03, muA)) * .8;
      S = mix(S, Sd, below); }
    vec3 Te = exp(-ext*dt);
    A.L += A.T * S * (1. - Te) / max(ext, vec3(1e-6));
    A.T *= Te;
  }
}

// ---------- clouds ----------
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c,-s,s,c); }
float dens(int L, vec2 p, float fp, float dist){
  p += uSeed * (float(L)+1.);
  if (L == 0){ // cirrus / cirrostratus
    float cov = uCov.x;
    vec2 q = rot(uWind) * p;
    float warp = fbm(q*.03, fp*.03, 3);
    vec2 s = vec2(q.x*.03, q.y*.09) + warp*1.9;
    float n = fbm(s, fp*.12, 6);
    float macro = fbm(q*.006 + 7., fp*.006, 3);
    float fib = fbm(vec2(q.x*.07, q.y*.45) + warp*2.5, fp*.45, 5);
    float thr = mix(.82, .18, cov) + (.5-macro)*.35;
    float d = smoothstep(thr, thr + .22, n*.7 + fib*.3 + (macro-.5)*.2);
    float hair = fbm(vec2(q.x*.05, q.y*1.4) + warp*3. + n*2., fp*1.4, 4);
    d *= (.45 + .7*fib) * (.62 + .55*smoothstep(.2,.85,hair));
    d *= .8 + .4*fbm(q*.05 + 21., fp*.05, 4);   // patchy thickness, not uniform brush strokes
    float veil = smoothstep(.45, .95, cov) * (.5 + .4*n);
    return clamp(max(d, veil), 0., 1.);
  } else if (L == 1){ // altocumulus
    float cov = uCov.y;
    vec2 q = rot(uWind + .4) * p;
    float macro = fbm(q*.025, fp*.025, 4);
    float thr = mix(.86, .30, cov) - smoothstep(.6, 1., cov) * .45;   // high cover: no clear holes in the macro field
    float m = smoothstep(thr, thr+.14, macro);
    vec2 c = vec2(q.x*.8, q.y*1.25) / .5;
    vec2 wq = vec2(fbm(q*.8, fp*.8, 4), fbm(q*.8 + 5.2, fp*.8, 4));
    float w = worley(c + wq*1.6) * .65 + worley(c*2.3 + wq*2.5 + 3.) * .35;
    float puff = 1. - smoothstep(.08, .85, w);
    float det = fbm(q*5.0, fp*5.0, 5);
    float fpp = smoothstep(.12, .7, fp); // far away the cells blur into a sheet
    puff = mix(puff, .45, fpp);
    float cells = clamp((m * puff * 1.5 - (1. - det) * .55) * 1.2, 0., 1.);
    // forecast says the deck is (near) solid: altostratus sheet with soft undulations, cells only as texture on top
    float sheetW = smoothstep(.45, .85, cov);   // d24t: matches the label (altostratus from 50% mid cover)
    // thin, translucent fill between the cells (so gaps glow instead of showing open sky) + slow undulation rolls
    float roll = .5 + .5*sin(dot(q, vec2(.9, .25)) * .55 + fbm(q*.2, fp*.2, 3)*5.);
    float sheet = (.12 + .30*fbm(q*.12 + 4., fp*.12, 5) + .12*roll) * (.75 + .25*det);
    return clamp(max(cells, sheet * sheetW), 0., 1.);
  } else { // low: cumulus / stratocumulus + western bank
    float cov = uCov.z;
    cov = mix(cov, max(cov, uBlock*1.05), smoothstep(30., 150., dist));
    vec2 q = rot(uWind*.5) * p;
    float n = fbm(q*.16, fp*.16, 6);
    float b = fbm(q*.6 + n*2., fp*.6, 4);
    float v = n*.7 + b*.3;
    float thr = mix(.80, .20, cov);
    float d = smoothstep(thr, thr + .28, v);
    float er = fbm(q*2.2 + 9., fp*2.2, 5);
    float lo = clamp(d * 1.1 - (1. - er) * .55 * (1. - d*.6), 0., 1.);
    float sheetW = smoothstep(.6, .95, cov);   // overcast stratus / stratocumulus
    float cu = cuPuffs(q*.45 + vec2(n, b)*.5, cov) * smoothstep(.0, .04, cov) * (1. - smoothstep(.45, .75, cov));
    cu = clamp(cu * (.75 + .5*er) - (1. - er) * .35 * (1. - cu), 0., 1.);
    lo = max(lo, cu);
    float shv = mix(.25 + .45*b, .12 + .8*smoothstep(.3, .78, v*.6 + b*.4), .8*uGray);   // d22: overcast deck keeps stratocumulus cells (texture/depth), not a flat sheet
    return clamp(max(lo, shv * (.7 + .3*er) * sheetW), 0., 1.);
  }
}
vec3 layerH(int L){ return L == 0 ? vec3(max(9.0, uMidH + 1.5), 1.0, 1.0) : L == 1 ? vec3(uMidH, .45, 7.0) : vec3(1.4, .6, 18.0); } // alt, thickness, tau scale

vec3 cloudShade(int L, vec3 P, vec3 rd, float t, float pixA, out float alpha){
  vec3 lh = layerH(L);
  vec3 up = normalize(P);
  float cosv = max(dot(up, rd), .015);
  float fp = t * pixA / cosv;              // pixel footprint in km on the layer
  vec2 xz = P.xz;
  float d = dens(L, xz, fp, t);
  if (d < .003){ alpha = 0.; return vec3(0.); }
  float tauV = d * lh.z * min(1./cosv, 12.);
  alpha = 1. - exp(-tauV);
  vec3 sun = uSunC;
  float mu = dot(up, sun);
  vec2 sh = normalize(sun.xz + 1e-5);
  // light path through the deck toward the sun
  float d1 = dens(L, xz + sh*lh.y*1.2, fp*1.5, t), d2 = dens(L, xz + sh*lh.y*3.5, fp*2., t);
  float side = (d1*.6 + d2*.4);
  float above = clamp(mu * 6., 0., 1.);      // sun above the deck -> bases in shadow
  float tauS = lh.z * (side*.55*(1.-above) + d*above*1.2);
  float shadow = exp(-tauS) ;
  float ms = .35 * exp(-tauS*.25);          // multiple scattering keeps cores glowing
  vec3 Ts = sunT(P + up*lh.y*.5, sun);
  float bEff = uBlock * (1. - .6 * uBlockGap);   // d17: an open slot on the horizon lets light under the deck
  float lightIn = L == 2 ? 1. - .55*bEff : 1. - .9*bEff*bEff;
  float cs = dot(rd, sun);
  float ph = mix(phHG(cs, .65), phHG(cs, -.1), .45) ;
  float fwd = mix(1., .35, clamp(tauV*.25, 0., 1.)); // thick cores block the forward lobe
  vec3 direct = ESUN * Ts * lightIn * (ph*fwd*4.*PI*.12 + .05) * (shadow + ms) ;
  // d17: (a) under-lit deck bases when the sun is below the deck and the horizon is open; (b) broken deck → lit edges/tops, higher layers lit from below
  direct *= uGlow * (1. + uUnder * 1.2 * (1. - above) * (L < 2 ? 1. : .5) + uTops * (L >= 1 ? .7 : .3));
  // ambient: blue skylight from above + warm horizon light
  vec3 hA = sunT(P + up*2.5, sun), hB = sunT(P + up*12., sun);
  float skyLit = dot(hA, vec3(.25,.45,.3))*.75 + dot(hB, vec3(.25,.45,.3))*.25;
  vec3 amb = ESUN * (vec3(.007,.013,.028) * (skyLit + .012) + .005*hA*vec3(1.,.75,.65));
  amb *= mix(1., .45, d);
  // once the deck is in Earth's shadow it is lit only by the dim twilight sky: let it sit just below the sky, not glow
  amb *= mix(L == 0 ? .6 : .8, 1., clamp(dot(Ts, vec3(.33)) * 25., 0., 1.));
  // internal texture: thin edges glow (silver lining), thick cores go darker when back-lit
  float tex = L == 0 ? (.8 + .4*fbm(xz*.08 + 3., fp*.08, 4)) : (.55 + .9*fbm(xz*(L == 1 ? 5. : 1.3) + 17., fp*(L == 1 ? 5. : 1.3), 5));
  float rim = (1. - smoothstep(.0, .55, d)) * smoothstep(.2, 1., cs) * 2.5 * (1. + .8 * uTops);
  // d22: overcast diffuse light. Under a solid deck the sun still lights the cloud from above and that light diffuses
  // through: bases glow a soft silver-gray, thin parts between the cells luminous, thick cores darker blue-gray. No beam, no glow colour.
  vec3 ovl = vec3(0.);
  if (uGray > 0.){
    float muT = dot(up, uSun);
    float dayL = max(muT, 0.) * .55 + .05 * smoothstep(-.11, .03, muT);   // light on the deck top, fades out through civil twilight
    float thin = mix(exp(-d * lh.z * (L == 2 ? .26 : .14)), .42, smoothstep(140., 500., t));   // far deck → even, luminous horizon
    ovl = ESUN * vec3(.97, .98, 1.) * dayL * (.05 + 1.7 * thin) * mix(1., tex, .6) * .3 * uGray;
  }
  return (direct * (tex + rim) + amb * mix(1., tex, .6)) * (L == 0 ? 1.15 : 1.) + ovl;
}

// radiance of the sky + clouds along a ray from camera
vec3 skyRay(vec3 ro, vec3 rd, float pixA, bool full, out vec3 Tout){
  Acc A; A.L = vec3(0.); A.T = vec3(1.);
  float cs = dot(rd, uSun);
  vec2 top = sph(ro, rd, RT);
  float tEnd = top.y;
  float tc[3]; tc[2] = sph(ro, rd, R0 + 1.4).y; tc[1] = sph(ro, rd, R0 + uMidH).y; tc[0] = sph(ro, rd, R0 + layerH(0).x).y;
  int ns = full ? 7 : 4;
  float prev = 0.;
  for (int k = 2; k >= 0; k--){
    float tk = tc[k];
    seg(A, ro, rd, prev, tk, ns, cs);
    prev = tk;
    float cov = k == 0 ? uCov.x : k == 1 ? uCov.y : max(uCov.z, uBlock);
    if (cov > .02 && tk < 1400.){
      float al; vec3 c = cloudShade(k, ro + rd*tk, rd, tk, pixA, al);
      float far = smoothstep(260., 620., tk);
      al = mix(al, cov * .92 * mix(1., .55, uBlockGap), far);
      A.L += A.T * c * al; A.T *= 1. - al;
    }
  }
  seg(A, ro, rd, prev, tEnd, full ? 5 : 3, cs);
  Tout = A.T;
  return A.L;
}

// fraction of sunlight that gets through the clouds along the sun's line of sight
float cloudTowardSun(vec3 ro, vec3 rd){
  float T = 1.;
  for (int k = 2; k >= 0; k--){
    float cov = k == 0 ? uCov.x : k == 1 ? uCov.y : max(uCov.z, uBlock);
    if (cov < .02) continue;
    float a = R0 + layerH(k).x;
    float t = sph(ro, rd, a).y;
    vec3 P = ro + rd*t;
    float cosv = max(dot(normalize(P), rd), .015);
    float d = dens(k, P.xz, t*.004/cosv, t);
    T *= exp(-d * layerH(k).z * min(1./cosv, 12.) * (1. - smoothstep(380., 640., t)));
  }
  return T;
}

// --- foreground: pier silhouette ---
float pierHit(vec3 ro, vec3 rd, out float tp){
  // local metres, camera at origin; deck from z=-6 to -420, x in [-24,-19], deck top y = +1.2 (above eye-water: eye at +2.0 over water)
  tp = 1e9; float hit = 0.;
  // DRAFT: deck raised to Jennette's real scale (~6.5 m above the water) so a 6 ft face sits about a third of the way up the pilings
  vec3 bmin = vec3(-24., 3.6, -420.), bmax = vec3(-19., 4.5, -6.);
  vec3 inv = 1./rd; vec3 t0 = (bmin - ro)*inv, t1 = (bmax - ro)*inv;
  vec3 tn = min(t0,t1), tf = max(t0,t1); float a = max(max(tn.x,tn.y),tn.z), b = min(min(tf.x,tf.y),tf.z);
  if (b > max(a,0.)){ tp = a; hit = 1.; }
  // pilings (two rows) and railing posts in the planes x=-23.6 / -19.4
  for (int k = 0; k < 2; k++){
    float px = k == 0 ? -19.4 : -23.6;
    float t = (px - ro.x) / rd.x; if (t <= 0. || t > tp) continue;
    vec3 q = ro + rd*t;
    if (q.z < -420. || q.z > -6.) continue;
    float fz = abs(fract(q.z/6.) - .5)*6.;
    float w = .22 + t*.0012;
    if (q.y < bmin.y && q.y > -2. && fz < w){ tp = t; hit = 1.; }
    float fr = abs(fract(q.z/3.) - .5)*3.;
    if (q.y > bmax.y && q.y < bmax.y + 1.05 && (fr < .07 + t*.0006 || abs(q.y - (bmax.y+1.)) < .06 + t*.0005 || abs(q.y - (bmax.y+.5)) < .03 + t*.0004)){ tp = t; hit = 1.; }
  }
  { vec3 hmin = vec3(-25., 4.5, -418.), hmax = vec3(-18., 8.5, -400.); vec3 a0 = (hmin - ro)*inv, a1 = (hmax - ro)*inv; vec3 n0 = min(a0,a1), f0 = max(a0,a1);   // end house
    float ha = max(max(n0.x,n0.y),n0.z), hb = min(min(f0.x,f0.y),f0.z); if (hb > max(ha,0.) && ha < tp){ tp = ha; hit = 1.; } }
  { float t = (-21.5 - ro.x) / rd.x; if (t > 0. && t < tp){ vec3 q = ro + rd*t; if (abs(q.z + 300.) < .5 + t*.0008 && q.y > 4.5 && q.y < 42.){ tp = t; hit = 1.; } } }   // wind-turbine pole
  return hit;
}


// ---------- DRAFT: shoaling / breaking surf heightfield (metres, camera-local: x right, -z out to sea) ----------
float surfPeel(vec2 p){ float px0 = mod(uSurfT * 4.5, 150.) - 75.; return clamp((px0 - p.x) / 8., -1., 1.); }   // >0 broken (whitewater), ~0 the curl, <0 open shoulder
float gSwC = 1., gSwS = 0.;
float surfX(vec2 p){ float d = -p.y * gSwC + p.x * gSwS; return fract((d + uSurfT * 6.5) / uSurfL + .09 * sin(p.x * .021 + uSeed.x) + .05 * sin(p.x * .057)); }
float surfEnv(vec2 p){ float d = -p.y; return (uHero > .5 ? smoothstep(uHeroD + 10., uHeroD + 30., d) : 1.) * smoothstep(1., 12., d) * (1. - smoothstep(140., 320., d)); }
float surfSec(vec2 p){ return clamp(.62 + .38 * sin(p.x * .027 + uSeed.y) * sin(p.x * .011 + 1.7) + .15 * sin(p.x * .09), .25, 1.); }
float surfH(vec2 p){
  float env = surfEnv(p); if (env <= 0.) return 0.;
  float d = -p.y, x = surfX(p), sec = surfSec(p);
  float brk = smoothstep(110., 40., d) * sec * smoothstep(.35, 1.7, uSurf);   // closer in = steeper, about to pitch
  float fw = mix(.1, mix(.06, .022, clamp(uOff + 1. - uChop, 0., 1.)), brk);                                    // face width as a fraction of the spacing
  float back = pow(1. - smoothstep(0., .78, x), 1.7);
  float face = pow(smoothstep(1. - fw, 1., x), 1.1 + 2.2 * brk);
  float h = max(back, face);
  float H = uSurf * env * sec * mix(.5, 1.1, smoothstep(160., 45., d)) * mix(1., .45, smoothstep(30., 8., d));
  float groom = (fbm(vec2(p.x * .08, d * .9), 0., 3) - .5) * mix(.25, .06, uOff) * (.3 + .7 * uChop);  // offshore grooms, onshore roughens
  return (h - .32) * H + groom * min(H, 1.);
}

// ---------- DRAFT: hero breaking wave as its own shape (2D cross-section swept along the wave line) ----------
// peel front moves right-to-left; right of it = exploded whitewater, at it = barrel (lip thrown over a hollow), left = steep open shoulder
float heroPX(){ return -mod(uSurfT * 3.75, 15.); }   // 4 s period; rel is wrapped so the loop is seamless   // crosses the view right→left in ~4 s
float gFoamD = 1e3;
// d19: big surf — the hero wave is modelled in a normalised space (K = face / 5 ft) so its shape, lip thickness, foam volume and
// ray-march budget stay those of a well-behaved 5 ft wave; real size = K x that (10 ft = 2x, 15 ft = 3x). 2-5 ft: K = 1, unchanged.
float gK = 1., gSurf = 0., gHD = 26.;
// v17: inside soup (broken whitewater rolling toward the beach) as a foam layer painted on the water surface — no hard-edged slabs
float soupAmt(vec2 xz){
  if (uMess < .01 || uHero < .5) return 0.;
  float cz = xz.y + gHD, xr = xz.x * .927 + cz * .375, zr = -xz.x * .375 + cz * .927 - gHD;
  float H = gSurf * 1.4, s = zr + gHD + .003 * xr * xr, dz = s - .4 * H;
  float lines = .5 + .5 * sin(dz * (1.1 - .25 * uMess) - uSurfT * 1.55 + fbm(vec2(xr * .07, 3.), 0., 2) * 3.);
  float fb = fbm(vec2(xr * .35 - uSurfT * .2, dz * .45 - uSurfT * .5), 0., 4);
  float pat = smoothstep(.4, .72, fb) * smoothstep(.4, .95, lines) + .45 * smoothstep(.6, .8, fb) * (1. - smoothstep(.4, .95, lines));
  float band = smoothstep(.0, 1.5, dz) * (1. - smoothstep(gHD - 4., gHD + 2., dz));
  return clamp(pat * band * uMess * 1.6 * smoothstep(.25, .55, uChop), 0., 1.);
}   // foam distance from the last heroSDF call (foam is volumetric, not a surface)
// d21 barrel: from ~3 ft up the tube is a pocket in FRONT of the crest (its back wall is the solid face, nothing to see through)
// and the lip is a thick poured sheet with a rounded edge; 2 ft keeps the v17 geometry
float tubeB(){ return smoothstep(.6, 1.6, uSurf); }
vec2 heroC(float Hh){ return mix(vec2(.18, .5), vec2(.38, .55), tubeB()) * Hh; }
float heroLR(float Hh){ return mix(.5, .59, tubeB()) * Hh; }   /* d21b: lip circle passes through the crest */
float heroR(float Hh){ return mix(.5, .37, tubeB()) * Hh; }
float heroSDF(vec3 p, float camM, out float mat, out vec4 info){
  { float cz = p.z + gHD; p = vec3(p.x * .927 + cz * .375, p.y, -p.x * .375 + cz * .927 - gHD); }   // ~22° down-the-line view
  // 2D profile swept along the crest. Phase from distance to the peel point (rel<0 = unbroken, peel moves right→left):
  // round swell → steep concave wall → lip pitches past vertical → tube → impact/foam → soup
  float H = gSurf * max(uFaceK, 1.) * .88, D = gHD + .003 * p.x * p.x;   // d23w: face = 1.0–1.3 x Hs (was a flat 1.4 x, and the camera crept closer to small surf); x .88 because the thrown lip/tube rides ~12% above Hh, so the visible crest-to-trough lands on 1.0–1.3 x Hs   // v17: face height calibrated to forecast (1.4 × forecast face height: 2 ft ≈ waist, 4 ft ≈ head high, 6 ft ≈ overhead; no figure drawn)
  float s = p.z + D, y = p.y + camM, rel = (mod(p.x * .927 + (p.z + gHD) * .375 - heroPX() + 9., 15.) - 9.) * 1.7;   // phases compressed so the whole sequence fits the view
  float offOK = smoothstep(.15, .45, uOff + .25) * (1. - smoothstep(.05, .35, uMess));   // v17: onshore → no lip throw / no tube
  float steep = smoothstep(-13., -4., rel) * (1. - smoothstep(2., 9., rel));                       // 0 round … 1 vertical wall
  float pitch = smoothstep(-4.5, 0., rel) * offOK;                 // lip throw 0 … 1 (lands at the peel)
  float broke = smoothstep(-.2 - 5. * uMess, 1.5 - 1.5 * uMess, rel);   // onshore: crest crumbles early, well before the peel
  float Hh = H * (.45 + .55 * smoothstep(-15., -6., rel)) * (1. - .55 * smoothstep(0., 7., rel));
  float wf = mix(1.5, mix(.38, .85, uMess), steep) * Hh + .05, wb = 1.9 * Hh + .4;  // front / back half-widths (onshore: mushier, less steep face)
  float top = Hh * exp(-pow(s / (s > 0. ? wf : wb), 2.));
  if (uMess > .01){ float ch = fbm(vec2(p.x * .9 + uSurfT * .5, s * 1.3 - uSurfT * .9), 0., 4) - .5;   // wind chop + lumps on the face/back
    float env = clamp(top / max(Hh, .1) * 4., 0., 1.);   // chop rides on the wave only (no stray slabs on the flat water)
    top = top * (1. - .18 * uMess * smoothstep(-2., 2., rel)) + (ch * uMess * (.06 + .08 * Hh) + (fbm(vec2(p.x * 3.1, s * 3.4 + uSurfT * 1.3), 0., 3) - .5) * .05 * uMess) * env; }
  float dB = (y - top) * .6;
  dB = max(dB, .02 - y);
  // hollow tube: carve a disc in front, below the crest
  vec2 q = vec2(s, y), c = heroC(Hh); float r = heroR(Hh);
  float carve = pitch * (1. - broke);
  if (carve > .02) dB = max(dB, -(length(q - c) - r * (.55 + .45 * carve)));
  // lip: annulus arc from the back of the crest round past vertical; tip angle falls with pitch
  float dL = 1e3;
  if (pitch > .02 && broke < .95){
    float tb = tubeB(); r = mix(r, heroLR(Hh), tb); float a0 = mix(3.0, 2.27, tb); float a1 = mix(mix(1.5, -1.25, pitch), mix(1.1, -1.05, pitch), tb);
    float rag = fbm(vec2(p.x * .9, uSurfT * .7), 0., 3);   // d20: lower-frequency ragged throw (was 2.3 → ribbed stripes)
    a1 += (rag - .5) * .25 * pitch;                                     // ragged, uneven throw along the crest
    float ang = atan(q.y - c.y, q.x - c.x); float u = clamp((a0 - ang) / max(a0 - a1, .1), 0., 1.);
    float th = mix((mix(.06, .008, u) * Hh + .008) * (1. - broke) * (.85 + .3 * rag), mix(.12, .05, u) * Hh * (1. - .75 * broke) * (.9 + .2 * rag) * smoothstep(.08, .5, pitch), tb);   // thin sheet, feathered tip → (3 ft+) thick poured lip, rounded end cap
    vec2 tip = c + r * vec2(cos(a1), sin(a1));
    dL = (ang < a0 && ang > a1) ? abs(length(q - c) - r) - th : length(q - tip) - th;
  }
  // impact explosion right at the peel + soup behind it
  float ff = smoothstep(-.2, .8, rel) * (1. - smoothstep(3., 6., rel));
  float dF = 1e3;
  if (ff > .02){ float nz = fbm(vec2(p.x * .9 - uSurfT * 1.4, y * 1.5 + s * .6), 0., 3);
    float boom = smoothstep(-.6, .8, rel) * (1. - smoothstep(1.5, 5., rel));
    float nz2 = fbm(vec2(p.x * 5.3 + s * 3.1, y * 6.2 - uSurfT * 3.), 0., 4);
    vec2 bc = vec2(s - (.35 + .5 * boom) * H, y - (.15 + .35 * boom) * H);
    dF = length(bc * vec2(.7, 1.)) - (.15 + .55 * boom * (1. - .65 * uMess)) * H * (.3 + .7 * nz + .9 * nz2) * ff * (1. - .6 * smoothstep(2.5, 5.5, rel)) * (1. - .35 * uMess) * mix(1., .62, min(1., gK - 1.));   // d19: big surf — keep the lip explosion about wave-height, not a mushroom cloud   // onshore: no lip impact → smaller explosion
  }
  float dSo = 1e3;
  if (uMess > .01){   // v17 crumbler: whitewater spills down the face from the crest, thick soup sections rolling toward the camera
    float cr = smoothstep(-6. * uMess - .5, -1.5 * uMess, rel);                                   // crest crumbles before the peel
    float n1 = fbm(vec2(p.x * 1.3 - uSurfT * .9, y * 1.7 + s * .9 - uSurfT * .6), 0., 4), n2 = fbm(vec2(p.x * 4.1 + s * 2.3, y * 4.7 - uSurfT * 2.2), 0., 3);
    float spillS = mix(.05, .55, smoothstep(-3., 3., rel)) * Hh;                                     // spill reaches farther down the face as it breaks
    vec2 cc = vec2(s - spillS * .55, y - top * mix(.85, .55, smoothstep(-2., 4., rel)));
    float dC = length(cc * vec2(.8 / (1. + spillS), 1.)) - (.07 + .15 * uMess) * Hh * (.45 + .8 * n1 + .5 * n2) * cr * (1. - smoothstep(6., 9., rel));
    // inside soup: 2–3 lines of broken whitewater between the wave and the beach, always present (no popping)
    float dz = s - .4 * H;
    float lines = .5 + .5 * sin(dz * (1.1 - .25 * uMess) - uSurfT * 1.55 + fbm(vec2(p.x * .07, 3.), 0., 2) * 3.);
    float fb = fbm(vec2(p.x * .35 - uSurfT * .2, dz * .45 - uSurfT * .5), 0., 4);
    float pat = smoothstep(.42, .7, fb) * smoothstep(.45, .9, lines) + .5 * smoothstep(.62, .8, fb) * (1. - smoothstep(.45, .9, lines));   // whitewater lines with gaps of open water
    float band = smoothstep(.0, 1.5, dz) * (1. - smoothstep(gHD - 4., gHD - 1., dz));
    float hS = uMess * H * (.06 * pat - .014) * band * smoothstep(.25, .55, uChop);   // inside soup needs wind/chop: small clean offshore days stay clean                 // height field: foam only where pat is high, open water between lines
    float dS = (y - .02 - hS) * .45;
    dF = min(dF, dC);
    // (geometry soup disabled — painted on the water by soupAmt instead)   // no foam → no zero-thickness surface on the open water
  }
  float d = min(min(dB, dL), dSo); mat = dSo < min(dB, dL) ? 2. : dL < dB ? 1. : 0.;   // d13: 6 ft scale figure removed; face height stays calibrated (gSurf * 1.4)
  gFoamD = dF;
  info = vec4(s, y, Hh, pitch * (1. - broke)); return d;
}

vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }


// d23 anti-twilight opposite the sun: pale cream-pink arch before sunset, then the rose Belt of Venus over the blue-gray Earth's
// shadow rising from the horizon as the sun sinks (few-step single scattering otherwise smears it into an orange band). e = elevation above the horizon (rad)
vec3 antiTw(vec3 col, vec3 rd, float e){
  float sEl = asin(clamp(uSun.y, -1., 1.));
  float anti = smoothstep(.15, .85, -dot(normalize(rd.xz + 1e-5), normalize(uSun.xz + 1e-5)));
  float tw = smoothstep(.05, .0, sEl) * smoothstep(-.15, -.085, sEl) * (1. - uGray) * anti;
  if (tw <= 0.) return col;
  float shTop = max(-sEl * .8, 0.) + .002, L = dot(col, vec3(.2126,.7152,.0722));
  float shA = smoothstep(.004, -.02, sEl);                                   // the shadow only exists once the sun is down
  vec3 beltC = L * mix(vec3(1.05, .96, .95), vec3(1.12, .86, .98), smoothstep(.02, -.02, sEl)) * .92;   // dusty rose (Sean's Buckroe palette #c9a3b0)
  vec3 shC = L * vec3(.58, .70, 1.1) * .8;   // Earth's shadow blue-gray (#5e6a86)
  vec3 c = mix(beltC, shC, shA * (1. - smoothstep(shTop - .006, shTop + .01, e)));
  float w = 1. - smoothstep(shTop + .05, shTop + .2, e);
  return mix(col, c, tw * w * .9);
}
// ---------- d23: lit ground + shoreline (180° Turn and land views) ----------
// Lambert surfaces lit by the real sun (Earth-shadowed, cloud-gated transmittance) plus the sky they face; aerial perspective.
float fsDist(float az){ float k = clamp(abs(az) / .6, 0., 1.); return mix(uFS.x, az < 0. ? uFSv.x : uFSv.y, k); }
float fsMask(float az){ return smoothstep(uFSv.z - .05, uFSv.z + .05, az) * (1. - smoothstep(uFSv.w - .05, uFSv.w + .05, az)); }   // shore tapers off into open water
// facade height (m above the water / ground) at shore coordinate x (m along the shore); kind: 0 trees, 1 house, 2 dune
float fsTop(float x, out float kind, out float hv){
  float c = floor(x / 16.), hc = h12(vec2(c, 7.3) + uSeed);
  float house = step(1. - uFS.z, hc) * (1. - uFS.w);
  float fx = fract(x / 16.);
  float hh = (5.5 + 5. * h12(vec2(c, 2.1))) * smoothstep(.06, .12, fx) * (1. - smoothstep(.82, .88, fx));
  float roof = hh > 0. ? hh + 2.2 * (1. - abs(fx - .47) * 2.4) : 0.;   // gable
  float crowns = fbm(vec2(x * .05, 1.3) + uSeed, 0., 4), xw = x + 5. * fbm(vec2(x * .04, 2.2), 0., 3), cx = fract(xw / 6.) - .5, hc2 = h12(vec2(floor(xw / 6.), 1.7));
  float bump = sqrt(max(0., 1. - 4. * cx * cx)) * (.55 + .45 * hc2) + .08 * vn(vec2(x * .35, 4.1));   // individual crowns, softly rounded
  float tree = uFS.y * (.58 + .3 * crowns + .2 * bump) * (1. - uFS.w) * (1. - .55 * house * step(.001, roof));
  float dune = uFS.w * (2.2 + 3.2 * fbm(vec2(x * .02, 9.) + uSeed, 0., 4) + .5 * vn(vec2(x * .9, 3.)));
  float top = max(max(tree, house * roof), dune);
  kind = house * roof >= tree && house > .5 ? 1. : dune > tree ? 2. : 0.; hv = house * hh;
  return top;
}
vec3 landAlb(float kind, vec2 lp, float hv, float fp){
  if (kind > 1.5){ float g = smoothstep(.45, .7, fbm(lp * vec2(.9, 2.6), fp, 4)) * smoothstep(.6, 2.5, lp.y);
    return mix(vec3(.40, .35, .26), vec3(.20, .19, .09), g); }
  if (kind > .5){ float c = floor(lp.x / 16.); vec3 wall = mix(mix(vec3(.62,.60,.56), vec3(.55,.50,.42), h12(vec2(c,3.))), vec3(.42,.50,.58), step(.75, h12(vec2(c,5.))));
    float fx = fract(lp.x / 16.), wy = fract(lp.y / 3.), win = step(.3, fract(fx * 5.)) * step(fract(fx * 5.), .62) * step(.35, wy) * step(wy, .75);
    if (lp.y > hv) return vec3(.07, .065, .06) * (.8 + .4 * vn(lp * vec2(2., 6.)));   // shingle roof
    wall *= (.9 + .1 * step(.5, fract(lp.y * 3.3))) * (1. - .45 * smoothstep(hv - .7, hv, lp.y)) * (.85 + .3 * h12(vec2(c, 9.)));   // lap siding, shadow under the eave, per-house tone
    return mix(wall, vec3(.03, .035, .04), win * .8 * step(.8, lp.y)); }
  float n = fbm(lp * vec2(.12, .15), fp * .12, 4), n2 = vn(lp * vec2(.25, .3));
  vec3 g0 = vec3(.04, .062, .032), g1 = vec3(.075, .095, .047), au = vec3(.115, .088, .05);   // pine/oak green → olive → late-October bronze
  return mix(mix(g0, g1, n), au, smoothstep(.6, .85, n2) * .45);
}
// shade a vertical land facade point seen along rd at distance d (m); lp = (x along shore, y height) m
vec3 shadeFacade(vec3 ro, vec3 rd, float d, vec2 lp, float top, float kind, float hv, float sunVis, vec3 hzS, vec3 amb, float fp){
  vec3 alb = landAlb(kind, lp, hv, fp);
  vec2 rh = normalize(rd.xz + 1e-5), sh = normalize(uSunA.xz + 1e-5);
  float front = max(dot(-rh, sh), 0.), ce = sqrt(max(1. - uSunA.y * uSunA.y, 0.));
  vec3 sunL = ESUN * sunT(ro, uSunA) * sunVis * smoothstep(-.012, .012, uSunA.y) / PI;
  float relief = kind < .5 ? mix(1.08, .5, smoothstep(.2, .9, worley(lp * vec2(.24, .3) + 3. + 1.6 * vec2(fbm(lp * .08, fp * .08, 3), fbm(lp * .08 + 7., fp * .08, 3))))) * mix(.72, 1.12, fbm(lp * vec2(1.1, 1.4), fp * 1.2, 4)) : kind > 1.5 ? mix(.6, 1.1, fbm(lp * vec2(.3, 1.), fp, 3)) : 1.;   // crown bumps / dune ripples catch the light unevenly
  float ao = mix(.45, 1., clamp(lp.y / max(top, 1.), 0., 1.));
  float rim = kind < .5 ? smoothstep(top - 1.6, top, lp.y) * .35 : 0.;   // sunlit crown tops
  vec3 c = alb * (sunL * (front * ce * relief + rim * front) + amb * ao * (kind > .5 && kind < 1.5 ? 1. : mix(.7, 1.05, relief)));
  float fog = 1. - exp(-d * .001 * (BMe * 1.3 + BR.g));
  return mix(c, hzS * .95, clamp(fog, 0., 1.));
}
// ground plane (y = 0) at world xz; type 1 sand, 2 marsh grass, 3 lawn; wet = 0..1 wet sand near the water line
vec3 shadeGround(vec3 ro, vec3 rd, float t, vec2 xz, float type, float sunVis, vec3 amb, vec3 skyR, float fp, float wet){
  vec2 rh = normalize(rd.xz + 1e-5), sh = normalize(uSunA.xz + 1e-5);
  float front = max(dot(-rh, sh), 0.), ce = sqrt(max(1. - uSunA.y * uSunA.y, 0.));
  vec3 sunL = ESUN * sunT(ro, uSunA) * sunVis * smoothstep(-.012, .012, uSunA.y) / PI;
  vec3 alb; float dirT;
  if (type < 1.5){   // sand: grain, wind ripples, footprints; wet sand darker and mirror-like
    float gr = fbm(xz * 9., fp * 9., 3), rip = sin(dot(xz, vec2(.35, 3.1)) + 2. * fbm(xz * .4, fp * .4, 3)) * .5 + .5, fpN = fbm(xz * .9 + 3., fp, 4);
    alb = vec3(.52, .46, .36) * (.8 + .26 * gr + .04 * rip) * mix(1., .78, smoothstep(.55, .75, fpN));
    alb = mix(alb, vec3(.24, .21, .16), wet);
    // micro-relief (wind ripples, footprints, scuffs): a low sun rakes across it, so every bump shows — slope from a height field
    float e = .06; vec2 sd = vec2(0.);
    for (int k = 0; k < 2; k++){ vec2 o2 = k == 0 ? vec2(e, 0.) : vec2(0., e);
      float h0 = fbm(xz * 1.6, fp * 1.6, 4) * .06 + (1. - smoothstep(.0, .3, worley(xz * 1.8 + 11.))) * -.035;
      float h1 = fbm((xz + o2) * 1.6, fp * 1.6, 4) * .06 + (1. - smoothstep(.0, .3, worley((xz + o2) * 1.8 + 11.))) * -.035;
      sd[k] = (h1 - h0) / e; }
    vec3 N = normalize(vec3(-sd.x, 1., -sd.y) + vec3(0., 0., .0));
    float lam = max(dot(N, uSunA), 0.), keep = 1. - smoothstep(.0, 1.2, fp);   // far away the relief averages out
    dirT = mix(max(uSunA.y, 0.) + .05 * front * ce, lam, keep * .5);
    alb *= mix(1., .88 + .24 * smoothstep(-.1, .1, -sd.y * front), keep * .5);
    if (uGnd.w > .5){ float dg = smoothstep(uGnd.y - 12., uGnd.y - 3., t) * smoothstep(.42, .62, fbm(xz * vec2(.9, 1.6), fp, 4));   // dune grass / sea oats at the back of the beach
      alb = mix(alb, mix(vec3(.17, .16, .07), vec3(.30, .25, .12), vn(xz * 3.)), dg); dirT = mix(dirT, front * ce * .5 + max(uSunA.y, 0.) * .5, dg); }
  } else {           // grass: blades are near-vertical, so a low sun facing them lights them (front light) — golden-green tips, darker bases
    float b = fbm(xz * 2.2, fp * 2.2, 5), clump = fbm(xz * .18 + 7., fp * .18, 4);
    float near = 1. - smoothstep(4., 18., t);   // up close, individual blades (screen-space strokes) instead of a smeared texture
    float tip = mix(fbm(xz * 6.5 + 3., fp * 6.5, 3), vn(vec2(gl_FragCoord.x * .45 + floor(xz.y * 3.) * 17., gl_FragCoord.y * .035)), near * .7);
    vec3 green = type < 2.5 ? vec3(.10, .12, .04) : vec3(.07, .11, .04), gold = type < 2.5 ? vec3(.24, .21, .09) : vec3(.15, .15, .06);
    alb = mix(green, gold, smoothstep(.35, .75, tip * .6 + clump * .55)) * (.6 + .6 * b);
    dirT = front * ce * .55 * (.5 + .7 * b) + max(uSunA.y, 0.) * .6;
  }
  vec3 c = alb * (sunL * dirT + amb * (type < 1.5 ? 1. : .85));
  if (type < 1.5) c = mix(c, skyR * (.04 + .5 * pow(1. - abs(rd.y), 5.)), wet * .65);   // wet sand reflects the sky
  float fog = 1. - exp(-t * .001 * (BMe * 1.3 + BR.g));
  return mix(c, amb * .9, clamp(fog, 0., 1.) * .5);
}
void main(){
  gSwC = cos(uSwAng); gSwS = sin(uSwAng);
  gK = max(1., uSurf / 1.524); gSurf = uSurf / gK; gHD = uHeroD / gK;
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - .5*uRes) / uRes.y;
  float th = tan(uFov*.5);
  vec3 rd = normalize(vec3(uv.x*2.*th, uv.y*2.*th, -1.));
  float cp = cos(uPitch), sp = sin(uPitch);
  rd = vec3(rd.x, rd.y*cp + rd.z*(-sp)*-1.*-1., 0.);
  { vec3 d0 = normalize(vec3(uv.x*2.*th, uv.y*2.*th, -1.)); rd = normalize(vec3(d0.x, d0.y*cp - d0.z*sp, d0.y*sp + d0.z*cp)); }
  float pixA = 2.*th / uRes.y / uPixScale;
  BMe = max(uAod, .01) / HM; BMs = BMe * .9;
  vec3 ro = vec3(0., R0 + uCamH, 0.);
  vec3 col; vec3 T;
  float sunVis = cloudTowardSun(ro, uSunA) * (1. - uGray);   // d16: blocked sun → no direct light anywhere (no glints, lit lips, spindrift glow, sun disk)
  vec3 sunAtm; { vec3 tmp; skyRay(ro, uSunA, .004, false, tmp); sunAtm = sunT(ro, uSunA); }

  // horizon geometry
  float dip = -sqrt(2.*uCamH/R0);
  float elevR = asin(clamp(rd.y, -1., 1.));
  // distant shoreline / hills profile in azimuth (radians above horizon)
  float az = atan(rd.x, -rd.z);
  float prof = -1.;
  if (uShore > 0.){
    float n = fbm(vec2(az*40. + uSeed.x, 3.), .0, 5);
    float mask = smoothstep(.15, .45, fbm(vec2(az*3. + uSeed.y, 9.), 0., 3));
    prof = dip + uShore * (.25 + .9*n) * mask * .0175 - .0008;
  }
  if (uHills > 0.){
    float n = fbm(vec2(az*9. + uSeed.x, 1.), 0., 6);
    prof = max(prof, dip + (.004 + n*.022) * uHills);
  }

  // city skyline across the water (blocky buildings in a band of azimuths) and a long low bridge (deck + piers + span)
  if (uCity > 0.){
    float b = floor(az*140. + uSeed.x*7.);
    float hgt = fract(sin(b*12.9898 + uSeed.y)*43758.5453);
    float band = smoothstep(-.42, -.25, az) * (1. - smoothstep(.2, .38, az));
    prof = max(prof, dip + band * (.0015 + pow(hgt, 2.2)*.016) * uCity);
  }
  bool span = false;
  if (uBridge > 0.){
    float inB = step(-.5, az) * step(az, .45);
    float deck = dip + .0042 + .004*exp(-pow((az - .05)/.08, 2.));
    if (inB > .5 && abs(elevR - deck) < .0007) span = true;
    if (inB > .5 && elevR < deck && elevR > dip && fract(az*70.) < .1) span = true;
  }
  float tP; float pier = uPier > 0. ? pierHit(vec3(0.,0.,0.), rd, tP) : 0.;
  // d23: lit shoreline facade + ground plane (beach sand / marsh / lawn) — 180° Turn and land views
  float camM0 = uCamH * 1000.;
  float gT = rd.y < 0. ? camM0 / -rd.y : 1e9;
  float fsD = uFS.x > 0. ? fsDist(az) : 0.;
  float fsK = 0., fsHv = 0., fsTopH = 0.; vec2 fsLP = vec2(0.); bool fsHit = false;
  if (fsD > 1. && gT > fsD){ float yH = camM0 + rd.y * fsD; fsLP = vec2(az * fsD + uSeed.x * 3., yH); fsTopH = fsTop(fsLP.x, fsK, fsHv) * fsMask(az); fsHit = yH < fsTopH; }
  bool gnear = uGnd.x > .5 && rd.y < 0. && gT < uGnd.y && !fsHit;
  bool gfar = uGnd.w > .5 && rd.y < 0. && !fsHit && !gnear;

  if (pier > .5){
    vec3 Tt; vec3 sk = skyRay(ro, normalize(vec3(rd.x, .02, rd.z)), pixA, false, Tt);
    col = sk * .03 + vec3(.0006,.0005,.0008);
  } else if (fsHit || gnear || gfar){
    gGnd = 1.;
    vec3 Ta; vec3 hzS = antiTw(skyRay(ro, normalize(vec3(rd.x, .004, rd.z)), pixA, false, Ta), rd, .004);
    vec2 rh = normalize(rd.xz + 1e-5);
    vec3 Tb; vec3 amb = skyRay(ro, normalize(vec3(-rh.x * .8, .6, -rh.y * .8)), pixA * 4., false, Tb) * .45 + skyRay(ro, vec3(0., 1., 0.), pixA * 4., false, Tb) * .3 + hzS * .35;   // sky irradiance: sun-side sky (not the glare), zenith, horizon   // light from the sky the surface faces (the sun side)
    if (fsHit) col = shadeFacade(ro, rd, fsD, fsLP, fsTopH, fsK, fsHv, sunVis, hzS, amb, fsD * pixA);
    else {
      vec2 xz = (rd * gT).xz; float fpG = gT * pixA / max(-rd.y, .002), typ = gnear ? uGnd.x : uGnd.z;
      float wet = (uWater > .5 && gnear && typ < 1.5) ? smoothstep(uGnd.y * .5, uGnd.y * .97, gT + 1.2 * fbm(xz * .25, fpG * .25, 3)) : 0.;
      vec3 Tr; vec3 skyR = wet > 0. ? skyRay(ro, normalize(vec3(rd.x, -rd.y, rd.z)), pixA * 2., false, Tr) : vec3(0.);
      col = shadeGround(ro, rd, gT, xz, typ, sunVis, amb, skyR, fpG, wet);
      if (uWater > .5 && gnear){   // swash: thin foam lace where the water runs up the sand
        float sw = uGnd.y - 1.1 + .9 * sin(xz.x * .09 + uPhase * 1.7) * .5 + .6 * fbm(xz * vec2(.3, .8), fpG, 3);
        float lace = smoothstep(.45, .7, fbm(xz * vec2(1.2, 3.), fpG * 3., 4)) * smoothstep(sw - .5, sw, gT);
        col = mix(col, vec3(dot(hzS, vec3(.2126,.7152,.0722))) * 1.15, lace * .7);
      }
    }
  } else if (span){
    vec3 Ta; vec3 hzS = skyRay(ro, normalize(vec3(rd.x, dip + .004, rd.z)), pixA, false, Ta);
    col = mix(vec3(.0012,.0011,.0014) * (ESUN*.05), hzS*.45, .35 + .5*clamp(uAod*3.,0.,1.));
    if (uFS.x > 0.){   // d23: concrete bridge lit by the real sun (front-lit when the sun is behind you)
      vec2 rh = normalize(rd.xz + 1e-5), sh = normalize(uSunA.xz + 1e-5);
      vec3 sunL = ESUN * sunT(ro, uSunA) * sunVis * smoothstep(-.012, .012, uSunA.y) / PI;
      vec3 c = vec3(.36, .35, .33) * (sunL * max(dot(-rh, sh), 0.) * .9 + hzS * 1.1);
      col = mix(c, hzS * .95, clamp(1. - exp(-1.2 * (BMe * 1.3 + BR.g)), 0., 1.)); }
  } else if (elevR > prof && elevR > dip + .0002){
    col = skyRay(ro, rd, pixA, uLQ < .5, T);
    // sun disc (limb darkened, flattened by refraction near the horizon)
    vec3 sa = uSunA;
    float sel = asin(sa.y);
    vec3 dd = rd - sa;
    float sq = 1. + .25*smoothstep(.03, 0., sel);
    float ang = length(vec2(dot(dd, normalize(cross(sa, vec3(0,1,0)))), dot(dd, vec3(0,1,0))*sq));
    float disc = (1. - smoothstep(.0044, .0049, ang)) * step(0., dot(rd, sa));   // only toward the sun (fixes mirrored dot)
    float limb = .45 + .55*sqrt(max(0., 1. - (ang/.0047)*(ang/.0047)));
    col += T * disc * limb * ESUN * 9000.;
    col = antiTw(col, rd, elevR - dip);
    // sun dogs (parhelia) ~22° either side of a low sun, in thin ice cloud
    if (uDog > .01){
      float se = asin(clamp(sa.y,-1.,1.));
      float daz = atan(rd.x, -rd.z) - atan(sa.x, -sa.z);
      float off = .3840 / max(cos(se), .5);
      float dy = elevR - se;
      vec3 pd = vec3(0.);
      for (int sgn = -1; sgn <= 1; sgn += 2){
        float x = abs(daz) - off;
        vec3 sh = vec3(-.006, 0., .007);
        vec3 g = exp(-pow((vec3(x) - sh)/vec3(.007,.009,.016), vec3(2.)) - pow(dy/.016, 2.));
        g += exp(-pow(x/.05, 2.) * 1. - pow(dy/.006, 2.)) * .15 * step(0., x); // faint tail away from the sun
        pd = max(pd, g);
      }
      col += pd * uDog * T * ESUN * sunAtm * sunVis * .18 * smoothstep(-.01, .02, sa.y);
    }
  } else if (uWater > .5 && elevR <= dip + .0002){
    // ocean
    float tW = uCamH*1000. / max(-rd.y + (-dip)*.0, 1e-4) ; // metres (flat approx)
    vec3 pw = rd * tW;
    float fpW = tW * pixA / max(-rd.y, .002);
    vec2 wp = pw.xz;
    // wave slope field (metres): long swell + chop, band-limited
    float e = .15;
    e = .04;
    vec2 ws = vec2(.35, 1.4) * mix(.8, 1.25, uChop);
    vec2 wm = wp + vec2(uPhase * .35, -uPhase * 1.1);          // wind sea drifts toward the viewer
    float h0 = fbm(wm*ws, fpW*ws.y, 7);
    float hx = fbm((wm+vec2(e,0.))*ws, fpW*ws.y, 7);
    float hz = fbm((wm+vec2(0.,e))*ws, fpW*ws.y, 7);
    float amp = mix(.004, .17, pow(uChop, .85)) * (1. + 1.6 * uMess * smoothstep(80., 5., tW));   // glassy → choppy (v17: wind-blown chop up close on onshore days)
    vec3 n = normalize(vec3(-(hx-h0)/e*amp, 1., -(hz-h0)/e*amp*.6));
    // swell: long rolling crests (wave height from the marine forecast) — tilts the whole reflection in broad bands
    float sk = .16 + .05*sin(wp.x*.013);
    n = normalize(n + vec3(0., 0., uSwell * .22 * cos((wp.y * gSwC - wp.x * gSwS) * sk - uPhase * 2.2)) * smoothstep(3000., 300., tW) * (1. - smoothstep(.2, .5, tW * pixA / max(-rd.y, 1e-3) * sk * .159)));   // d19: fade the swell bands once a pixel spans ~1/3 of a crest (no scalloped aliasing near the horizon)
    float far = smoothstep(150., 2500., tW);
    // ripples that survive at distance: anchored to world x and inverse distance (perspective-compressed streaks)
    vec2 rq = vec2(wp.x / tW * 55. + uSeed.x, 900. / tW + uSeed.y);
    float fq = max(fwidth(rq.x), fwidth(rq.y)) * 1.5;
    float rp = fbm(rq, fq, 5) - .5;
    float rp2 = fbm(rq * vec2(3., 2.7) + 11., fq*3., 4) - .5;
    n = normalize(n + vec3(rp2*.03, 0., (rp*.11 + rp2*.05)) * (.4 + .6*far) * mix(.06, 1.7, uChop) * smoothstep(4., 30., tW));   // v17: fade the perspective ripple streaks near the camera (they formed rings)
    vec3 rr = reflect(rd, n); rr.y = max(rr.y, .002); rr = normalize(rr);
    float tPr; float pr = uPier > 0. ? pierHit(pw*vec3(1,0,1) + vec3(0,-2.0+.0,0)*0. + vec3(0,-2.,0)*-0., rr, tPr) : 0.;
    vec3 Tr; vec3 refl = skyRay(ro, rr, pixA*2., false, Tr);
    refl = antiTw(refl, rr, asin(rr.y));
    if (uFS.x > 0.){   // d23: the lit shoreline mirrored in the water
      vec3 rL = reflect(rd, normalize(mix(vec3(0., 1., 0.), n, .45))); rL.y = max(rL.y, .0005);   // rough water smears the land's reflection vertically, it doesn't shred it
      float azr = atan(rL.x, -rL.z), Ds = fsDist(azr), Dr = Ds - tW;
      if (Dr > 1.){ float yr = rL.y * Dr, kk, hv2; vec2 lp2 = vec2(azr * Ds + uSeed.x * 3., yr); float tp2 = fsTop(lp2.x, kk, hv2) * fsMask(azr);
        if (yr < tp2){ vec3 Ta2; vec3 hz2 = antiTw(skyRay(ro, normalize(vec3(rr.x, .004, rr.z)), pixA * 2., false, Ta2), rr, .004);
          refl = shadeFacade(ro, rL, Ds, lp2, tp2, kk, hv2, sunVis, hz2, hz2 * 1.15, Ds * pixA * 3.); } } }
    // reflected sun: microfacet glitter
    vec3 sa = uSunA;
    float sunUp = smoothstep(-.006, .004, sa.y);
    vec3 hv = normalize(-rd + sa);
    float nh = max(dot(n, hv), 0.);
    float m = mix(.007, .06, uChop) + mix(.012, .07, uChop)*far;   // mirror-sharp sun reflection when slick, wide glitter when rough
    float c2 = max(nh*nh, 1e-3); float D = min(exp((c2-1.)/(c2*m*m)) / (PI*m*m*c2*c2), 400.);
    float cosI = max(dot(-rd, n), .01);
    float F = .02 + .98*pow(1.-cosI, 5.);
    float Fs = .02 + .98*pow(1.-max(dot(-rd, hv),0.), 5.);
    vec3 glit = sunUp > 0. ? ESUN * sunT(ro, sa) * sunVis * sunUp * D * Fs / (4.*cosI) * .9 : vec3(0.);
    if (pr > .5) { refl = refl * mix(.03, .45, smoothstep(.3, .9, uChop) * (.5 + .5*abs(rp))); glit *= 1. - uChop; }   // rough water smears the pier's reflection
    vec3 body = vec3(.002,.006,.008) * (ESUN * .02) * (sunT(ro + vec3(0,20,0), uSun).g*.8 + .05);
    col = refl * F * 1.0 + glit + body * (1.-F);
    col *= mix(1., .5 + .5*smoothstep(.32, .62, h0), uChop * .75 * (1. - .6*far));   // wind chop: shadowed wave backs break up the mirror
    // aerial perspective over the water
    vec3 Ta; vec3 hzS = antiTw(skyRay(ro, normalize(vec3(rd.x, .001, rd.z)), pixA, false, Ta), rd, .001);
    { float sa0 = soupAmt(wp); if (sa0 > .01){   // v17 inside soup: bubbly lace, brighter than the water at dusk, lit by the sun when it gets through
        float b2 = fbm(wp * vec2(6.5, 8.) + vec2(0., -uSurfT * 2.), fpW * 8., 3), strk = fbm(vec2(wp.x * .5 + uSeed.x, wp.y * 4.5 - uSurfT * 1.2), fpW * 4.5, 4);
        float lace = smoothstep(.3, .7, sa0 * (.6 + .5 * b2 + .3 * strk));
        vec3 fcS = vec3(dot(hzS, vec3(.2126,.7152,.0722))) * 1.35 * (.8 + .35 * b2) + ESUN * sunT(ro, sa) * sunVis * smoothstep(-.015, .02, sa.y) * .03 * uBack * vec3(1., .86, .7);
        col = mix(col, fcS, lace * .95); } }
    float fog = 1. - exp(-tW*.001 * (BMe*1.3 + BR.g*1.) );
    // whitecaps: breaking crests lit by the sky (no data → no foam; coverage from the forecast wind)
    if (uCaps > .01){
      // breaking crests in world space (metres); where they shrink below a pixel they fade into an average whitening
      vec2 fq2 = wp * vec2(.22, .55) + vec2(uPhase * .3, -uPhase * 1.) + uSeed * .013;
      float fn = fbm(fq2, 0., 5) * .8 + fbm(fq2 * 2.3 + 5., 0., 3) * .3;
      float thr = mix(.76, .62, uCaps);
      float ww = smoothstep(.6, 2.5, fpW * .55);
      float foam = mix(smoothstep(thr, thr + .06, fn), uCaps * .2, ww) * (.5 + .5*uCaps);
      vec3 fc = hzS * .6 + refl * .2; fc = mix(vec3(dot(fc, vec3(.2126,.7152,.0722))), fc, .4) * 1.35;   // foam is white: desaturated sky light
      col = mix(col, fc, clamp(foam, 0., .92));
    }
    col = mix(col, hzS * .9, clamp(fog, 0., 1.));
    col = max(col, vec3(0.)); if (any(isnan(col))) col = hzS*.3;
  } else {
    // land / hills / shoreline silhouettes with aerial perspective
    vec3 Ta; vec3 hzS = skyRay(ro, normalize(vec3(rd.x, max(prof, dip)+.002, rd.z)), pixA, false, Ta);
    float depth = uHills > 0. ? clamp((elevR - dip) / .03 + .2, 0., 1.) : .55;
    vec3 land = vec3(.0012,.0011,.0014) * (ESUN*.05);
    col = mix(land, hzS*.55, depth * (.35 + .5*clamp(uAod*3.,0.,1.)));
    if (uWater > .5 && elevR < dip) col = mix(col, hzS * .15, .5);
  }

  // ---------- DRAFT: breaking surf rendered as geometry (faces stand up above the eye-level water line) ----------
  if (uSurf > .05 && uWater > .5 && rd.y < .03 && rd.y > -.6){
    float camM = uCamH * 1000., t = 4., hitT = -1., sprayA = 0., lipHit = 0., lipU = 0.;
    for (int i = 0; i < 180; i++){ if (uFast > .5 && i >= 130) break;   // d14: shorter march only when the phone can't hold 30 fps
      vec3 p = rd * t; float h = -camM + surfH(p.xz), dy = p.y - h;
      // curling lip: a thin sheet thrown forward from the crest over the pocket, only on the pitching section by the peel front
      { float x = surfX(p.xz), d = -p.z, sec = surfSec(p.xz), brk = smoothstep(110., 40., d) * sec * smoothstep(.35, 1.7, uSurf), fw = mix(.1, .022, brk);
        float pl = surfPeel(p.xz), curl = smoothstep(-1., -.15, pl) * (1. - smoothstep(.15, .6, pl)) * brk * smoothstep(.15, .5, uOff + (1. - uChop) * .4);
        float u = (x - (1. - fw * 2.6)) / (fw * 2.6);
        if (curl > .25 && uSurf > 1.05 && uSurf < 2.2 && u > .05 && u < 1.){   // d19: big surf seen from the beach = whitewater, not a solid thrown sheet
          float Ht = uSurf * surfEnv(p.xz) * sec * (1. + .35 * brk) * .68;
          float yl = -camM + Ht * (1. - .55 * pow(1. - u, 2.)) , th = (.12 + .5 * u) * curl;
          if (p.y < yl && p.y > yl - th){ hitT = t; lipHit = 1.; lipU = u; break; } } }
      if (dy < 0.){ float a = t - max(.25, t*.004), b = t; for (int k = 0; k < 6; k++){ float m = (a+b)*.5; vec3 q = rd*m; if (q.y < -camM + surfH(q.xz)) b = m; else a = m; } hitT = b; break; }
      // offshore spray: mist above and seaward of the crest, blown back off the lip
      if (uOff > .05 && dy < 6.){ float x = surfX(p.xz), e = surfEnv(p.xz) * smoothstep(140., 35., -p.z) * mix(.6, 1., surfSec(p.xz));
        float plume = .08 + .3 * uOff;   // spindrift trails farther back with stronger offshore wind
        float behind = smoothstep(plume, .0, x) * smoothstep(-.02, .012, x);
        float nz = fbm(vec2(p.x * .35 + uSurfT * .8, p.y * 1.6 - uSurfT * 1.5 + p.z * .2), 0., 4);
        sprayA += exp(-max(dy, 0.) / (.6 + 2.2 * uOff)) * behind * e * smoothstep(.3, .7, nz) * uOff * .25 * min(uSurf, 4.6) * max(.25, min(t*.004, 1.)); }
      float st = max(.12, min(dy * .5, 6.)) * (t > 60. ? 1.4 : 1.); t += st; if (t > 420.) break;
    }
    vec3 Ta; vec3 hz2 = antiTw(skyRay(ro, normalize(vec3(rd.x, .001, rd.z)), pixA, false, Ta), rd, .001);
    bool pierFirst = pier > .5 && tP < (hitT > 0. ? hitT : 1e9);
    if (hitT > 0. && !pierFirst){
      vec3 p = rd * hitT; vec2 q = p.xz; float e2 = .12;
      float h0 = surfH(q), hx = surfH(q + vec2(e2, 0.)), hzz = surfH(q + vec2(0., e2));
      vec3 n = normalize(vec3(-(hx - h0) / e2, 1., -(hzz - h0) / e2));
      // fine ripple texture: light grooming lines when offshore, rougher when onshore
      float rr1 = fbm(q * vec2(.9, 2.2) + uSeed, 0., 4) - .5, rr2 = fbm(q * vec2(3.5, 6.) + 3., 0., 3) - .5;
      n = normalize(n + vec3(rr2 * .05, 0., rr1 * .12) * mix(1.3, .45, uOff) * (.4 + uChop));
      vec3 rv = reflect(rd, n); rv.y = max(rv.y, .004); rv = normalize(rv);
      vec3 Tr; vec3 refl = skyRay(ro, rv, pixA * 2., false, Tr); refl = antiTw(refl, rv, asin(clamp(rv.y, -1., 1.)));
      float cosI = max(dot(-rd, n), .02), F = .02 + .98 * pow(1. - cosI, 5.);
      float x = surfX(q), d = -q.y, sec = surfSec(q), brk = smoothstep(150., 70., d) * sec;
      float faceZ = smoothstep(.8, .97, x), thin = smoothstep(.93, 1., x) * smoothstep(.0, .6, n.z);
      vec3 body = hz2 * uTint * .22;                                             // deep water body under a dusk sky
      vec3 trans = (hz2 * .7 + vec3(dot(hz2, vec3(.33)))) * uTint * .85 * thin * (.5 + .5 * brk);                       // sky light glowing through the thin face
      vec3 c = refl * F + body * (1. - F) + trans;
      c *= mix(1., .55, faceZ * (1. - thin) * smoothstep(.2, .8, n.z));                     // face turned away from the bright sky reads darker
      // whitewater: feathering lip (offshore = thin, clean), pitching/broken sections, soup on the inside
      float tex = fbm(q * vec2(.45, 1.6) + vec2(uSurfT * .3, 0.), 0., 5) * .65 + fbm(q * vec2(2.2, 3.2) + 7., 0., 4) * .35;
      float lip = smoothstep(.975, .995, x) * smoothstep(.45, .7, tex) * brk * mix(.9, .55, uOff);
      float broke = smoothstep(60., 30., d) * smoothstep(.55, .8, fbm(vec2(q.x * .05 + uSeed.x, 2.), 0., 3));
      float onF = (1. - uOff) * clamp(uChop, 0., 1.) * smoothstep(.15, .5, uCaps);   // v16: onshore / cross-shore — sections close out and crumble
      broke = max(broke, smoothstep(85., 25., d) * onF * smoothstep(.3, .65, fbm(vec2(q.x * .09 + uSeed.y, 5.), 0., 3)));
      float soup = broke * (smoothstep(.82, 1., x) * .9 + smoothstep(.35, .0, x) * .5) * smoothstep(.4, .75, tex);
      float inside = smoothstep(28. + 45. * onF, 6., d) * smoothstep(.42 - .12 * onF, .72, fbm(q * vec2(.12, 1.1) + vec2(0., uSurfT * .15 * onF), 0., 5)) * (.7 + .25 * onF);   // streaky foam lines left by broken waves
      float spill = (1. - uOff) * uChop * smoothstep(.9, 1., x) * brk * smoothstep(.3, .6, tex) * 1.2;
      float caps = uCaps * smoothstep(.66 - .1 * onF, .78, fbm(q * vec2(.25, .55) + vec2(0., uSurfT * .4), 0., 5)) * (1. - faceZ);
      float streak = uCaps * .35 * smoothstep(.6, .8, fbm(vec2(q.x * .04, q.y * .9) + 3., 0., 4));
      lip += spill + caps + streak;   // onshore: crumbling crests, whitecaps, wind streaks
      float foam = clamp(lip + soup + inside, 0., .95) * (1. - .5 * uOff * (1. - broke));
      { float bigS = smoothstep(1.4, 2.8, uSurf);   // d19: big surf (6–15 ft) — most sets break in the zone: whitewater on the face and rolling in ahead of it, a few open walls
        if (bigS > 0.){ float wv = floor((-q.y * gSwC + q.x * gSwS + uSurfT * 6.5) / uSurfL);
          float sect = smoothstep(.36, .6, fbm(vec2(q.x * .03 + uSeed.y + wv * 3.7, wv * 1.3), 0., 3));
          float zoneB = smoothstep(60. + 45. * bigS, 25. + 25. * bigS, d) * smoothstep(14., 34., d);
          float tx2 = tex * .55 + fbm(q * vec2(1.7, 5.) + vec2(uSurfT * .4, 0.), 0., 4) * .45;   // d20: crisper whitewater edges
          float ww = (smoothstep(.6, .93, x) * (1. - smoothstep(.985, 1., x) * .3) + smoothstep(.18, .0, x) * .6) * smoothstep(.42, .56, tx2)
                   + smoothstep(.955, .985, x) * (1. - smoothstep(.994, 1., x)) * .8;   // bright feathering crest line
          foam = max(foam, clamp(bigS * zoneB * sect * ww * 1.15, 0., .95)); } }
      vec3 fc = hz2 * .75 + refl * .25; fc = mix(vec3(dot(fc, vec3(.2126,.7152,.0722))), fc, .35) * 1.25;
      // direct sun on the waves: evening (sun behind viewer) = warm lit faces + golden glints; morning (sun ahead) = backlit
      vec3 sL = ESUN * sunAtm * sunVis * smoothstep(-.015, .02, uSunA.y) * .045 * uBack;
      float fwd = max(dot(rd, uSunA), 0.), front = max(dot(n, uSunA), 0.);
      c += sL * front * (.35 + .65 * faceZ) * vec3(1., .85, .62) * (1. - F) * .8;   // golden-hour light straight onto the face                         // front-lit face (sunset, sun at your back)
      c += sL * pow(max(dot(reflect(rd, n), uSunA), 0.), 60.) * .8;                                      // golden glints on the groomed lines
      c += sL * pow(fwd, 6.) * thin * vec3(.55, .8, .35) * 3.;   // sunrise: green-gold glow through the thin upper face                                           // sun shining THROUGH the thin face (sunrise)
      c *= mix(1., mix(.75, 1.2, smoothstep(.86, 1., x)), faceZ);                                          // shading gradient up the face: trough dark, lip bright
      fc += sL * (front * 1.2 + pow(fwd, 4.) * 2.5) * vec3(1., .82, .6);                                    // whitewater catches sun: lit (evening) / glowing rim (morning)
      // face streaks peeling down the wall + hollow throat just under the lip where a section is pitching (Sean's refs)
      float strk = fbm(vec2(q.x * .9 + uSeed.x, x * 55.), 0., 4);
      c *= mix(1., .82 + .36 * strk, faceZ);
      float tube = smoothstep(.955, .985, x) * (1. - smoothstep(.988, .998, x)) * brk * smoothstep(.35, .6, fbm(vec2(q.x * .05 + uSeed.x, 2.), 0., 3)) * uOff;
      c *= 1. - .5 * tube;
      { float pl = surfPeel(q), curl = smoothstep(-1., -.15, pl) * (1. - smoothstep(.15, .6, pl)) * brk;
        c *= 1. - .55 * curl * faceZ * (1. - smoothstep(.9, .99, x));                                   // shadowed pocket under the lip
        foam = max(foam, smoothstep(.0, .6, pl) * brk * smoothstep(.4, .7, tex) * (smoothstep(.6, 1., x) + smoothstep(.3, 0., x)));   // whitewater behind the peel
        c += sL * pow(fwd, 3.) * smoothstep(.95, 1., x) * vec3(.6, .8, .35) * 2.5; }                    // light through the top third when backlit
      c = mix(c, fc * (.75 + .5 * tex), foam);
      if (lipHit > .5){   // the thrown lip: thin, translucent olive-green sheet, lit through when backlit, white feathered edge
        vec3 lc = hz2 * vec3(.16, .2, .11) * 1.4 + sL * (pow(fwd, 3.) * vec3(.6, .85, .4) * 2.2 + front * .3);
        float edge = smoothstep(.35, .05, lipU) * smoothstep(.35, .7, tex);
        c = mix(lc, fc * 1.1, clamp(edge + .25 * smoothstep(.5, .8, tex), 0., 1.));
      }
      float fog = 1. - exp(-hitT * .001 * (BMe * 1.3 + BR.g));
      col = mix(c, hz2 * .9, clamp(fog, 0., 1.));
    }
    if (!pierFirst) { vec3 sc = mix(vec3(dot(hz2, vec3(.2126,.7152,.0722))), hz2, .5) * 1.1 + ESUN * sunAtm * sunVis * smoothstep(-.015, .02, uSunA.y) * .05 * (pow(max(dot(rd, uSunA), 0.), 5.) * 6. + .4) * vec3(1., .82, .62); col = mix(col, sc, clamp(sprayA, 0., .7)); }
  }

  // ---------- DRAFT: hero wave render ----------
  if (uHero > .5 && uSurf > .2 && uWater > .5 && rd.y < .12 + .33 * min(1., gK - 1.) && rd.y > -.5){
    float camM = uCamH * 1000. / gK, t = 1. / gK, ht = -1., mat = 0., spr = 0., fDen = 0., fY = 0., inT = 0.; vec4 inf;
    for (int i = 0; i < 140; i++){ if (uFast > .5 && i >= 105) break;
      vec3 p = rd * t; float m; vec4 I; float d = heroSDF(p, camM, m, I);
      if (d < .004 + t * .0006){ ht = t; mat = m; inf = I; break; }
      // spindrift: fine mist trailing back (away from camera) off the unbroken crest, length/density with offshore wind
      if (uOff > .05){ float s = I.x, y = I.y, Hh = I.z, rel = (mod(p.x * .927 + (p.z + gHD) * .375 - heroPX() + 9., 15.) - 9.) * 1.7;
        float zone = smoothstep(.3, -.1, s) * smoothstep(-(2. + 9. * uOff), -.5, s) * smoothstep(1.5, -2., rel);
        float above = y - Hh * .85;
        if (zone > 0. && above > -.2 && above < 5.){ float nz = fbm(vec2(p.x * .5 + uSurfT * 1.5, y * 1.8 - uSurfT * 2.2 + s * .3), 0., 4);
          spr += exp(-max(above, 0.) / (.4 + 1.3 * uOff)) * zone * smoothstep(.3, .7, nz) * uOff * (.1 + .15 * min(1., gK - 1.)) * (1. + 2.5 * I.w) * min(d, 1.); /* d19: bigger lips throw more spindrift */ } }
      if (uMess > .05){ float s = I.x, y = I.y, Hh = I.z, rel = (mod(p.x * .927 + (p.z + gHD) * .375 - heroPX() + 9., 15.) - 9.) * 1.7;   // v17: onshore spray blown landward (toward camera) off the crumbling crest
        float zone = smoothstep(-.3, .4, s) * (1. - smoothstep(1. + 3.5 * uMess, 2. + 6. * uMess, s)) * smoothstep(-6. * uMess - 1., 0., rel) * (1. - smoothstep(4., 8., rel));
        float above = y - Hh * .7;
        if (zone > 0. && above > -.3 && above < 3.){ float nz = fbm(vec2(p.x * .6 - uSurfT * .4, y * 1.6 - uSurfT * 1.1 - s * .5), 0., 4);
          spr += exp(-max(above, 0.) / (.3 + .7 * uMess)) * zone * smoothstep(.35, .75, nz) * uMess * .09 * min(d, 1.); } }
      if (I.w > .05 && I.y > 0. && I.y < I.z * 1.05 && I.x > -.35 * I.z && I.x < .7 * I.z) inT = 1.;   // d20: ray went into the tube
      float stp = clamp(d * (I.w > .05 ? .3 : .5), .01, 2.);   // d20: shorter steps in the tube (carved SDF over-stepped → contour rings) if (gFoamD < .6) stp = min(stp, .08 + t * .002);
      if (gFoamD < .35){ float dn = smoothstep(.35, -.35, gFoamD) * stp * 2.2; fDen += dn; fY += dn * clamp(I.y / max(I.z, .1), 0., 1.3); }
      t += stp; if (t > 120. || fDen > 6. || (rd.y > 0. && p.y + camM > gSurf * 3.8)) break;
    }
    vec3 Ta; vec3 hz2 = antiTw(skyRay(ro, normalize(vec3(rd.x, .001, rd.z)), pixA, false, Ta), rd, .001);
    vec3 sL = ESUN * sunAtm * sunVis * smoothstep(-.015, .02, uSunA.y) * .045 * uBack;   // direct sun only where it gets through cloud
    float fwd = max(dot(rd, uSunA), 0.);
    bool pierFirst = pier > .5 && tP < (ht > 0. ? ht * gK : 1e9);
    if (ht > 0. && !pierFirst){
      vec3 p = rd * ht; float m; vec4 I; float e = .02 + ht * .0015;   // wider normal kernel with distance = smooth normals
      vec3 n = normalize(vec3(heroSDF(p + vec3(e,0,0), camM, m, I) - heroSDF(p - vec3(e,0,0), camM, m, I),
                              heroSDF(p + vec3(0,e,0), camM, m, I) - heroSDF(p - vec3(0,e,0), camM, m, I),
                              heroSDF(p + vec3(0,0,e), camM, m, I) - heroSDF(p - vec3(0,0,e), camM, m, I)));
      float s = inf.x, y = inf.y, Hh = inf.z, b = inf.w, yr = clamp(y / max(Hh, .1), 0., 1.);
      vec3 rv = reflect(rd, n); rv.y = max(rv.y, .004); vec3 Tr; vec3 refl = skyRay(ro, normalize(rv), pixA * 2., false, Tr); refl = antiTw(refl, normalize(rv), asin(clamp(normalize(rv).y, -1., 1.)));
      float F = .04 + .96 * pow(1. - max(dot(-rd, n), .02), 5.), front = max(dot(n, uSunA), 0.);
      vec3 olive = uTint * 2.3;
      vec3 sky = vec3(dot(hz2, vec3(.2126,.7152,.0722))) * .9 + hz2 * .25;   // face colour from the water itself, lit by sky brightness
      vec3 c;
      float tex = fbm(vec2(p.x * 1.1 - uSurfT * .8, y * 2.5 + s), 0., 5);
      vec3 fc = mix(vec3(dot(sky, vec3(.2126,.7152,.0722))), sky, .3) * 1.15 * (.8 + .4 * tex) + sL * (front * .7 + pow(fwd, 4.) * 1.8) * vec3(1., .86, .7);
      if (mat < .5){
        float thin = smoothstep(.55, 1., yr), rz = smoothstep(.6, 1.6, uSurf), relT = (mod(p.x * .927 + (p.z + gHD) * .375 - heroPX() + 9., 15.) - 9.) * 1.7;   // d20: real-water face from ~3 ft up; 2 ft keeps the v17 look
        vec3 trans = sky * olive * (.5 + 1.6 * thin) + sL * pow(fwd, 3.) * thin * vec3(.45, .65, .3) * 2.2;   // light through the upper third
        c = refl * F + trans * (1. - F);
        c += sL * pow(max(dot(rv, uSunA), 0.), 120.) * 3. + refl * .12;   // wet: sun glint + sky sheen
        c *= .7 + .45 * fbm(vec2(p.x * 3.5 + y * .4, y * .7 - uSurfT * .3), 0., 4);   // streaks running down the face
        float pk = mix(1., .35, b * smoothstep(.3 * Hh, -.05, length(vec2(s, y) - heroC(Hh)) - .5 * heroR(Hh)));   // shadowed pocket
        c *= pk;
        c += sL * front * vec3(1., .85, .62) * .6 * (1. - F);                                   // evening sun on the face
        if (rz > 0.){   // d20 real water: capillary + wind-combed normal detail, fresnel sky reflection, dark deep water at the trough
                        // turning translucent green-gold up the face, golden light scattering through the thin top, foam streaks pulled down from the lip
          vec2 cq = vec2(p.x * 12., y * 17. - uSurfT * 1.4);
          float g1 = 0., g2 = 0.; if (uFast < .5){ g1 = fbm(cq, 0., 3) - .5; g2 = fbm(cq * vec2(2.1, 2.6) + 7.3, 0., 3) - .5; }   // capillaries skipped when the phone drops to fast mode
          float ov = max(smoothstep(.05, -.45, n.y), smoothstep(1.2 * heroR(Hh), .75 * heroR(Hh), length(vec2(s, y) - heroC(Hh))) * (1. - smoothstep(.5, 3., relT)) * smoothstep(-5., -2., relT) * .9);   // overhang: ceiling / back wall of the tube (normal points down) — the throat
          float comb = sin(y * 19. + fbm(vec2(p.x * .2, y * .4), 0., 3) * 6. - uSurfT * .7) * (1. - ov);
          vec3 nd = normalize(n + vec3(g1 * .2, g2 * .12 + comb * .05 * uOff, g1 * .07));
          vec3 rv2 = reflect(rd, nd); rv2.y = max(rv2.y, .004);
          float F2 = .02 + .98 * pow(1. - max(dot(-rd, nd), .02), 5.);
          vec3 ol2 = mix(vec3(dot(olive, vec3(.3, .5, .2))), olive, .5) * vec3(.82, 1., 1.08);   // less olive paint, more sea green-blue
          vec3 body = mix(hz2 * vec3(.045, .085, .085), sky * ol2 * .85, smoothstep(.12, .85, yr));
          vec3 sssL = sky * mix(ol2, olive, .5) * (.6 + 2.2 * pow(thin, 1.4)) + sL * (front * .5 + pow(fwd, 3.) * 2.2) * thin * vec3(.5, .75, .32);
          float rmod = clamp(1. + 4. * (rv2.y - rv.y), .45, 2.);
          vec3 cr = refl * rmod * (F2 * 1.15 + (.1 + .3 * smoothstep(.3, 1., yr)) * (1. - F2)) + mix(body, sssL, thin) * (1. - F2) * (.85 + .3 * (rmod - 1.));   // fresnel + broad sky sheen on the tilted upper wall
          cr += sL * pow(max(dot(rv2, uSunA), 0.), 90.) * 2.5;                       // sparkle on the capillaries
          cr += sL * front * vec3(1., .85, .62) * .28 * (1. - F2) * (.35 + .65 * yr);  // warm low sun on the wall (not a painted gold)
          float fs = smoothstep(.56, .8, fbm(vec2(p.x * 1.4 + uSeed.x, y * .22 - uSurfT * .25), 0., 4)) * smoothstep(.35, .95, yr) * (1. - smoothstep(.92, 1.05, y / max(Hh, .1)) * tubeB()) * (.3 + .4 * uOff);   /* d21b: no foam blotches on the poured lip */
          cr = mix(cr, fc * .9, fs * .5);
          float thr = max(clamp((1. - pk) / .65, 0., 1.), ov);   // inside the tube: dark green throat, no mirror-like sky (was concentric reflection rings)
          cr = mix(cr, hz2 * vec3(.03, .06, .055) + sssL * .22, thr * .9);
          float lipS = smoothstep(.97, 1.1, y / max(Hh, .1)) * tubeB(); cr = mix(cr, cr * vec3(.62, .72, .74) + sL * pow(fwd, 3.) * vec3(.25, .4, .18) * .6, lipS);   /* d21b: lip reads as backlit translucent water, not pale paint */
          c = mix(c, cr * mix(1., pk, .5), rz); }
        float relp = (mod(p.x * .927 + (p.z + gHD) * .375 - heroPX() + 9., 15.) - 9.) * 1.7; float crestFoam = smoothstep(.93, 1., yr) * smoothstep(.45, .75, tex) * (.3 + .7 * smoothstep(-6., 0., relp)) + smoothstep(1., 4., relp) * (1. - smoothstep(5., 9.5, relp)) * smoothstep(.35, .7, tex);
        if (uMess > .01){ float fz = smoothstep(.5, .8, fbm(vec2(p.x * .8 - uSurfT * .5, y * 2.1 + s * 1.4 - uSurfT * .8), 0., 5));   // v17: foam streaks / lace all over the crumbling face + whitecaps on the back
          crestFoam = max(crestFoam, uMess * (fz * (.35 + .65 * smoothstep(.45, .95, yr)) + smoothstep(-4., 1., relp) * smoothstep(.6, .95, yr) * .8 + smoothstep(.62, .92, yr) * smoothstep(.35, .65, tex) * .75)); c *= 1. - .15 * uMess; }
        { float rz2 = smoothstep(.6, 1.6, uSurf); vec3 fcT = fc * mix(1., .72 + .75 * fbm(vec2(p.x * 3.2 - uSurfT * .6, y * 4.5 - uSurfT * 2.), 0., 4), rz2);   // d20: turbulent, bubbly whitewater instead of a flat pale panel
          c = mix(c, fcT * (1. + .5 * uMess) * (1. + .15 * rz2), clamp(crestFoam * (.7 + .3 * uMess + .2 * rz2), 0., 1.)); }
        { float sa0 = soupAmt(p.xz) * (1. - smoothstep(.08, .35, yr)); if (sa0 > .01){   // v17 inside soup on the flats in front of the wave
            float b2 = fbm(p.xz * vec2(6.5, 8.) + vec2(0., -uSurfT * 2.), 0., 3), strk = fbm(vec2(p.x * .5 + uSeed.x, p.z * 4.5 - uSurfT * 1.2), 0., 4);
            float lace = smoothstep(.3, .7, sa0 * (.6 + .5 * b2 + .3 * strk));
            c = mix(c, fc * (1.25 + .35 * b2), lace * .95); }
          c *= 1. - .25 * uMess * (1. - smoothstep(.0, .3, yr)) * smoothstep(.35, .65, fbm(p.xz * vec2(.9, 1.6) + vec2(0., uSurfT * .8), 0., 4)); }   // wind-chop shading on the flats
      } else if (mat < 1.5){
        float rim = pow(1. - abs(dot(n, -rd)), 2.);   // grazing view through the thin sheet = glowing edge
        vec3 sss = sky * olive * 2.6 + sL * pow(fwd, 2.) * vec3(.55, .8, .35) * 3.;   // light transmitted through the sheet, olive subsurface tint
        c = refl * F * 1.2 + sss * (1. - F) + rim * (sky * vec3(.3, .4, .26) + sL * vec3(.6, .8, .4) * (.3 + fwd));
        c = mix(c, fc, smoothstep(.5, .8, tex) * .6);
        { float rz = smoothstep(.6, 1.6, uSurf); if (rz > 0.){   // d20: thrown lip = thin translucent sheet: golden light through it, shaded underside, feathering white edge
          vec3 ol2 = mix(vec3(dot(olive, vec3(.3, .5, .2))), olive, .5) * vec3(.82, 1., 1.08);
          float tb2 = tubeB(); vec3 sss2 = sky * ol2 * mix(vec3(1.), vec3(.78, .95, 1.12), tb2) * mix(.8 + .9 * tex, .5 + .5 * tex, tb2) + sL * (front * .45 + pow(fwd, 2.) * 2.) * vec3(.5, .75, .35);
          vec3 cl = refl * F * 1.3 + sss2 * (1. - F) + rim * (sky * vec3(.3, .4, .26) + sL * vec3(.6, .8, .4) * (.3 + fwd));
          cl *= mix(.5, 1., smoothstep(-.3, .4, n.y));
          cl = mix(cl, fc * 1.05, clamp(smoothstep(.58, .8, tex) * .45 + smoothstep(.55, .75, fbm(vec2(p.x * 2.6 + uSeed.x, p.y * 7. - uSurfT * 1.5), 0., 4)) * .55, 0., .9) * mix(1., .3, tb2));   /* d21b: thick poured lip keeps its water colour; whitewater only as light feathering */   // feathering, spray-torn whitewater along the throwing lip
          cl *= mix(.78, .9, tb2) + mix(.44, .2, tb2) * fbm(vec2(p.x * 1.8 + uSeed.y, p.y * 2.6 - uSurfT * .5), 0., 4);   /* d21c: smoother poured lip, less camouflage blotching */   // uneven sheet thickness
          c = mix(c, cl, rz); } }
      } else if (mat < 2.5 && uMess > .01) {   // v17: inside soup — bright bubbly whitewater with lacy holes showing dark water
        float b1 = fbm(vec2(p.x * 1.7 - uSurfT * .3, p.z * 2.6 - uSurfT * .9), 0., 5), b2 = fbm(vec2(p.x * 6.5, p.z * 8. - uSurfT * 2.), 0., 3);
        float strk = fbm(vec2(p.x * .5 + uSeed.x, p.z * 4.5 - uSurfT * 1.2), 0., 4);    // foam streaks drawn out toward the beach
        float lace = smoothstep(.42, .66, b1 * .55 + b2 * .4 + strk * .25);
        vec3 wet = sky * olive * .55 + refl * F;
        c = mix(wet, fc * (1.2 + .45 * b2) * (.7 + .4 * clamp(n.y, 0., 1.)) + vec3(.008), lace);
      } else {
        c = fc * 1.45 * (.7 + .55 * fbm(vec2(p.x * 2.2, y * 2.4 - uSurfT * 1.5), 0., 5));             // exploded turbulent whitewater
      }
      float fog = 1. - exp(-ht * gK * .001 * (BMe * 1.3 + BR.g));
      col = mix(c, hz2 * .9, clamp(fog, 0., 1.));
    }
    if (!pierFirst && ht < 0. && inT > .5) col = mix(col, hz2 * vec3(.035, .07, .06) + sL * vec3(.05, .08, .04), .88);   // d20: looking into the barrel = dark green throat, not a see-through hole
    if (!pierFirst){ vec3 sc = mix(vec3(dot(hz2, vec3(.2126,.7152,.0722))), hz2, .5) * 1.1 + ESUN * sunAtm * sunVis * smoothstep(-.015, .02, uSunA.y) * .05 * (pow(fwd, 5.) * 6. + .4) * vec3(1., .82, .62);
      col = mix(col, sc, clamp(spr, 0., .65)); }
    if (!pierFirst && fDen > .001){   // soft volumetric whitewater: brighter tops, shadowed cores, sun-lit when it gets through
      float lum = dot(hz2, vec3(.2126,.7152,.0722)); float top = fY / fDen;
      vec3 fcol = vec3(lum * (1.7 + 1.1 * uMess) + .02 + .03 * uMess) * (.55 + .55 * top) + ESUN * sunAtm * sunVis * smoothstep(-.015, .02, uSunA.y) * .05 * uBack * (.4 + pow(fwd, 3.) * 2.) * vec3(1., .9, .78);
      col = mix(col, fcol, 1. - exp(-fDen * 1.4)); }
  }

  // lens glare around the sun (scaled by how much sun gets through cloud)
  vec3 sa = uSunA;
  float ca = acos(clamp(dot(rd, sa), -1., 1.));
  vec3 sunRad = ESUN * sunAtm * sunVis * smoothstep(-.012, .003, sa.y);
  col += sunRad * (2.5e-3 / (1. + pow(ca/.004, 2.)) + 4e-4 / (1. + pow(ca/.05, 2.)) + 6e-5*exp(-ca*4.));

  if (uMeter > 1.5){ o = vec4(sqrt(clamp(col * uExpo / 4., 0., 1.)), 1.); return; }
  if (uMeter > .5){ float L = max(max(col.r, max(col.g, col.b)) * .8 + dot(col, vec3(.2126,.7152,.0722)) * .2, 1e-6); o = vec4(clamp((log2(L) + 16.) / 24., 0., 1.), 0., 0., 1.); return; }
  col *= uExpo;
  if (uGray > 0.){ float lg = dot(col, vec3(.2126,.7152,.0722)); col = mix(col, mix(vec3(lg), col, mix(.36, .8, gGnd)) * mix(uOvcT, vec3(1.), gGnd * .5) * 1.08, uGray); }   // d15/d22: overcast → muted (not zero) saturation + soft time-of-day tint, no glow
  { float lm = dot(col, vec3(.2126,.7152,.0722)); col = max(mix(vec3(lm), col, 1.3), 0.); }  // film-like colour separation
  // twilight colour response (calibrated against reference sunset photos): long-path warm light reads orange-red/pink
  // on camera rather than yellow, so pull green out of warm tones as the sun sinks
  { float warm = clamp((col.r - col.b) / (col.r + 1e-4), 0., 1.);
    col.g *= 1. - .28 * uTwi * warm;
    col.b *= 1. + .25 * uTwi * warm * smoothstep(.0, .5, rd.y); }
  // filmic response: blend of per-channel ACES (natural highlight roll-off) and hue-preserving ACES (keeps reds red
  // instead of skewing to yellow when bright)
  float mx = max(col.r, max(col.g, col.b));
  vec3 hp = mx > 1e-5 ? col * (aces(vec3(mx)).r / mx) : col;
  col = mix(aces(col), hp, .55);
  float l = dot(col, vec3(.2126,.7152,.0722));
  col = mix(vec3(l), col, 1.1);
  col = pow(clamp(col, 0., 1.), vec3(1./2.2));
  // vignette + grain
  vec2 q = frag / uRes;
  col *= .78 + .22*pow(16.*q.x*q.y*(1.-q.x)*(1.-q.y), .25);
  float gr = h12(frag + fract(uGrainT)*917.) - .5;
  col += gr * .018;
  o = vec4(col, 1.);
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function setup(canvas) {
    if (canvas._pr !== undefined) return canvas._pr;
    let st = null;
    try {
      const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
      if (gl) {
        const pr = gl.createProgram();
        gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const U = {}; const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(pr, i); U[a.name] = gl.getUniformLocation(pr, a.name); }
        st = { gl, pr, U };
      }
    } catch (e) { console.warn("Photoreal renderer unavailable: " + (e && e.message)); st = null; }
    canvas._pr = st; return st;
  }
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
  // refraction (Bennett/Saemundsson), degrees
  const refr = e => e < -1.6 ? 0 : 1.02 / Math.tan((e + 10.3 / (e + 5.11)) * Math.PI / 180) / 60;

  // params: { elev (deg geometric), sunAzOff (deg), high, mid, low (0..1), block, aod, rh, water, pier, shore, hills, camH (km), seed, wind, lq }
  function render(canvas, P) {
    const st = setup(canvas); if (!st) return false;
    const { gl, pr, U } = st;
    const dpr = P.w ? 1 : Math.min(window.devicePixelRatio || 1, P.dprCap || 2), sc = P.lq ? 0.42 : (P.scale || 1);
    const W = P.w || canvas.clientWidth || 600, H = P.h || canvas.clientHeight || 340;
    const w = Math.max(64, Math.round(W * dpr * sc)), h = Math.max(48, Math.round(H * dpr * sc));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h); gl.useProgram(pr); if (U.uFast) gl.uniform1f(U.uFast, P.fast ? 1 : 0); if (U.uGray) gl.uniform1f(U.uGray, clamp(P.gray || 0)); if (U.uGlow) { gl.uniform1f(U.uGlow, P.glow != null ? P.glow : 1); gl.uniform1f(U.uUnder, P.under || 0); gl.uniform1f(U.uTops, P.tops || 0); }
    const d2r = Math.PI / 180, e = P.elev * d2r, ea = (P.elev + refr(P.elev)) * d2r, az = (P.sunAzOff || 0) * d2r;
    const dir = (el) => [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
    gl.uniform2f(U.uRes, w, h);
    gl.uniform3fv(U.uSun, dir(e)); gl.uniform3fv(U.uSunA, dir(ea));
    // grazing sunlight that reaches high cloud after sunset is bent ~0.5° on each half of its path through the low atmosphere
    const lift = 0.75 * clamp((-0.8 - P.elev) / 2);
    gl.uniform3fv(U.uSunC, dir(e + lift * d2r));
    gl.uniform3f(U.uCov, P.high, P.mid, P.low);
    gl.uniform1f(U.uBlock, P.block); gl.uniform1f(U.uAod, P.aod); gl.uniform1f(U.uRH, P.rh);

    gl.uniform1f(U.uWater, P.water ? 1 : 0); gl.uniform1f(U.uPier, P.pier ? 1 : 0); gl.uniform1f(U.uShore, P.shore || 0); gl.uniform1f(U.uHills, P.hills || 0); if (U.uCity) gl.uniform1f(U.uCity, P.city || 0); if (U.uBridge) gl.uniform1f(U.uBridge, P.bridge || 0); { const G = P.ground || {}; if (U.uGnd) gl.uniform4f(U.uGnd, G.near || 0, G.nearD || 0, G.far || 0, G.land ? 1 : 0); if (U.uFS) gl.uniform4f(U.uFS, G.d || 0, G.th || 0, G.town || 0, G.dune || 0); if (U.uFSv) gl.uniform4f(U.uFSv, G.dl != null ? G.dl : (G.d || 0), G.dr != null ? G.dr : (G.d || 0), G.a0 != null ? G.a0 : -9, G.a1 != null ? G.a1 : 9); }
    gl.uniform1f(U.uCamH, P.heroCam || P.camH || 0.002);
    const cam = camera(P, W, H), vfov = cam.vfov; P.hz = cam.hz; P.vfov = vfov;   // d24u: horizon line shared with the 2D overlays (storm towers)
    gl.uniform1f(U.uFov, vfov * d2r); gl.uniform1f(U.uPitch, cam.pitch);
    gl.uniform2f(U.uSeed, P.seed * 977 % 500, P.seed * 613 % 500); gl.uniform1f(U.uWind, P.wind || 0);
    gl.uniform1f(U.uLQ, P.lq ? 1 : 0); gl.uniform1f(U.uDog, P.dog || 0); gl.uniform1f(U.uPixScale, 1);
    gl.uniform1f(U.uTwi, Math.max(0, Math.min(1, (1.5 - P.elev) / 3)) * Math.max(0, Math.min(1, (P.elev + 8) / 3)) * (1 - clamp(P.gray || 0))); gl.uniform1f(U.uGrainT, P.grain || 0.37);
    gl.uniform1f(U.uBlockGap, P.gap || 0);
    gl.uniform1f(U.uChop, P.chop != null ? P.chop : 0.3); gl.uniform1f(U.uSwell, P.swell || 0); gl.uniform1f(U.uCaps, P.caps || 0); gl.uniform1f(U.uPhase, P.phase || 0);
    if (U.uSurf) { gl.uniform1f(U.uSurf, P.surf || 0); gl.uniform1f(U.uOff, P.off || 0); gl.uniform1f(U.uSurfT, P.surfT || 0); gl.uniform1f(U.uSurfL, P.surfL || 42); if (U.uSwAng) gl.uniform1f(U.uSwAng, P.swAng || 0); if (U.uTint) { const tn = P.tint || [0.15, 0.2, 0.12]; gl.uniform3f(U.uTint, tn[0], tn[1], tn[2]); gl.uniform1f(U.uBack, (P.back != null ? P.back : 1) * (1 - clamp(P.gray || 0))); }
    if (U.uHero) { gl.uniform1f(U.uHero, P.hero ? 1 : 0); if (U.uMess) gl.uniform1f(U.uMess, P.mess || 0); gl.uniform1f(U.uHeroD, P.heroD || 26); } if (U.uFaceK) gl.uniform1f(U.uFaceK, P.faceK || 1.15); }
    gl.uniform1f(U.uMidH, clamp(P.midKm || 4.5, 2.5, 7.5));
    gl.uniform1f(U.uMeter, 0);
    const ovc = clamp((Math.max(P.mid, P.low, P.high * 0.6) - 0.5) / 0.45), gy = clamp(P.gray || 0);
    if (U.uOvcT) gl.uniform3fv(U.uOvcT, ovcTint(P.elev));
    const ex = P.expo != null ? P.expo : meter(gl, U, w, h, P) * (1 - 0.3 * ovc * (1 - gy)) * (1 + gy * (0.15 - 0.4 * clamp((2 - P.elev) / 6)));   // d22: overcast exposed bright, not moody-dark
    gl.viewport(0, 0, w, h); gl.uniform2f(U.uRes, w, h); gl.uniform1f(U.uMeter, 0); gl.uniform1f(U.uExpo, ex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    render.lastExpo = ex;
    return true;
  }
  // d22: diffuse overcast tint by sun elevation: cool lavender-silver by day → faint muted mauve/peach around sunset → blue-gray dusk
  function ovcTint(e) {
    const T = [[8, [1.01, 0.98, 1.05]], [3, [1.03, 0.975, 1.03]], [0.5, [1.09, 0.965, 0.98]], [-1.5, [1.06, 0.955, 1.04]], [-4, [0.94, 0.98, 1.09]]];
    if (e >= T[0][0]) return T[0][1]; if (e <= T[T.length - 1][0]) return T[T.length - 1][1];
    for (let i = 1; i < T.length; i++) if (e >= T[i][0]) { const [x0, a] = T[i - 1], [x1, b] = T[i], f = (e - x1) / (x0 - x1); return b.map((v, k) => v + (a[k] - v) * f); }
    return [1, 1, 1];
  }
  // in-camera metering: tiny HDR pass -> expose so the bright part of the sky (90th percentile) sits just under white,
  // the way a photographer exposes a sunset (protect highlights, keep saturation). Blended with a twilight curve.
  const mcache = {};
  function meter(gl, U, w, h, P) {
    const key = [P.elev, P.high, P.mid, P.low, P.block, P.aod, P.seed, P.water, P.pier, P.shore || 0, P.city || 0, P.bridge || 0, P.midKm || 4.5, P.gap || 0, Math.round((P.chop || 0) * 5)].map(v => typeof v === "number" ? v.toFixed(3) : v).join("|") + "|" + (w / h).toFixed(2);
    if (mcache[key]) return mcache[key];
    const mw = 64, mh = Math.max(24, Math.round(64 * h / w));
    gl.viewport(0, 0, mw, mh); gl.uniform2f(U.uRes, mw, mh); gl.uniform1f(U.uMeter, 1); gl.uniform1f(U.uLQ, 0); gl.uniform1f(U.uPixScale, w / mw);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(mw * mh * 4); gl.readPixels(0, 0, mw, mh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.uniform1f(U.uLQ, P.lq ? 1 : 0); gl.uniform1f(U.uPixScale, 1);
    const L = []; for (let i = 0; i < mw * mh; i++) L.push(Math.pow(2, px[i * 4] / 255 * 24 - 16));
    L.sort((a, b) => a - b);
    const p90 = L[Math.floor(L.length * 0.97)], p50 = L[Math.floor(L.length * 0.5)];
    meter.dbg = [p90, p50, px[0], px[1], px[(mw*mh-1)*4]];
    const p99 = L[Math.floor(L.length * 0.995)];
    let ex = Math.min(0.8 / Math.max(p90, 1e-5), 1.5 / Math.max(p99, 1e-5));
    ex = Math.min(ex, 0.22 / Math.max(p50, 1e-5) * 3.5);     // don't lift the mid-tones into daylight
    const curve = autoExpo(P);
    ex = Math.max(curve * 0.7, Math.min(curve * 10, ex));
    const keys = Object.keys(mcache); if (keys.length > 400) delete mcache[keys[0]];
    return (mcache[key] = ex);
  }
  // camera exposure that a photographer would pick: meter the sky, keep sunsets slightly under-exposed for saturation
  function autoExpo(P) {
    const T = [[8, 0.2], [6, 0.22], [3, 0.28], [0.5, 0.42], [-1.5, 0.85], [-3.5, 3], [-6, 9], [-9, 20]], e = P.elev;
    if (e >= T[0][0]) return T[0][1];
    for (let i = 1; i < T.length; i++) if (e >= T[i][0]) { const [x0, y0] = T[i - 1], [x1, y1] = T[i], f = (e - x1) / (x0 - x1); return Math.exp(Math.log(y1) + (Math.log(y0) - Math.log(y1)) * f); }
    return T[T.length - 1][1];
  }
  // d24u: camera = the one source of truth for the WebGL scene's field of view, pitch and HORIZON (fraction of canvas height from the top).
  // Shader: rd.y = d0.y·cos(p) + sin(p) with d0 = (uv·2·tan(fov/2), −1) → horizon (rd.y = −dip) at uv.y = −(tan p + dip/cos p)/(2·tan(fov/2)).
  function camera(P, W, H) { const aspect = W / H, vfov = (aspect < 1 ? 62 : aspect < 1.5 ? 50 : 40) * (P.fovMul || 1), d2r = Math.PI / 180;
    const pitch = (vfov * (P.hero && P.surf ? 0.04 : P.surf > 1.2 ? 0.09 : 0.17)) * d2r * (P.fovMul || 1) / Math.max(0.2, P.fovMul || 1);
    const camKm = P.heroCam || P.camH || 0.002, dip = Math.sqrt(2 * camKm / 6371);
    return { vfov, pitch, hz: 0.5 + (Math.tan(pitch) + dip / Math.cos(pitch)) / (2 * Math.tan(vfov * d2r / 2)) }; }
  g.Photoreal = { camera, render, meter, setup, autoExpo, hash, supported: () => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch (e) { return false; } } };
})(window);
