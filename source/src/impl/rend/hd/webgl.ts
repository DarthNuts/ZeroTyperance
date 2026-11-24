/// <reference lib="dom" />
import { EDGE_CONST, EDGE_LIVE, EDGE_RAMP, EDGE_SKY, beyondEdges, bandFunction, cabsOf, laneColours, originalRayPermits, ownColumnTangents, paletteRgb, rampFillRgb, shadeTables } from "./column.js";
import type { HdArea, HdParams, HdScreen, HdStatics } from "./column.js";
import { hdProjection } from "./column.js";
import { laneBeyondD0 } from "../shear.js";
import type { HdConstants } from "./constants.js";
import { FULL_HEIGHT, MESH_FLOATS, buildHdMesh, meshChanged, metatexChanged } from "./mesh.js";
import type { HdMesh } from "./mesh.js";
import { glDrawState, outsideRowsGlsl, quadExtentGlsl } from "./gl_state.js";
import type { GlDepthFunc } from "./gl_state.js";
import type { ViewSnapshot } from "./snapshot.js";
import type { BillboardEnv, BillboardView } from "./billboard.js";
import { ArtAtlas, BB_INSTANCE_FLOATS, TableSet, buildBillboardInstances, packInstances } from "./billboard_gl.js";
import { METATEXTURE_SLOTS } from "../floor_map.js";
import { FRAMING_HALF_ANGLE, farOriginUniform, farSkyShift, frameGeometry, framingFor, framingUniform, farLayerUsed, packFarTexture } from "./framing.js";
import type { FarLayer } from "./framing.js";
const TEXTURES_PER_ROW = 16;
const BETA_STEPS_PER_UNIT = 4;
const BYTES_PER_FLOAT = 4;
const FAR = 65536;
const COLUMN_CENTRE_PHASE = 0.5;
const FAR_UNIT = 9;
const BB_ART_UNIT = 7;
const BB_TABLE_UNIT = 8;
const LUT_UNIT = 10;
const BETA_ORIG_UNIT = 11;
const EDGE_UNIT = 12;
const STRIP_DEPTH_BIAS = "0.0001";
let availableCache: boolean | null = null;
const DEPTH_FRAGMENT = `#version 300 es
precision highp float;
out vec4 outColor;
void main() { outColor = vec4(0.0); }
`;
function vertexSource(): string {
    return `#version 300 es
precision highp float;
precision highp int;
in vec4 aAB;
in vec2 aEZ;
in vec2 aFW;
in vec2 aU;
in vec2 aHL;
uniform vec2 uFb;
uniform vec4 uProj;   // fx, fy, cx, cy in drawing-buffer pixels
uniform vec4 uCam;    // x, y, sin, cos
uniform float uEye;
uniform float uNear;
uniform float uCell;
uniform int uStrip;
uniform float uFull;  // 4.4a draft 28 (gl_state.ts): 1 = every face's quad spans the whole height in this pass
invariant gl_Position; // the depth pass and the colour pass give one face the same depth (the colour pass tests EQUAL)
out float vF;
out float vG;
flat out vec4 vP;     // word, uBase, uSpan, flags
flat out vec2 vHL;
void main() {
  vec2 d1 = aAB.xy - uCam.xy;
  vec2 d2 = aAB.zw - uCam.xy;
  vec2 A = vec2(d1.x * uCam.z - d1.y * uCam.w, d1.x * uCam.w + d1.y * uCam.z); // (forward, side)
  vec2 B = vec2(d2.x * uCam.z - d2.y * uCam.w, d2.x * uCam.w + d2.y * uCam.z);
  float crossv = A.y * B.x - B.y * A.x;
  int fl = int(aFW.x + 0.5);
  bool two = uStrip == 1 || (fl & 1) != 0;
  bool isHalf = (fl & 2) != 0;
  bool isLow = (fl & 4) != 0;
  bool ramp = (fl & 8) != 0;
  bool swapped = crossv > 0.0;
  if (crossv == 0.0 || (swapped && !two)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vF = 1.0; vG = 0.0; vP = vec4(0.0); vHL = vec2(0.0);
    return;
  }
  vec2 P = aEZ.x < 0.5 ? A : B;
  float g = swapped ? 1.0 - aEZ.x : aEZ.x;
  float uBase = aU.x;
  float uSpan = aU.y;
  if (isHalf) {
    bool isLeft = (isLow == !swapped);
    uBase = isLeft ? 0.0 : aU.y;
  }
  bool stairF = (fl & 64) != 0; // HD 4.4a draft 25: a stair face's quad spans its fill too
  ${quadExtentGlsl(FULL_HEIGHT)}
  float F = P.x;
  float L = P.y;
  float cx = 2.0 * (uProj.z * F + uProj.x * L) / uFb.x - F;
  float cy = F - 2.0 * (uProj.w * F - uProj.y * (z - uEye)) / uFb.y;
  // HD 4.4a: a strip on a face's own plane wins the tie (W 4.20.3: a strip repaints unless the wall is strictly nearer): its depth is a hair nearer
  float Fz = uStrip == 1 ? F * (1.0 - ${STRIP_DEPTH_BIAS}) : F;
  float cz = (Fz * (${FAR}.0 + uNear) - 2.0 * ${FAR}.0 * uNear) / (${FAR}.0 - uNear);
  gl_Position = vec4(cx, cy, cz, F);
  vF = F;
  vG = g;
  vP = vec4(aFW.y, uBase, uSpan, float(fl));
  vHL = aHL;
}
`;
}
export interface ShaderNumbers {
    readonly cell: number;
    readonly texS: number;
    readonly texW: number;
    readonly perRow: number;
    readonly colCentre: number;
    readonly bigHalf: number;
    readonly laneRows: number;
    readonly bands: number;
    readonly shadeK: number;
    readonly perE: number;
    readonly beamCols: number;
    readonly sky: {
        VIEW_Y: number;
        wPx: number;
        wPy: number;
        panRows: number;
        unitsRad: number;
        halfW: number;
    } | null;
    readonly angles: number;
}
function f(n: number): string {
    return Number.isInteger(n) ? `${n}.0` : String(n);
}
function commonSource(N: ShaderNumbers): string {
    const sky = N.sky;
    return `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp sampler2D;
uniform vec2 uFb;
uniform vec4 uProj;
uniform float uPhase;
uniform sampler2D uLane;       // VIEW_ROWS x 2: row 0 the rebuilt lanes, row 1 the art's own (4.7 draft 26: rows beyond 0 .. 79): rgb, a = opaque
uniform vec2 uLaneB;           // 4.7 draft 26: the eye E (cam.eye_lanes) and d0 = n0 + 40 of W 4.12.7 (shear.ts laneBeyondArtRow)
uniform sampler2D uPal;        // 64 x 1
uniform usampler2D uSkyTex;    // the panorama's values
uniform vec4 uSky;             // on, base, vs, 1 = the cylinder of drafts up to 19 (a negative case; 0 = 4.7 draft 20, linear)
uniform float uSkyExt;         // 4.7 draft 27: the rows of the extension E under the panorama's rows in uSkyTex (0 = none)
uniform vec3 uBackdrop;
uniform usampler2D uFarTex;    // HD 4.15: the far sprites' layer, palette indices of the view rectangle's frame px (0 = transparent)
uniform vec4 uFarMap;          // frame x = x + (screen x - cx) * z, frame y = y + (screen y - cy) * w (framing.ts framingUniform)
uniform vec2 uFarOn;           // on, smooth filter
uniform vec4 uFarOrg;          // HD 4.15 draft 24: the layer's first column and row in frame px, its repeating rows (from, period; 0 = none) (framing.ts farLayerAt)
uniform vec3 uFarSky;          // HD 4.15: x 0 = the framing map, 1 = draft 17's azimuth (y 1 / f_x, z hw / the half angle; areaToFrameSky), 2 = drafts 19 / 20 on the linear sky (y the shift, framing.ts areaToFrameOnSky)
uniform float uWin;             // HD 4.5 (draft 12): 1 = a transparent wall pixel shows the far sprites (not the lane), 0 = draft 11's
uniform float uRayOn;           // HD 4.4a (draft 10): 1 = the fill and the repaint only in the columns whose own ray has them (uRays), 0 = draft 9's
uniform vec3 uRays[${2 * N.colCentre}];     // per original column: ramp face's fill, live strip, constant strip (column.ts originalRayPermits)
uniform sampler2D uEdge;       // HD 4.4a draft 12: per screen column the edge bits (column.ts EDGE_*) of the row above (r) and below (g) the original's rows
uniform float uEdgeOn;         // 1 = the rows beyond the original's go on as the edge row shows (0 = draft 11's)
uniform vec3 uOwn;             // HD 4.4a: tangent of the original's first and last column, 1 = every direction (negative test)
uniform vec3 uFill;            // the one-colour fill (REND.RAMP.FILL_BYTE's colour)
uniform vec3 uRide;            // HD 4.4b: a cab rides (x), the eye's heights h_l (y) and h_w (z): the lanes keep their distance
out vec4 outColor;
vec3 farPal(uint v) { return texelFetch(uPal, ivec2(int(v), 0), 0).rgb; }
// framing.ts farLayerAt: the repeating rows folded back; false outside the layer
bool farIdx(inout ivec2 t, ivec2 sz) {
  int rf = int(uFarOrg.z);
  int per = int(uFarOrg.w);
  if (per > 0 && t.y >= rf) t.y = rf + (t.y - rf) % per;
  return !(t.x < 0 || t.y < 0 || t.x >= sz.x || t.y >= sz.y);
}
// the layer's colour at this pixel by the inverse framing map; false where transparent (framing.ts sampleFarLayer, line for line)
bool farAt(out vec3 c) {
  c = vec3(0.0);
  float xs = floor(gl_FragCoord.x) + uPhase;
  float ys = uFb.y - gl_FragCoord.y;
  float fxp = uFarSky.x > 1.5 ? uFarMap.x + (xs - uProj.z) * uFarMap.z + uFarSky.y : uFarSky.x > 0.5 ? uFarMap.x + atan((xs - uProj.z) * uFarSky.y) * uFarSky.z : uFarMap.x + (xs - uProj.z) * uFarMap.z;
  float fyp = uFarMap.y + (ys - uProj.w) * uFarMap.w;
  fxp -= uFarOrg.x;
  fyp -= uFarOrg.y;
  ivec2 sz = textureSize(uFarTex, 0);
  ivec2 i = ivec2(floor(fxp), floor(fyp));
  if (!farIdx(i, sz)) return false;
  uint own = texelFetch(uFarTex, i, 0).r;
  if (own == 0u) return false;
  c = farPal(own);
  if (uFarOn.y < 0.5) return true;
  float uu = fxp - 0.5;
  float vv = fyp - 0.5;
  float u0 = floor(uu);
  float v0 = floor(vv);
  float fu = uu - u0;
  float fv = vv - v0;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int dv = 0; dv < 2; dv++) {
    for (int du = 0; du < 2; du++) {
      ivec2 t = ivec2(int(u0) + du, int(v0) + dv);
      if (!farIdx(t, sz)) continue;
      uint v = texelFetch(uFarTex, t, 0).r;
      if (v == 0u) continue;
      float w = (du == 1 ? fu : 1.0 - fu) * (dv == 1 ? fv : 1.0 - fv);
      acc += farPal(v) * w;
      wsum += w;
    }
  }
  if (wsum > 0.0) c = acc / wsum;
  return true;
}
// HD 4.4a (the stripe): the one-colour fill exists only in the rows of the original's own view (column.ts fillRow)
// and only in the columns between the first and the last ray angle of REND.COLUMN_ANGLES (uOwn = tangents lo, hi, whole-view flag)
// HD 4.4a draft 12 (column.ts edgeBitsOf): what the edge row of this column shows, for a row beyond the original's 0 .. 79; 0 inside them
bool gNoEdge = false; // HD 4.4a draft 25: a stair strip's live repaint reads 4.7's lanes, not an edge row's continuation
int edgeBits(float rawR) {
  if (gNoEdge || uEdgeOn < 0.5 || (rawR >= 0.0 && rawR < ${f(N.laneRows)})) return 0;
  vec4 e = texelFetch(uEdge, ivec2(int(floor(gl_FragCoord.x)), 0), 0);
  return int((rawR < 0.0 ? e.x : e.y) + 0.5);
}
// HD 4.4a draft 12: the edge row of this column shows kind (0 ramp, 1 live strip, 2 constant strip) and the row lies beyond the original's
bool beyondEdgeShows(int kind) {
  float dyc = (uFb.y - gl_FragCoord.y) - uProj.w;
  float rawR = floor(${f(N.bigHalf)} + dyc * ${f(N.colCentre)} / uProj.y);
  if (rawR >= 0.0 && rawR < ${f(N.laneRows)}) return false;
  return (edgeBits(rawR) & (kind == 0 ? ${EDGE_RAMP} : kind == 1 ? ${EDGE_LIVE} : ${EDGE_CONST})) != 0;
}
bool ownRows(int kind) {
  float dyc = (uFb.y - gl_FragCoord.y) - uProj.w;
  float rawR = floor(${f(N.bigHalf)} + dyc * ${f(N.colCentre)} / uProj.y);
  if (uOwn.z < 0.5 && (rawR < 0.0 || rawR >= ${f(N.laneRows)})) return (edgeBits(rawR) & (kind == 0 ? ${EDGE_RAMP} : kind == 1 ? ${EDGE_LIVE} : ${EDGE_CONST})) != 0;
  float u = (floor(gl_FragCoord.x) + uPhase - uProj.z) / uProj.x;
  bool cols = uOwn.z > 0.5 || (u >= uOwn.x - 1e-9 && u <= uOwn.y + 1e-9);
  bool rows = uOwn.z > 0.5 || (rawR >= 0.0 && rawR < ${f(N.laneRows)});
  if (!(cols && rows)) return false;
  if (uRayOn < 0.5 || uOwn.z > 0.5) return true;
  int oj = int(floor(u * ${f(N.colCentre)} + ${f(N.colCentre)}));
  return oj >= 0 && oj < ${2 * N.colCentre} && uRays[oj][kind] > 0.5;
}
vec3 bgOf(bool skyOnly);
vec3 bg() { return bgOf(false); }
// skyOnly (4.5 draft 12): a transparent wall pixel shows the far sprites and the sky, never the lane (uWin = 0: draft 11, the lane and no far sprites)
vec3 bgOf(bool skyOnly) {
  bool d11 = skyOnly && uWin < 0.5;
  if (d11) skyOnly = false;
  float dyc = (uFb.y - gl_FragCoord.y) - uProj.w;
  float rawR = floor(${f(N.bigHalf)} + dyc * ${f(N.colCentre)} / uProj.y);
  int r = clamp(int(rawR), 0, ${N.laneRows - 1});
  if (uRide.x > 0.5 && !skyOnly) {
    // HD 4.4b (cab.ts rideLaneRow): the row of the same floor (ceiling) point seen with the lanes' eye; the shaft's fill beyond the level's floor
    float rr = ${f(N.bigHalf)} + dyc * ${f(N.colCentre)} / uProj.y;
    float m;
    if (rr >= ${f(N.bigHalf)}) {
      if (uRide.z <= 0.0) return uFill;
      m = ${f(N.bigHalf)} + (rr - ${f(N.bigHalf)}) * uRide.y / uRide.z;
    } else {
      if (uRide.z >= ${f(N.cell)}) return uFill;
      m = ${f(N.bigHalf)} + (rr - ${f(N.bigHalf)}) * (${f(N.cell)} - uRide.y) / (${f(N.cell)} - uRide.z);
    }
    r = clamp(int(floor(m)), 0, ${N.laneRows - 1});
  }
  vec4 l = texelFetch(uLane, ivec2(r, 0), 0);
  if (uRide.x < 0.5 && (rawR < 0.0 || rawR >= ${f(N.laneRows)})) {
    // 4.7 draft 26 (shear.ts laneBeyondArtRow): beyond 0 .. 79 the run of the rebuild goes on at its own rate over the art's own lanes
    int ri = int(rawR);
    int d0 = int(uLaneB.y + 0.5);
    int ar;
    if (ri >= ${N.laneRows}) ar = uLaneB.x > 0.5 ? min(${N.laneRows - 1}, ${N.bigHalf} + ((ri - ${N.bigHalf}) * ${N.bigHalf}) / d0) : ${N.laneRows - 1};
    else ar = uLaneB.x < -0.5 ? max(0, ${N.bigHalf - 1} - ((${N.bigHalf - 1} - ri) * ${N.bigHalf}) / d0) : 0;
    l = texelFetch(uLane, ivec2(ar, 1), 0);
  }
  if (!skyOnly && l.a > 0.5 && (edgeBits(rawR) & ${EDGE_SKY}) == 0) return l.rgb;
  if (uFarOn.x > 0.5 && !d11) {
    vec3 fc;
    if (farAt(fc)) return fc;
  }
${sky
        ? `  if (uSky.x > 0.5) {
    float u = (floor(gl_FragCoord.x) + uPhase - uProj.z) / uProj.x;
    float theta = atan(u) / ${sky.unitsRad.toFixed(12)};
    float px = mod(floor(uSky.y + (uSky.w > 0.5 ? 2.0 * theta : u * ${f(sky.halfW)})), ${f(sky.wPx)});
    float rawPy = ${f(sky.VIEW_Y)} + rawR + uSky.z;
    float py = mod(rawPy, ${f(sky.wPy)});
    float ek = -floor(rawPy);
    if (ek >= 1.0 && ek <= uSkyExt) {
      uint v = texelFetch(uSkyTex, ivec2(int(px), ${sky.panRows - 1} + int(ek)), 0).r;
      if (v != 0u) return texelFetch(uPal, ivec2(int(v), 0), 0).rgb;
    } else if (py < ${f(sky.panRows)}) {
      uint v = texelFetch(uSkyTex, ivec2(int(px), int(py)), 0).r;
      if (v != 0u) return texelFetch(uPal, ivec2(int(v), 0), 0).rgb;
    }
  }
`
        : ""}  return uBackdrop;
}
`;
}
function bgFragment(N: ShaderNumbers): string {
    return `${commonSource(N)}
void main() { outColor = vec4(bg(), 1.0); }
`;
}
function stripFragment(N: ShaderNumbers): string {
    return `${commonSource(N)}
uniform float uEye;
uniform float uCell;
in float vF;
in float vG;
flat in vec4 vP;
flat in vec2 vHL;
void main() {
  float ys = uFb.y - gl_FragCoord.y;
  float top = uProj.w - uProj.y * (uCell - uEye) / vF;
  float bottom = uProj.w + uProj.y * uEye / vF;
  bool cst = (int(vP.w + 0.5) & 16) != 0;
  bool stair = (int(vP.w + 0.5) & 64) != 0;
  if (stair) {
    // 4.4a draft 25: a stair strip repaints by "What" at every row and column of the area, with no per-ray condition
    if (!(ys < top || ys > bottom)) discard;
    gNoEdge = true;
    outColor = vec4(cst ? uFill : bg(), 1.0);
    return;
  }
  if (ys < top || ys > bottom || beyondEdgeShows(cst ? 2 : 1)) {
    // 4.4a: the strips' repaint exists only in the original's own directions
    if (!ownRows(cst ? 2 : 1)) discard;
    outColor = vec4(cst ? uFill : bg(), 1.0);
  } else discard;
}
`;
}
export function wallFragment(N: ShaderNumbers): string {
    return `${commonSource(N)}
uniform usampler2D uAtlas;
uniform usampler2D uMeta;
uniform sampler2D uShade;      // 16 x (bands + 1): rgb
uniform sampler2D uBeta;       // c steps x 1: the band as a function of the equivalent height
uniform usampler2D uLut;       // 256 x (bands + 1): the texture byte through the table of a band (4.5 transparent pixels)
uniform sampler2D uBetaO;      // c steps x 1: the original's band (smooth_shading off)
uniform float uEye;
uniform float uCell;
uniform int uTexCount;
uniform int uBetaN;
uniform int uSmoothShade;
uniform int uShaded;
uniform int uSmoothFilter;
uniform float uBeamFirst;
uniform float uStairWord;      // 4.4a draft 28 (gl_state.ts stairFill): 1 = a stair face fills only with a ramp word not zero
in float vF;
in float vG;
flat in vec4 vP;
flat in vec2 vHL;
const int TW = ${N.texW};
const int TS = ${N.texS};
const int PERROW = ${N.perRow};
int texel(int word, int ut, int vt) {
  if (word < 0) return 0;
  int pair = ut / TW;
  int px = ut - pair * TW;
  int slot = 2 * pair + (vt >= TS ? 1 : 0);
  int t = int(texelFetch(uMeta, ivec2(slot, word), 0).r);
  if (t >= uTexCount) return 0;
  int ax = (t % PERROW) * TW + px;
  int ay = (t / PERROW) * TS + (vt % TS);
  return int(texelFetch(uAtlas, ivec2(ax, ay), 0).r);
}
// 4.5: is the pixel's half of its texture byte, mapped by the table of the original's band b0, not 0?
bool opq(int word, int ut, int vt, int b0) {
  if (word < 0) return true;
  int pair = ut / TW;
  int px = ut - pair * TW;
  int slot = 2 * pair + (vt >= TS ? 1 : 0);
  int t = int(texelFetch(uMeta, ivec2(slot, word), 0).r);
  if (t >= uTexCount) return true;
  int ax = (t % PERROW) * TW + (px & ~1);
  int ay = (t / PERROW) * TS + (vt % TS);
  int byt = int(texelFetch(uAtlas, ivec2(ax, ay), 0).r) * 16 + int(texelFetch(uAtlas, ivec2(ax + 1, ay), 0).r);
  int m = int(texelFetch(uLut, ivec2(byt, b0), 0).r);
  return ((px & 1) == 1 ? (m & 15) : (m >> 4)) != 0;
}
float betaAt(float c) {
  float x = c * ${f(BETA_STEPS_PER_UNIT)};
  if (x >= float(uBetaN - 1)) return 0.0;
  if (uSmoothShade == 0) return texelFetch(uBeta, ivec2(int(floor(x)), 0), 0).r;
  int i = int(floor(x));
  float a = texelFetch(uBeta, ivec2(i, 0), 0).r;
  float b = texelFetch(uBeta, ivec2(i + 1, 0), 0).r;
  return mix(a, b, x - float(i));
}
void main() {
  float F = vF;
  float g = vG;
  int fl = int(vP.w + 0.5);
  bool ramp = (fl & 8) != 0;
  bool lift = (fl & 32) != 0;
  bool stair = (fl & 64) != 0;
  float dyc = (uFb.y - gl_FragCoord.y) - uProj.w;
  float shift = ramp ? ${f(N.perE)} * (vHL.x * (1.0 - g) + vHL.y * g) : 0.0;
  float wz = uEye - dyc * F / uProj.y + shift;
  if (!(wz >= 0.0 && wz < uCell)) {
${outsideRowsGlsl()}
  }
  float v = ((uCell - wz) / uCell) * float(2 * TS);
  float ufl = vP.y + vP.z * g;
  float beta = 0.0;
  if (uShaded == 1) {
    beta = betaAt(${f(N.shadeK)} / F);
    if (uBeamFirst >= 0.0 && beta > 0.0) {
      float u = (floor(gl_FragCoord.x) + uPhase - uProj.z) / uProj.x;
      float o = u * ${f(N.colCentre)} + ${f(N.colCentre)};
      float w;
      if (uSmoothShade == 1) w = clamp(min(o - uBeamFirst, uBeamFirst + ${f(N.beamCols)} - o) + 0.5, 0.0, 1.0);
      else w = (o >= uBeamFirst && o < uBeamFirst + ${f(N.beamCols)}) ? 1.0 : 0.0;
      beta *= 1.0 - w;
    }
  }
  int b0 = 0;
  if (uShaded == 1) {
    float xo = (${f(N.shadeK)} / F) * ${f(BETA_STEPS_PER_UNIT)};
    if (xo < float(uBetaN - 1)) b0 = int(texelFetch(uBetaO, ivec2(int(floor(xo)), 0), 0).r + 0.5);
  }
  float bLo = floor(beta);
  float bHi = min(float(${N.bands}), ceil(beta));
  float bFr = beta - bLo;
  int word = int(vP.x + (vP.x < 0.0 ? -0.5 : 0.5));
  int lo = int(vP.y + 0.5);
  int hi = lo + int(vP.z + 0.5) - 1;
  vec3 rgb;
  if (uSmoothFilter == 1) {
    float uu = ufl - 0.5;
    float vv = v - 0.5;
    float u0 = floor(uu);
    float v0 = floor(vv);
    float fu = uu - u0;
    float fv = vv - v0;
    rgb = vec3(0.0);
    float wsum = 0.0;
    for (int dv = 0; dv < 2; dv++) {
      for (int du = 0; du < 2; du++) {
        int tu = clamp(int(u0) + du, lo, hi);
        int tv = clamp(int(v0) + dv, 0, 2 * TS - 1);
        float wgt = (du == 1 ? fu : 1.0 - fu) * (dv == 1 ? fv : 1.0 - fv);
        if (!opq(word, tu, tv, b0)) continue; // 4.5: a transparent texel takes no part
        int i = texel(word, tu, tv);
        vec3 a = texelFetch(uShade, ivec2(i, int(bLo)), 0).rgb;
        vec3 b = texelFetch(uShade, ivec2(i, int(bHi)), 0).rgb;
        rgb += (bFr == 0.0 ? a : mix(a, b, bFr)) * wgt;
        wsum += wgt;
      }
    }
    // the pixel's own texel decides (4.5); the opaque taps are renormalised
    // 4.5 (draft 9): a transparent pixel shows the sky / lane colour and keeps the wall's depth - nothing farther shows there
    if (wsum <= 0.0 || !opq(word, clamp(int(floor(ufl)), lo, hi), clamp(int(floor(v)), 0, 2 * TS - 1), b0)) { outColor = vec4(bgOf(true), 1.0); return; }
    rgb /= wsum;
  } else {
    int tu = clamp(int(floor(ufl)), lo, hi);
    int tv = clamp(int(floor(v)), 0, 2 * TS - 1);
    if (!opq(word, tu, tv, b0)) { outColor = vec4(bgOf(true), 1.0); return; } // 4.5 (draft 9): the sky's colour, the wall's depth (farther faces and billboards fail the depth test)
    int i = texel(word, tu, tv);
    vec3 a = texelFetch(uShade, ivec2(i, int(bLo)), 0).rgb;
    vec3 b = texelFetch(uShade, ivec2(i, int(bHi)), 0).rgb;
    rgb = bFr == 0.0 ? a : mix(a, b, bFr);
  }
  outColor = vec4(rgb, 1.0);
}
`;
}
function billboardVertex(depthBias: number): string {
    return `#version 300 es
precision highp float;
in vec4 aRect;   // x0, y0, x1, y1 in drawing-buffer px (top-down)
in vec4 aInfo;   // F, art, mirrored, beam row
in vec4 aShade;  // row lo, row hi, weight
uniform vec2 uFb;
uniform float uNear;
flat out vec4 vRect;
flat out vec4 vInfo;
flat out vec3 vShade;
flat out float vShadow; // 4.11 (draft 11): a dormant marker under markers = shadow
void main() {
  int id = gl_VertexID;
  float kx = (id == 1 || id == 4 || id == 5) ? 1.0 : 0.0;
  float ky = (id == 2 || id == 3 || id == 5) ? 1.0 : 0.0;
  float x = mix(aRect.x, aRect.z, kx);
  float y = mix(aRect.y, aRect.w, ky);
  float F = aInfo.x * (1.0 - ${depthBias.toFixed(12)});
  float z = ((${FAR}.0 + uNear) - 2.0 * ${FAR}.0 * uNear / F) / (${FAR}.0 - uNear);
  gl_Position = vec4(x / uFb.x * 2.0 - 1.0, 1.0 - y / uFb.y * 2.0, z, 1.0);
  vRect = aRect;
  vInfo = aInfo;
  vShade = aShade.xyz;
  vShadow = aShade.w;
}
`;
}
function billboardFragment(artColumns: number, artRows: number, colCentre: number, beamCols: number): string {
    return `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp sampler2D;
uniform vec2 uFb;
uniform vec4 uProj;
uniform float uPhase;
uniform sampler2D uPal;
uniform usampler2D uArt;
uniform usampler2D uTab;
uniform int uSmoothShade;
uniform int uSmoothFilter;
uniform float uBeamFirst;
flat in vec4 vRect;
flat in vec4 vInfo;
flat in vec3 vShade;
flat in float vShadow;
out vec4 outColor;
const int ACOLS = ${artColumns};
const int AROWS = ${artRows};
const int TEXW = ${2 * artColumns};
bool texel(int tx, int ty, float rowA, float rowB, float w, out vec3 c) {
  bool mir = vInfo.z > 0.5;
  int col = mir ? ACOLS - 1 - (tx >> 1) : (tx >> 1);
  int b = int(texelFetch(uArt, ivec2(col, int(vInfo.y + 0.5) * AROWS + ty), 0).r);
  c = vec3(0.0);
  if (b == 0) return false;
  int vA = int(texelFetch(uTab, ivec2(b, int(rowA + 0.5)), 0).r);
  int lineOff = vShadow > 1.5 ? int(vShadow - 2.0 + 0.5) * 16 : 0; // an own picture's palette line (billboard_gl.ts OWN_LINE_BASE)
  int iA = (tx & 1) == 0 ? vA >> 4 : vA & 15;
  c = texelFetch(uPal, ivec2(iA + lineOff, 0), 0).rgb;
  if (w != 0.0) {
    int vB = int(texelFetch(uTab, ivec2(b, int(rowB + 0.5)), 0).r);
    int iB = (tx & 1) == 0 ? vB >> 4 : vB & 15;
    c = c * (1.0 - w) + texelFetch(uPal, ivec2(iB + lineOff, 0), 0).rgb * w;
  }
  return true;
}
bool sampleAt(float u, float v, float rowA, float rowB, float w, out vec3 c) {
  int tx = min(TEXW - 1, int(floor(u * float(TEXW))));
  int ty = min(AROWS - 1, int(floor(v * float(AROWS))));
  vec3 n;
  c = vec3(0.0);
  if (!texel(tx, ty, rowA, rowB, w, n)) return false;
  c = n;
  if (uSmoothFilter == 0) return true;
  float uu = u * float(TEXW) - 0.5;
  float vv = v * float(AROWS) - 0.5;
  float u0 = floor(uu);
  float v0 = floor(vv);
  float fu = uu - u0;
  float fv = vv - v0;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int dv = 0; dv < 2; dv++) {
    for (int du = 0; du < 2; du++) {
      int nx = clamp(int(u0) + du, 0, TEXW - 1);
      int ny = clamp(int(v0) + dv, 0, AROWS - 1);
      vec3 k;
      if (!texel(nx, ny, rowA, rowB, w, k)) continue;
      float wgt = (du == 1 ? fu : 1.0 - fu) * (dv == 1 ? fv : 1.0 - fv);
      acc += k * wgt;
      wsum += wgt;
    }
  }
  if (wsum > 0.0) c = acc / wsum;
  return true;
}
void main() {
  float xc = gl_FragCoord.x;
  float yc = uFb.y - gl_FragCoord.y;
  float u = (xc - vRect.x) / (vRect.z - vRect.x);
  float v = (yc - vRect.y) / (vRect.w - vRect.y);
  vec3 c;
  if (!sampleAt(u, v, vShade.x, vShade.y, vShade.z, c)) discard;
  if (vInfo.w >= 0.0 && uBeamFirst >= 0.0) {
    float o = ((floor(xc) + uPhase - uProj.z) / uProj.x) * ${f(colCentre)} + ${f(colCentre)};
    float bw;
    if (uSmoothShade == 1) bw = clamp(min(o - uBeamFirst, uBeamFirst + ${f(beamCols)} - o) + 0.5, 0.0, 1.0);
    else bw = (o >= uBeamFirst && o < uBeamFirst + ${f(beamCols)}) ? 1.0 : 0.0;
    if (bw > 0.0) {
      vec3 b;
      if (sampleAt(u, v, vInfo.w, vInfo.w, 0.0, b)) c = c * (1.0 - bw) + b * bw;
    }
  }
  if (vShadow > 0.5 && vShadow < 1.5) c = vec3(0.0); // 4.11 (draft 11): shadow - every drawn pixel opaque black, whatever the shade or the beam
  outColor = vec4(c, 1.0);
}
`;
}
interface Programs {
    readonly bg: WebGLProgram;
    readonly wall: WebGLProgram;
    readonly strip: WebGLProgram;
    readonly depth: WebGLProgram;
    readonly cab: WebGLProgram;
}
function cabVertex(): string {
    return `#version 300 es
precision highp float;
in vec3 aPos;
uniform vec2 uFb;
uniform vec4 uProj;
uniform vec4 uCam;
uniform float uEye;
uniform float uNear;
void main() {
  vec2 d = aPos.xy - uCam.xy;
  float F = d.x * uCam.z - d.y * uCam.w;
  float L = d.x * uCam.w + d.y * uCam.z;
  float cx = 2.0 * (uProj.z * F + uProj.x * L) / uFb.x - F;
  float cy = F - 2.0 * (uProj.w * F - uProj.y * (aPos.z - uEye)) / uFb.y;
  float cz = (F * (${FAR}.0 + uNear) - 2.0 * ${FAR}.0 * uNear) / (${FAR}.0 - uNear);
  gl_Position = vec4(cx, cy, cz, F);
}
`;
}
const CAB_FRAGMENT = `#version 300 es
precision highp float;
uniform vec3 uFill;
out vec4 outColor;
void main() { outColor = vec4(uFill, 1.0); }
`;
export function cabTriangles(snap: ViewSnapshot, st: HdStatics, C: HdConstants, params: HdParams): Float32Array {
    const sc = cabsOf(snap, st, C, params);
    if (sc === null)
        return new Float32Array(0);
    const S = 1 << st.R.CELL_SHIFT;
    const out: number[] = [];
    const quad = (p: ReadonlyArray<readonly [
        number,
        number,
        number
    ]>): void => { for (const i of [0, 1, 2, 0, 2, 3])
        out.push(...p[i]!); };
    for (const cab of sc.cabs) {
        const z0 = cab === sc.riding && params.cabSurfacesAtRest !== true ? -sc.shift : 0;
        const X = cab.cx * S;
        const Y = cab.cy * S;
        for (const z of [z0, z0 + S])
            quad([[X, Y, z], [X + S, Y, z], [X + S, Y + S, z], [X, Y + S, z]]);
    }
    const rc = sc.riding;
    if (rc !== null && sc.inside && rc.entrance !== null && params.doorway !== false) {
        const [x1, y1, x2, y2] = rc.entrance;
        quad([[x1, y1, S], [x2, y2, S], [x2, y2, FULL_HEIGHT], [x1, y1, FULL_HEIGHT]]);
        quad([[x1, y1, -FULL_HEIGHT], [x2, y2, -FULL_HEIGHT], [x2, y2, 0], [x1, y1, 0]]);
    }
    return Float32Array.from(out);
}
export class HdGl {
    private readonly gl: WebGL2RenderingContext;
    private programs: Programs | null = null;
    private programKey: object | null = null;
    private numbers: ShaderNumbers | null = null;
    private statics: HdStatics | null = null;
    private lastMeshSnap: ViewSnapshot | null = null;
    private lastMetaSnap: ViewSnapshot | null = null;
    private mesh: HdMesh | null = null;
    private skyPlaneFn: unknown = null;
    private skyExtRows = 0;
    private farSeen: FarLayer | null | undefined = undefined;
    private farOn = false;
    private betaKey: string | null = null;
    private betaN = 0;
    private readonly tex = new Map<string, WebGLTexture>();
    private faceVao: WebGLVertexArrayObject | null = null;
    private stripVao: WebGLVertexArrayObject | null = null;
    private faceBuf: WebGLBuffer | null = null;
    private stripBuf: WebGLBuffer | null = null;
    private emptyVao: WebGLVertexArrayObject | null = null;
    private texCount = 0;
    private bbEnv: BillboardEnv | null = null;
    private bbProgram: WebGLProgram | null = null;
    private bbProgramKey: object | null = null;
    private bbAtlas: ArtAtlas | null = null;
    private bbTables: TableSet | null = null;
    private bbAtlasVersion = -1;
    private bbTableVersion = -1;
    private bbVao: WebGLVertexArrayObject | null = null;
    private bbBuf: WebGLBuffer | null = null;
    billboardQuads = 0;
    meshBuilds = 0;
    static available(_canvas?: HTMLCanvasElement): boolean {
        if (availableCache !== null)
            return availableCache;
        try {
            const c = document.createElement("canvas");
            availableCache = c.getContext("webgl2") !== null;
        }
        catch {
            availableCache = false;
        }
        return availableCache;
    }
    constructor(readonly canvas: HTMLCanvasElement, private readonly C: HdConstants) {
        const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: true, depth: true });
        if (!gl)
            throw new Error("WebGL2 is not available");
        this.gl = gl;
        canvas.style.imageRendering = "pixelated";
    }
    private compile(type: number, src: string): WebGLShader {
        const gl = this.gl;
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
            throw new Error(`HD shader: ${gl.getShaderInfoLog(s) ?? "compile error"}`);
        return s;
    }
    private link(vs: string, fs: string, bindAttribs: boolean): WebGLProgram {
        const gl = this.gl;
        const p = gl.createProgram()!;
        gl.attachShader(p, this.compile(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, fs));
        if (bindAttribs)
            ["aAB", "aEZ", "aFW", "aU", "aHL"].forEach((n, i) => gl.bindAttribLocation(p, i, n));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            throw new Error(`HD program: ${gl.getProgramInfoLog(p) ?? "link error"}`);
        return p;
    }
    private linkCab(): WebGLProgram {
        const gl = this.gl;
        const p = gl.createProgram()!;
        gl.attachShader(p, this.compile(gl.VERTEX_SHADER, cabVertex()));
        gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, CAB_FRAGMENT));
        gl.bindAttribLocation(p, 0, "aPos");
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            throw new Error(`HD cab program: ${gl.getProgramInfoLog(p) ?? "link error"}`);
        return p;
    }
    private cabVao: WebGLVertexArrayObject | null = null;
    private cabBuf: WebGLBuffer | null = null;
    private shaderNumbers(st: HdStatics): ShaderNumbers {
        const R = st.R;
        const sky = st.sky;
        return {
            cell: 1 << R.CELL_SHIFT,
            texS: R.TEX_SIZE,
            texW: R.TEX_COLUMNS * 2,
            perRow: TEXTURES_PER_ROW,
            colCentre: R.COLUMN_CENTRE,
            bigHalf: R.BIG_HALF_ROWS,
            laneRows: R.VIEW_ROWS,
            bands: R.SHADE_BANDS,
            shadeK: R.STEP_NUMERATOR / (1 << (R.CELL_SHIFT - R.SIN_SHIFT)),
            perE: this.C.EYE.PER_E,
            beamCols: R.LIGHT.BEAM_COLUMNS,
            angles: R.ANGLES,
            sky: sky
                ? { VIEW_Y: sky.C.VIEW_Y, wPx: sky.C.PANORAMA_COLUMNS * sky.C.CELL, wPy: sky.C.PLANE_ROWS * sky.C.CELL, panRows: sky.C.PANORAMA_ROWS * sky.C.CELL, unitsRad: (2 * Math.PI) / R.ANGLES, halfW: sky.C.VIEW_W / 2 }
                : null,
        };
    }
    private ensurePrograms(st: HdStatics): Programs {
        if (this.programs && this.programKey === st.R && this.statics?.sky?.C === st.sky?.C)
            return this.programs;
        const N = this.shaderNumbers(st);
        this.numbers = N;
        const fullscreen = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }
`;
        this.programs = {
            bg: this.link(fullscreen, bgFragment(N), false),
            wall: this.link(vertexSource(), wallFragment(N), true),
            strip: this.link(vertexSource(), stripFragment(N), true),
            depth: this.link(vertexSource(), DEPTH_FRAGMENT, true),
            cab: this.linkCab(),
        };
        this.programKey = st.R;
        return this.programs;
    }
    setBillboards(env: BillboardEnv | null): void {
        if (env !== this.bbEnv) {
            this.bbEnv = env;
            this.bbAtlas = null;
            this.bbTables = null;
            this.bbAtlasVersion = -1;
            this.bbTableVersion = -1;
        }
    }
    private drawBillboards(snap: ViewSnapshot, st: HdStatics, params: HdParams, view: BillboardView, proj: readonly number[], area: HdArea): void {
        const B = this.bbEnv;
        this.billboardQuads = 0;
        if (B === null)
            return;
        const gl = this.gl;
        const C = this.C;
        if (this.bbProgramKey !== B.SC) {
            const p = gl.createProgram()!;
            gl.attachShader(p, this.compile(gl.VERTEX_SHADER, billboardVertex(C.BB_DEPTH_BIAS)));
            gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, billboardFragment(B.SC.ART_COLUMNS, B.SC.ART_ROWS, st.R.COLUMN_CENTRE, st.R.LIGHT.BEAM_COLUMNS)));
            ["aRect", "aInfo", "aShade"].forEach((n, i) => gl.bindAttribLocation(p, i, n));
            gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS))
                throw new Error(`HD billboard program: ${gl.getProgramInfoLog(p) ?? "link error"}`);
            this.bbProgram = p;
            this.bbProgramKey = B.SC;
        }
        this.bbAtlas ??= new ArtAtlas(B.SC);
        this.bbTables ??= new TableSet();
        const list = buildBillboardInstances(snap, B, view, C, params, this.bbAtlas, this.bbTables);
        const packed = packInstances(list, view.colW, view.rowH);
        this.billboardQuads = packed.count;
        if (packed.count === 0)
            return;
        if (this.bbAtlasVersion !== this.bbAtlas.version) {
            const a = this.bbAtlas.pack();
            this.uploadUint("bbArt", BB_ART_UNIT, a.width, a.height, a.data);
            this.bbAtlasVersion = this.bbAtlas.version;
        }
        if (this.bbTableVersion !== this.bbTables.version) {
            const t = this.bbTables.pack();
            this.uploadUint("bbTab", BB_TABLE_UNIT, t.width, t.height, t.data);
            this.bbTableVersion = this.bbTables.version;
        }
        if (!this.bbVao) {
            this.bbVao = gl.createVertexArray();
            this.bbBuf = gl.createBuffer();
        }
        const stride = BB_INSTANCE_FLOATS * BYTES_PER_FLOAT;
        gl.bindVertexArray(this.bbVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bbBuf);
        gl.bufferData(gl.ARRAY_BUFFER, packed.data, gl.DYNAMIC_DRAW);
        [0, 1, 2].forEach((i) => {
            gl.enableVertexAttribArray(i);
            gl.vertexAttribPointer(i, 4, gl.FLOAT, false, stride, i * 16);
            gl.vertexAttribDivisor(i, 1);
        });
        const p = this.bbProgram!;
        gl.useProgram(p);
        const u = (n: string): WebGLUniformLocation | null => gl.getUniformLocation(p, n);
        gl.uniform2f(u("uFb"), area.cols, area.rows);
        gl.uniform4f(u("uProj"), proj[0]!, proj[1]!, proj[2]!, proj[3]!);
        gl.uniform1f(u("uPhase"), area.colPhase ?? COLUMN_CENTRE_PHASE);
        gl.uniform1f(u("uNear"), C.NEAR);
        gl.uniform1i(u("uPal"), 4);
        gl.uniform1i(u("uArt"), BB_ART_UNIT);
        gl.uniform1i(u("uTab"), BB_TABLE_UNIT);
        gl.uniform1i(u("uSmoothShade"), params.smooth ? 1 : 0);
        gl.uniform1i(u("uSmoothFilter"), params.filter === "smooth" ? 1 : 0);
        gl.uniform1f(u("uBeamFirst"), snap.beam_first ?? -1);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        if (packed.floorCount > 0) {
            gl.depthMask(false);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, packed.floorCount);
        }
        gl.depthMask(true);
        if (packed.count > packed.floorCount) {
            [0, 1, 2].forEach((i) => gl.vertexAttribPointer(i, 4, gl.FLOAT, false, stride, packed.floorCount * stride + i * 16));
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, packed.count - packed.floorCount);
        }
        [0, 1, 2].forEach((i) => gl.vertexAttribDivisor(i, 0));
        gl.bindVertexArray(null);
    }
    private texture(name: string, unit: number): WebGLTexture {
        const gl = this.gl;
        let t = this.tex.get(name);
        if (!t) {
            t = gl.createTexture()!;
            this.tex.set(name, t);
        }
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }
    private uploadFloat(name: string, unit: number, w: number, h: number, data: Float32Array, channels: 1 | 4): void {
        const gl = this.gl;
        this.texture(name, unit);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        if (channels === 4)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
        else
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, data);
    }
    private uploadUint(name: string, unit: number, w: number, h: number, data: Uint8Array | Uint16Array): void {
        const gl = this.gl;
        this.texture(name, unit);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        if (data instanceof Uint8Array)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, w, h, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
        else
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, w, h, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, data);
    }
    private uploadAtlas(st: HdStatics): void {
        const R = st.R;
        const texW = R.TEX_COLUMNS * 2;
        const n = st.assets.textureCount;
        const rowsOfTex = Math.max(1, Math.ceil(n / TEXTURES_PER_ROW));
        const W = TEXTURES_PER_ROW * texW;
        const H = rowsOfTex * R.TEX_SIZE;
        const data = new Uint8Array(W * H);
        for (let t = 0; t < n; t++) {
            const ox = (t % TEXTURES_PER_ROW) * texW;
            const oy = Math.floor(t / TEXTURES_PER_ROW) * R.TEX_SIZE;
            for (let col = 0; col < R.TEX_COLUMNS; col++) {
                for (let row = 0; row < R.TEX_SIZE; row++) {
                    const byte = st.assets.textures[(t * R.TEX_COLUMNS + col) * R.TEX_SIZE + row]!;
                    data[(oy + row) * W + ox + 2 * col] = byte >> 4;
                    data[(oy + row) * W + ox + 2 * col + 1] = byte & 15;
                }
            }
        }
        this.uploadUint("atlas", 0, W, H, data);
        this.texCount = n;
    }
    private uploadSky(st: HdStatics, screen: HdScreen): void {
        const sky = st.sky;
        const plane = screen.skyPlane ?? sky?.plane ?? null;
        if (!sky || !plane)
            return;
        if (plane === this.skyPlaneFn)
            return;
        this.skyPlaneFn = plane;
        const W = sky.C.PANORAMA_COLUMNS * sky.C.CELL;
        const H = sky.C.PANORAMA_ROWS * sky.C.CELL;
        const ext = sky.ext && sky.ext.width === W ? sky.ext : null;
        const eRows = ext ? ext.rows : 0;
        const data = new Uint8Array(W * (H + eRows));
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++)
                data[y * W + x] = plane(x, y);
        if (ext)
            data.set(ext.data.subarray(0, W * eRows), W * H);
        this.skyExtRows = eRows;
        this.uploadUint("sky", 6, W, H + eRows, data);
    }
    private uploadFar(screen: HdScreen): void {
        const far = farLayerUsed(screen.far) ? screen.far : null;
        if (far === this.farSeen)
            return;
        this.farSeen = far;
        this.farOn = far !== null;
        if (far) {
            const t = packFarTexture(far);
            this.uploadUint("far", FAR_UNIT, t.width, t.height, t.data);
        }
        else
            this.uploadUint("far", FAR_UNIT, 1, 1, new Uint8Array(1));
    }
    private uploadLut(st: HdStatics, snap: ViewSnapshot): void {
        const R = st.R;
        const lutSet = R.WALL_LUT_SET_BY_MODE[snap.mode]!;
        const shaded = !snap.night && lutSet !== 0;
        const data = new Uint8Array(256 * (R.SHADE_BANDS + 1));
        for (let b = 0; b <= R.SHADE_BANDS; b++) {
            const lut = b > 0 && shaded ? st.assets.lut(lutSet, b) : null;
            for (let i = 0; i < 256; i++)
                data[b * 256 + i] = lut ? lut[i]! : i;
        }
        this.uploadUint("lut", LUT_UNIT, 256, R.SHADE_BANDS + 1, data);
        const fn = bandFunction(R.SHADE_BAND_BY_HEIGHT, false);
        const cMax = R.SHADE_BAND_BY_HEIGHT.length * 2 + 2;
        const n = cMax * BETA_STEPS_PER_UNIT + 2;
        const bo = new Float32Array(n);
        for (let i = 0; i < n; i++)
            bo[i] = fn(i / BETA_STEPS_PER_UNIT);
        this.uploadFloat("betaO", BETA_ORIG_UNIT, n, 1, bo, 1);
    }
    private uploadBeta(st: HdStatics, smooth: boolean): void {
        const key = smooth ? "s" : "b";
        if (this.betaKey === key && this.betaN > 0)
            return;
        const fn = bandFunction(st.R.SHADE_BAND_BY_HEIGHT, smooth);
        const cMax = st.R.SHADE_BAND_BY_HEIGHT.length * 2 + 2;
        const n = cMax * BETA_STEPS_PER_UNIT + 2;
        const data = new Float32Array(n);
        for (let i = 0; i < n; i++)
            data[i] = fn(i / BETA_STEPS_PER_UNIT);
        this.uploadFloat("beta", 3, n, 1, data, 1);
        this.betaKey = key;
        this.betaN = n;
    }
    private uploadMesh(mesh: HdMesh): void {
        const gl = this.gl;
        const stride = MESH_FLOATS * BYTES_PER_FLOAT;
        const setup = (vao: WebGLVertexArrayObject, buf: WebGLBuffer, data: Float32Array): void => {
            gl.bindVertexArray(vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
            [[4, 0], [2, 16], [2, 24], [2, 32], [2, 40]].forEach(([size, off], i) => {
                gl.enableVertexAttribArray(i);
                gl.vertexAttribPointer(i, size!, gl.FLOAT, false, stride, off!);
            });
        };
        if (!this.faceVao) {
            this.faceVao = gl.createVertexArray();
            this.stripVao = gl.createVertexArray();
            this.faceBuf = gl.createBuffer();
            this.stripBuf = gl.createBuffer();
            this.emptyVao = gl.createVertexArray();
        }
        setup(this.faceVao!, this.faceBuf!, mesh.faces);
        setup(this.stripVao!, this.stripBuf!, mesh.strips);
        gl.bindVertexArray(null);
        this.meshBuilds++;
    }
    draw(snap: ViewSnapshot, st: HdStatics, screen: HdScreen, params: HdParams, area: HdArea): void {
        const gl = this.gl;
        const C = this.C;
        const R = st.R;
        const progs = this.ensurePrograms(st);
        const N = this.numbers!;
        if (this.statics !== st) {
            this.uploadAtlas(st);
            this.skyPlaneFn = null;
            this.betaKey = null;
            this.lastMeshSnap = null;
            this.lastMetaSnap = null;
            this.statics = st;
        }
        if (this.canvas.width !== area.cols || this.canvas.height !== area.rows) {
            this.canvas.width = area.cols;
            this.canvas.height = area.rows;
        }
        if (meshChanged(this.lastMeshSnap, snap) || this.mesh === null) {
            this.mesh = buildHdMesh(snap, st, C, params);
            this.uploadMesh(this.mesh);
        }
        this.lastMeshSnap = snap;
        if (metatexChanged(this.lastMetaSnap, snap))
            this.uploadUint("meta", 1, METATEXTURE_SLOTS, snap.metatex.length / METATEXTURE_SLOTS, snap.metatex);
        this.lastMetaSnap = snap;
        this.uploadSky(st, screen);
        this.uploadBeta(st, params.smooth);
        this.uploadLut(st, snap);
        this.uploadFar(screen);
        const pal = paletteRgb(screen.palette);
        const palRgba = new Float32Array(64 * 4);
        for (let i = 0; i < 64; i++) {
            for (let k = 0; k < 3; k++)
                palRgba[4 * i + k] = pal[3 * i + k]! / 255;
            palRgba[4 * i + 3] = 1;
        }
        this.uploadFloat("pal", 4, 64, 1, palRgba, 4);
        const lanes = laneColours(snap, st, pal);
        const laneRgba = new Float32Array(R.VIEW_ROWS * 2 * 4);
        for (let r = 0; r < R.VIEW_ROWS; r++) {
            for (let k = 0; k < 3; k++)
                laneRgba[4 * r + k] = lanes.rgb[3 * r + k]! / 255;
            laneRgba[4 * r + 3] = lanes.opaque[r]!;
            const o = 4 * (R.VIEW_ROWS + r);
            for (let k = 0; k < 3; k++)
                laneRgba[o + k] = lanes.artRgb[3 * r + k]! / 255;
            laneRgba[o + 3] = lanes.artOpaque[r]!;
        }
        this.uploadFloat("lane", 5, R.VIEW_ROWS, 2, laneRgba, 4);
        const laneD0 = laneBeyondD0(lanes.E, R);
        const sh = shadeTables(snap, st, pal);
        const shRgba = new Float32Array(16 * (R.SHADE_BANDS + 1) * 4);
        sh.tables.forEach((t, b) => {
            for (let i = 0; i < 16; i++) {
                for (let k = 0; k < 3; k++)
                    shRgba[(b * 16 + i) * 4 + k] = t[3 * i + k]! / 255;
                shRgba[(b * 16 + i) * 4 + 3] = 1;
            }
        });
        this.uploadFloat("shade", 2, 16, R.SHADE_BANDS + 1, shRgba, 4);
        const fill = rampFillRgb(st, pal);
        const own = ownColumnTangents(R.COLUMN_ANGLES, R.ANGLES);
        const rays = Float32Array.from(originalRayPermits(snap, st, C));
        const edgeOn = params.beyondRows !== false && params.fillBeyond !== true;
        const edges = edgeOn ? beyondEdges(snap, st, screen, params, area, C) : null;
        const edgeData = new Float32Array(area.cols * 4);
        if (edges)
            for (let j = 0; j < area.cols; j++) {
                edgeData[4 * j] = edges.top[j]!;
                edgeData[4 * j + 1] = edges.bot[j]!;
            }
        this.uploadFloat("edge", EDGE_UNIT, area.cols, 1, edgeData, 4);
        const pr = hdProjection(params, area, C);
        const colW = area.width / area.cols;
        const rowH = area.height / area.rows;
        const proj = [pr.fx / colW, pr.fy / rowH, pr.cx / colW, pr.cy / rowH] as const;
        const a = (snap.cam.angle * 2 * Math.PI) / R.ANGLES;
        const sinA = Math.sin(a);
        const cosA = Math.cos(a);
        const eyeWalls = C.EYE.BASE + C.EYE.PER_E * snap.cam.eye_walls;
        const backdrop = [pal[3 * screen.backdrop]! / 255, pal[3 * screen.backdrop + 1]! / 255, pal[3 * screen.backdrop + 2]! / 255] as const;
        const skyOn = st.sky !== null && (screen.skyPlane ?? st.sky.plane) !== null && snap.sky.class !== null && snap.sky.vs !== null;
        const farMap = framingUniform(framingFor({ fx: pr.fx / colW, fy: pr.fy / rowH, cx: pr.cx / colW, cy: pr.cy / rowH }, frameGeometry(R)));
        const cabScene = cabsOf(snap, st, C, params);
        const ride = cabScene !== null && cabScene.riding !== null;
        const farShift = st.sky ? farSkyShift(st.sky.C, snap.cam.angle, screen.farHs ?? null) : 0;
        const skyBase = st.sky ? st.sky.C.VIEW_X - st.sky.C.SCROLL_BIAS + st.sky.C.SCROLL_FACTOR * snap.cam.angle + st.sky.C.VIEW_W / 2 : 0;
        gl.viewport(0, 0, area.cols, area.rows);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.depthMask(true);
        gl.clearDepth(1);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        const common = (p: WebGLProgram): void => {
            gl.useProgram(p);
            const u = (n: string): WebGLUniformLocation | null => gl.getUniformLocation(p, n);
            gl.uniform2f(u("uFb"), area.cols, area.rows);
            gl.uniform4f(u("uProj"), proj[0], proj[1], proj[2], proj[3]);
            gl.uniform1f(u("uPhase"), area.colPhase ?? COLUMN_CENTRE_PHASE);
            gl.uniform1i(u("uLane"), 5);
            gl.uniform2f(u("uLaneB"), lanes.E, laneD0);
            gl.uniform1i(u("uPal"), 4);
            gl.uniform1i(u("uSkyTex"), 6);
            gl.uniform4f(u("uSky"), skyOn ? 1 : 0, skyBase, snap.sky.vs ?? 0, params.skyCylinder === true ? 1 : 0);
            gl.uniform1f(u("uSkyExt"), this.skyExtRows);
            gl.uniform3f(u("uBackdrop"), backdrop[0], backdrop[1], backdrop[2]);
            gl.uniform1i(u("uFarTex"), FAR_UNIT);
            gl.uniform4f(u("uFarMap"), farMap[0], farMap[1], farMap[2], farMap[3]);
            gl.uniform2f(u("uFarOn"), this.farOn ? 1 : 0, params.filter === "smooth" ? 1 : 0);
            const farOrg = farOriginUniform(this.farSeen ?? null);
            gl.uniform4f(u("uFarOrg"), farOrg[0], farOrg[1], farOrg[2], farOrg[3]);
            const farMode = params.farByFraming === true ? 0 : params.farByAzimuth === true || params.skyCylinder === true ? 1 : 2;
            gl.uniform3f(u("uFarSky"), farMode, farMode === 2 ? farShift : colW / pr.fx, frameGeometry(R).hw / FRAMING_HALF_ANGLE);
            gl.uniform1f(u("uEye"), eyeWalls);
            gl.uniform1f(u("uCell"), N.cell);
            gl.uniform3f(u("uOwn"), own[0], own[1], params.fillBeyond === true ? 1 : 0);
            gl.uniform1f(u("uRayOn"), params.rayFill === false ? 0 : 1);
            gl.uniform1f(u("uWin"), params.cityWindow === false ? 0 : 1);
            gl.uniform1i(u("uEdge"), EDGE_UNIT);
            gl.uniform1f(u("uEdgeOn"), edgeOn ? 1 : 0);
            gl.uniform3fv(u("uRays"), rays);
            gl.uniform3f(u("uFill"), fill[0]! / 255, fill[1]! / 255, fill[2]! / 255);
            gl.uniform4f(u("uCam"), snap.cam.x, snap.cam.y, sinA, cosA);
            gl.uniform1f(u("uNear"), C.NEAR);
            gl.uniform3f(u("uRide"), ride ? 1 : 0, C.EYE.BASE + C.EYE.PER_E * snap.cam.eye_lanes, eyeWalls);
        };
        gl.disable(gl.DEPTH_TEST);
        common(progs.bg);
        gl.bindVertexArray(this.emptyVao ?? (this.emptyVao = gl.createVertexArray()));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.enable(gl.DEPTH_TEST);
        const ds = glDrawState(params);
        const depthFn = (d: GlDepthFunc): number => (d === "EQUAL" ? gl.EQUAL : gl.LEQUAL);
        gl.bindVertexArray(this.faceVao);
        for (const pass of ds.passes) {
            gl.depthFunc(depthFn(pass.depthFunc));
            gl.depthMask(pass.depthWrite);
            if (!pass.colour) {
                gl.colorMask(false, false, false, false);
                common(progs.depth);
                gl.uniform1i(gl.getUniformLocation(progs.depth, "uStrip"), 0);
                gl.uniform1f(gl.getUniformLocation(progs.depth, "uFull"), pass.extent === "all" ? 1 : 0);
                gl.drawArrays(gl.TRIANGLES, 0, this.mesh!.faceCount * 6);
                gl.colorMask(true, true, true, true);
                continue;
            }
            this.wallPass(progs, common, params, sh, snap, pass.extent === "all" ? 1 : 0, ds.stairFill === "word" ? 1 : 0);
            gl.bindVertexArray(this.faceVao);
            gl.drawArrays(gl.TRIANGLES, 0, this.mesh!.faceCount * 6);
        }
        gl.depthMask(true);
        gl.depthFunc(depthFn(ds.stripDepthFunc));
        if (this.mesh!.stripCount > 0) {
            common(progs.strip);
            gl.uniform1i(gl.getUniformLocation(progs.strip, "uStrip"), 1);
            gl.bindVertexArray(this.stripVao);
            gl.drawArrays(gl.TRIANGLES, 0, this.mesh!.stripCount * 6);
        }
        this.drawRest(snap, st, C, params, progs, common, pr, colW, rowH, proj, area);
    }
    private wallPass(progs: Programs, common: (p: WebGLProgram) => void, params: HdParams, sh: {
        shaded: boolean;
    }, snap: ViewSnapshot, full: number, stairWord: number): void {
        const gl = this.gl;
        common(progs.wall);
        const w = progs.wall;
        gl.uniform1f(gl.getUniformLocation(w, "uFull"), full);
        gl.uniform1f(gl.getUniformLocation(w, "uStairWord"), stairWord);
        gl.uniform1i(gl.getUniformLocation(w, "uStrip"), 0);
        gl.uniform1i(gl.getUniformLocation(w, "uAtlas"), 0);
        gl.uniform1i(gl.getUniformLocation(w, "uMeta"), 1);
        gl.uniform1i(gl.getUniformLocation(w, "uShade"), 2);
        gl.uniform1i(gl.getUniformLocation(w, "uBeta"), 3);
        gl.uniform1i(gl.getUniformLocation(w, "uLut"), LUT_UNIT);
        gl.uniform1i(gl.getUniformLocation(w, "uBetaO"), BETA_ORIG_UNIT);
        gl.uniform1i(gl.getUniformLocation(w, "uTexCount"), this.texCount);
        gl.uniform1i(gl.getUniformLocation(w, "uBetaN"), this.betaN);
        gl.uniform1i(gl.getUniformLocation(w, "uSmoothShade"), params.smooth ? 1 : 0);
        gl.uniform1i(gl.getUniformLocation(w, "uShaded"), sh.shaded ? 1 : 0);
        gl.uniform1i(gl.getUniformLocation(w, "uSmoothFilter"), params.filter === "smooth" ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(w, "uBeamFirst"), snap.beam_first ?? -1);
    }
    private drawRest(snap: ViewSnapshot, st: HdStatics, C: HdConstants, params: HdParams, progs: Programs, common: (p: WebGLProgram) => void, pr: {
        fx: number;
        fy: number;
        cx: number;
        cy: number;
    }, colW: number, rowH: number, proj: readonly [
        number,
        number,
        number,
        number
    ], area: HdArea): void {
        const gl = this.gl;
        const cabTri = cabTriangles(snap, st, C, params);
        if (cabTri.length > 0) {
            common(progs.cab);
            this.cabVao ??= gl.createVertexArray();
            this.cabBuf ??= gl.createBuffer();
            gl.bindVertexArray(this.cabVao);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.cabBuf);
            gl.bufferData(gl.ARRAY_BUFFER, cabTri, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 3 * BYTES_PER_FLOAT, 0);
            gl.drawArrays(gl.TRIANGLES, 0, cabTri.length / 3);
        }
        gl.bindVertexArray(null);
        this.drawBillboards(snap, st, params, { fx: pr.fx, fy: pr.fy, cx: pr.cx, cy: pr.cy, colW, rowH, cols: area.cols, rows: area.rows }, proj, area);
    }
    readRgba(): Uint8ClampedArray {
        const gl = this.gl;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const raw = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
        const out = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++)
            out.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
        return out;
    }
}
