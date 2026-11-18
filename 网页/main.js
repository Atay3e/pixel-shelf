// T134 作品货架 · 版本 A「暖木玩具柜」。
// 做法照自家 HD2D 样式：真 3D 场景整张按低分辨率（默认 320×180）渲染，阶梯光 + 限色 + 深度描边，最后最近邻放大到 1920×1080。
// v2（审核后）：正交镜头正对柜子，竖线是整列像素；1 世界单位 = 1 低清像素。网址参数 ?still 只画一帧。
// 第二阶段（2026-11-13）：点开（飞到中央、其余压暗、像素溶接进作品画面）、像素光标、上架片尾（SHELF 配置驱动）、
// 镜头推拉、巡演录制 ?tour=1。物件和柜子的样子沿用定稿 v4，没有重画（v4 原件另存 main-v4.js）。
import * as THREE from "./three.module.js";
import { RAMPS, PALETTE, PALETTE_HEX } from "./palette.js";

const Q = new URLSearchParams(location.search);
const LW = 320, LH = 180;
const W = 1920, H = 1080;
const STILL = Q.has("still");
const TOUR = Q.has("tour"); // ?tour=1：巡演录制，固定时钟逐帧走
const R = RAMPS;

// ---------- 渲染器 ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// ---------- 小工具 ----------
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];

const grad = new THREE.DataTexture(new Uint8Array([88, 150, 210, 255]), 4, 1, THREE.RedFormat);
grad.magFilter = grad.minFilter = THREE.NearestFilter;
grad.needsUpdate = true;

// noLine：细小的零件（唱臂、球网、迷宫墙）不描黑边，否则整根变成深色线
function toon(o = {}, noLine = false) {
  const m = new THREE.MeshToonMaterial({ gradientMap: grad, ...o });
  if (noLine) {
    m.blending = THREE.CustomBlending;
    m.blendSrc = m.blendSrcAlpha = THREE.OneFactor;
    m.blendDst = m.blendDstAlpha = THREE.ZeroFactor;
    m.opacity = 0.5;
  }
  return m;
}
const matCache = new Map();
function col(hex, noLine = false) {
  const k = hex + noLine;
  if (!matCache.has(k)) matCache.set(k, toon({ color: new THREE.Color(hex) }, noLine));
  return matCache.get(k);
}
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const P = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
function toMat(x, noLine) {
  if (x == null) return null;
  if (x.isMaterial) return x;
  if (x.isTexture) return toon({ map: x }, noLine);
  return col(x, noLine);
}
// 盒子：spec 可以是颜色、贴图、材质，或 {all,f,b,t,bo,l,r} 分面；y 是底面高度
function bx(parent, w, h, d, spec, x, y, z, noLine = false) {
  let m;
  if (typeof spec === "object" && !spec.isMaterial && !spec.isTexture) {
    const a = spec.all;
    m = [spec.r ?? a, spec.l ?? a, spec.t ?? a, spec.bo ?? a, spec.f ?? a, spec.b ?? a].map((s) => toMat(s, noLine));
  } else m = toMat(spec, noLine);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function put(parent, geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
// 木纹：一格 = 一个世界单位 ≈ 一个低清像素
function woodTex(w, h, ramp, vertical = false, base = 2) {
  return canvasTex(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), (g, W2, H2) => {
    P(g, ramp[base], 0, 0, W2, H2);
    const n = Math.round((W2 * H2) / 34);
    for (let i = 0; i < n; i++) {
      const len = 3 + Math.floor(rnd() * 10);
      g.fillStyle = rnd() < 0.62 ? ramp[base - 1] : ramp[base + 1];
      if (vertical) g.fillRect(Math.floor(rnd() * W2), Math.floor(rnd() * H2), 1, len);
      else g.fillRect(Math.floor(rnd() * W2), Math.floor(rnd() * H2), len, 1);
    }
  });
}
function woodBox(parent, w, h, d, x, y, z, ramp = R.walnut, vertical = false) {
  return bx(parent, w, h, d, {
    f: woodTex(w, h, ramp, vertical), b: woodTex(w, h, ramp, vertical),
    t: woodTex(w, d, ramp, false, 3), bo: woodTex(w, d, ramp),
    l: woodTex(d, h, ramp, vertical), r: woodTex(d, h, ramp, vertical),
  }, x, y, z);
}
function gearGeo(r, teeth, th = 1, hole = 0.35) {
  const s = new THREE.Shape(), n = teeth * 4, rIn = r - Math.max(0.8, r * 0.18);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, rr = Math.floor(i / 2) % 2 ? rIn : r;
    i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  if (hole) { const hp = new THREE.Path(); hp.absarc(0, 0, r * hole, 0, Math.PI * 2, true); s.holes.push(hp); }
  const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -th / 2);
  return g;
}
function flatIco(r, d) { const g = new THREE.IcosahedronGeometry(r, d); g.computeVertexNormals(); return g; }
function blob(parent, r, hex, x, y, z, s = [1, 1, 1]) {
  const g = new THREE.IcosahedronGeometry(r, 1); g.computeVertexNormals(); // 非索引几何，算出来就是面法线：一面一个色块
  const m = put(parent, g, toon({ color: new THREE.Color(hex) }), x, y, z);
  m.scale.set(...s);
  return m;
}


// ---------- 尺寸：1 个世界单位 = 1 个低清像素（横向严格；竖直面也正好 1:1，见镜头） ----------
// v3：格子加深到 40（物件转 20–25° 以后要占纵深），格高 37，腿和顶板各减 1–2 格，整柜仍完整入镜
const CIW = 84, CIH = 40, CD = 44, TS = 6, TB = 5, LEG = 4, CAP = 6, BACK = 2;
const CW = 3 * CIW + 4 * TS;                       // 276
const colX = (c) => -CW / 2 + TS + CIW / 2 + c * (CIW + TS); // -90 / 0 / 90
const rowY = (r) => LEG + TB + r * (CIH + TB);      // 9 / 51 / 93
const TOPY = LEG + TB + 3 * CIH + 2 * TB;           // 130
const ITEM_Z = -20;
const PITCH = (20 * Math.PI) / 180, TANP = Math.tan(PITCH);
// 晃动弹簧：2.6 Hz；阻尼按每件算（settleLimits 里），让每件从被碰到停住都是约 0.7 秒、摇两下左右
const W0 = 2 * Math.PI * 2.6, K = W0 * W0, STOP_T = 0.7;

// ---------- 柜子 ----------
const cab = new THREE.Group();
scene.add(cab);
for (let k = 0; k < 3; k++) woodBox(cab, CW - 2 * TS, TB, CD, 0, LEG + k * (CIH + TB), -CD / 2);
woodBox(cab, CW + 6, CAP, CD + BACK + 2, 0, TOPY, -(CD + BACK) / 2 + 1);
for (const s of [-1, 1]) woodBox(cab, TS, TOPY - LEG, CD, s * (CW / 2 - TS / 2), LEG, -CD / 2, R.walnut, true);
for (let r = 0; r < 3; r++) for (const c of [1, 2]) woodBox(cab, TS, CIH, CD, -CW / 2 + c * (CIW + TS) + TS / 2, rowY(r), -CD / 2, R.walnut, true);
bx(cab, CW, TOPY - LEG, BACK, R.walnut[1], 0, LEG, -CD - BACK / 2);
// 格里衬浅橡木竖板；四边往里压暗两档（像格子角落的环境遮蔽），整格台阶，不渐变
const plankTex = () => canvasTex(CIW, CIH, (g, w, h) => {
  for (let x = 0; x < w; x += 7) {
    P(g, pick([R.oak[3], R.oak[3], R.oak[2]]), x, 0, 7, h);
    for (let i = 0; i < 2; i++) P(g, pick([R.oak[2], R.oak[4]]), x + 2 + Math.floor(rnd() * 4), Math.floor(rnd() * h), 1, 3 + Math.floor(rnd() * 7));
    P(g, R.oak[1], x, 0, 1, h);
  }
  P(g, R.oak[1], 0, 0, w, 3); P(g, R.oak[0], 0, 0, w, 1);
  P(g, R.oak[1], 0, 0, 3, h); P(g, R.oak[1], w - 3, 0, 3, h); P(g, R.oak[0], 0, 0, 1, h); P(g, R.oak[0], w - 1, 0, 1, h);
});
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) bx(cab, CIW, CIH, 1, { all: R.oak[2], f: plankTex() }, colX(c), rowY(r), -CD + 0.5);
// 每格底板靠后和两边各压一条暗边（层板上的角落阴影）
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
  bx(cab, CIW, 0.2, 5, R.walnut[2], colX(c), rowY(r), -CD + 3.5, true).castShadow = false;
  for (const s of [-1, 1]) bx(cab, 3, 0.2, CD - 6, R.walnut[2], colX(c) + s * (CIW / 2 - 1.5), rowY(r), -CD / 2 - 3, true).castShadow = false;
}
for (const sx of [-1, 1]) for (const z of [-5, -CD + 5]) woodBox(cab, 5, LEG, 5, sx * (CW / 2 - 9), 0, z, R.walnut, true);
for (let k = 0; k < 3; k++) bx(cab, CW - 2 * TS, 1, 0.6, R.yellow[2], 0, LEG + k * (CIH + TB) + TB - 1, 0.3, true);

// ---------- 墙和地 ----------
const WALLZ = -CD - BACK - 0.5;
put(scene, new THREE.PlaneGeometry(800, 400), col("#dccbac"), 0, 200, WALLZ).castShadow = false;
bx(scene, 800, 8, 2, { all: R.cream[2], t: R.cream[4] }, 0, 0, WALLZ + 1);
const floorTex = canvasTex(120, 64, (g, w, h) => {
  for (let y = 0; y < h; y += 16) {
    const off = Math.floor(rnd() * 40);
    for (let x = -off; x < w; x += 60) {
      P(g, pick([R.honey[2], R.honey[1], R.honey[2]]), x, y, 60, 16);
      for (let i = 0; i < 10; i++) P(g, pick([R.honey[1], R.honey[3]]), x + Math.floor(rnd() * 55), y + 2 + Math.floor(rnd() * 13), 3 + Math.floor(rnd() * 9), 1);
      P(g, R.honey[1], x, y, 1, 16);
    }
    P(g, R.honey[1], 0, y, w, 1);
  }
});
floorTex.repeat.set(800 / 120, 400 / 64);
const floor = put(scene, new THREE.PlaneGeometry(800, 400), toon({ map: floorTex }), 0, 0, WALLZ + 200);
floor.rotation.x = -Math.PI / 2;
floor.castShadow = false;

// ---------- 台灯（柜顶右前） ----------
function WALLZ_OFF() { return CD + BACK + 0.5 - 2.5; }
const lamp = new THREE.Group();
lamp.position.set(100, TOPY + CAP, -4);
lamp.scale.setScalar(0.88);
scene.add(lamp);
put(lamp, new THREE.CylinderGeometry(7, 8, 2.5, 18), col(R.yellow[1]), 0, 1.25, 0);
put(lamp, new THREE.CylinderGeometry(7.2, 7.2, 0.6, 18), col(R.yellow[2]), 0, 2.6, 0);
// 灯杆：两节，中间一个关节往前探
const arm1 = bx(lamp, 1.8, 11, 1.8, R.yellow[0], 0, 2.5, 0, true); arm1.rotation.z = 0.12;
const joint = new THREE.Group(); joint.position.set(-1.3, 13.2, 0); lamp.add(joint);
put(joint, new THREE.SphereGeometry(1.4, 8, 6), col(R.yellow[1]), 0, 0, 0);
const arm2 = bx(joint, 1.6, 7, 1.6, R.yellow[0], 0, 0, 0, true); arm2.rotation.z = 0.55;
const shade = new THREE.Group();
shade.position.set(-5.2, 19.4, 1);
shade.rotation.set(0.2, 0, 0.5);
lamp.add(shade);
put(shade, new THREE.CylinderGeometry(3.8, 9.6, 8, 20, 1, true), toon({ color: new THREE.Color(R.yellow[3]) }), 0, 0, 0);
put(shade, new THREE.CylinderGeometry(3.7, 9.5, 7.9, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.62), side: THREE.BackSide }), 0, 0, 0).castShadow = false;
put(shade, new THREE.CylinderGeometry(4, 4, 1.2, 14), col(R.yellow[1]), 0, 4.4, 0);
put(shade, new THREE.SphereGeometry(2.4, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 1.0) }), 0, -2.6, 0).castShadow = false;
const rimGlow = put(shade, new THREE.TorusGeometry(9.2, 0.6, 4, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.2, 0.62) }), 0, -3.8, 0); rimGlow.rotation.x = Math.PI / 2; rimGlow.castShadow = false;
// 灯光放在罩子里偏后：顶板上一圈暖光，后墙上一整圈光晕（整圈在画面里）
const lampLight = new THREE.PointLight(0xffc477, 180, 0, 2);
lampLight.position.set(92, TOPY + CAP + 13, -6);
scene.add(lampLight);
// 墙上那圈光晕：一盏贴墙的小暖光，光圈落在顶板后沿和画面上沿之间
const WASH = 5; // v2 试过 8–20、离墙 3–8 格：要么是灯罩后面一小团发白的亮核，要么被灯罩挡住，都不比现在好，没改
const wallWash = new THREE.PointLight(0xffc477, WASH, 0, 2);
wallWash.position.set(88, TOPY + CAP + 6, -WALLZ_OFF());
scene.add(wallWash);

// ---------- 灯光：主光在右前上方（和台灯同侧），物件右面亮、左面暗一档 ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0xe6d6c4, 2.0));
const fill = new THREE.DirectionalLight(0xffffff, 0.45);
fill.position.set(-200, 60, 300);
scene.add(fill);
const key = new THREE.DirectionalLight(0xfffaf0, 1.55);
key.position.set(150, 220, 330);
key.target.position.set(0, 60, -20);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
Object.assign(key.shadow.camera, { left: -360, right: 360, top: 360, bottom: -360, near: 20, far: 1000 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.25;
scene.add(key, key.target);

// ---------- 8 个物件 ----------
// 每个物件：先正着搭，量好自己的包围盒（晃动支点用），再整件绕竖轴转 yaw，露出正面和一个侧面。
// inner 会晃：绕底角在画面里歪（roll）+ 前后点头（nod）+ 绕竖轴小转（turn），三者同一个弹簧带动；extras 不晃。
const items = [];
const NOD = 0.6, TURN = 2.4; // 点头、小转相对歪的比例：歪 3.4° 时点头 2°、小转 8°
function item(name, c, r, yaw, build, dz = 0) {
  const holder = new THREE.Group();
  holder.position.set(colX(c), rowY(r), ITEM_Z + dz);
  cab.add(holder);
  const inner = new THREE.Group();
  holder.add(inner);
  const extras = new THREE.Group();
  holder.add(extras);
  build(inner, extras);
  holder.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(holder.matrixWorld).invert();
  const local = new THREE.Box3().setFromObject(inner).applyMatrix4(inv);
  holder.rotation.y = yaw;
  const hit = new THREE.Mesh(new THREE.BoxGeometry(local.max.x - local.min.x, local.max.y - local.min.y, local.max.z - local.min.z), new THREE.MeshBasicMaterial());
  local.getCenter(hit.position);
  hit.visible = false;
  holder.add(hit);
  const it = { name, c, r, yaw, holder, inner, hit, box: local, hwL: -local.min.x, hwR: local.max.x, hdF: local.max.z, hdB: -local.min.z, h: local.max.y, maxAng: 0, ang: 0, vel: 0 };
  items.push(it);
  return it;
}
const _R = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _rp = new THREE.Vector3();
function applyTilt(it) {
  const a = it.ang, nod = NOD * Math.abs(a), turn = TURN * a;
  _e.set(nod, turn, a, "YXZ");
  _q.setFromEuler(_e);
  it.inner.quaternion.copy(_q);
  _p.set(a > 0 ? -it.hwL : it.hwR, 0, it.hdF); // 往哪边歪就绕那边的前下角；点头总是往前
  _rp.copy(_p).applyQuaternion(_q);
  it.inner.position.copy(_p).sub(_rp);
}
// 某个角度下，物件包围盒 8 个角在 3D 里离上层板多少、投到画面后离板下沿多少像素
const _c = new THREE.Vector3();
function gapAt(it, a) {
  const keep = it.ang; it.ang = a; applyTilt(it); it.holder.updateMatrixWorld(true);
  let top = -1e9, vis = -1e9;
  const b = it.box, base = rowY(it.r);
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    _c.set(x, y, z).applyMatrix4(it.inner.matrixWorld);
    top = Math.max(top, _c.y - base); vis = Math.max(vis, _c.y - base - _c.z * TANP);
  }
  it.ang = keep; applyTilt(it);
  return { gap3d: CIH - top, gapPx: CIH - vis };
}
function settleLimits() {
  for (const it of items) {
    let m = 0.06; // 歪的上限 3.4°（小转随之到 8°，点头 2°）
    const gapV = (a) => { it.ang = a; applyTilt(it); const g = vertGap(it); it.ang = 0; applyTilt(it); return g; };
    const ok = (a) => { const g1 = gapV(a), g2 = gapV(-a); return Math.min(g1[0], g2[0]) >= 1.5 && Math.min(g1[1], g2[1]) >= 2.5; };
    while (m > 0.005 && !ok(m)) m -= 0.005;
    it.maxAng = m;
    // 最远一点每弧度走多少像素（歪 + 小转都算）；阻尼让摆幅从 maxAng 衰减到 0.6 像素正好用 STOP_T 秒
    it.reach = Math.max(it.h, it.hwL + it.hwR, TURN * Math.max(it.hwL, it.hwR));
    it.zeta = Math.min(0.3, Math.max(0.04, Math.log(Math.max(1.2, (m * it.reach) / 0.6)) / (W0 * STOP_T)));
  }
}

const BUILD = {}; // 每个物件怎么搭；摆在哪一格、转多少，见后面的 SHELF
// T129 唱片机：斜放在小木楔上，唱片朝镜头；纹路在转，高光和标签不动
BUILD["唱片机"] = (g) => {
  const TILT = 0.36, D = 24, PW = 50;
  const back = D * Math.cos(TILT), hgt = D * Math.sin(TILT);
  const wedge = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(back - D / 2, 0), new THREE.Vector2(back - D / 2, hgt)]), { depth: PW - 6, bevelEnabled: false });
  wedge.translate(0, 0, -(PW - 6) / 2); wedge.rotateY(Math.PI / 2);
  put(g, wedge, col(R.walnut[1]), 0, 0, 0);
  const tilt = new THREE.Group(); tilt.position.set(0, 0, D / 2); tilt.rotation.x = TILT; g.add(tilt);
  const p = new THREE.Group(); p.position.set(0, 0, -D / 2); tilt.add(p);
  const wood = [R.red[0], R.orange[0], R.red[1], R.orange[1]];
  bx(p, PW, 6, D, { all: woodTex(PW, 6, wood, false, 1), t: woodTex(PW, D, wood, false, 1) }, 0, 0, 0);
  bx(p, PW, 1, 0.6, R.yellow[3], 0, 4.5, D / 2 + 0.1, true);
  const grooves = canvasTex(28, 28, (gg, w) => {
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - w / 2); P(gg, Math.floor(d / 2) % 2 ? R.black[0] : R.black[1], x, y); }
  });
  put(p, new THREE.CylinderGeometry(13, 13, 1.4, 40), [col(R.black[1]), toon({ map: grooves }), col(R.black[1])], -6, 6.8, 0).userData.spin = true;
  put(p, new THREE.CylinderGeometry(13.6, 13.6, 0.8, 40), col(R.grey[2]), -6, 6.3, 0);
  put(p, new THREE.CylinderGeometry(4.6, 4.6, 0.4, 24), col(R.cream[3], true), -6, 7.6, 0);
  put(p, new THREE.CylinderGeometry(1.6, 1.6, 0.5, 12), col(R.red[2], true), -4.6, 7.7, -1.6);
  // 不动的高光：一道斜的灰弧
  const sheen = bx(p, 1.2, 0.2, 9, R.grey[2], -6 - 7.5, 7.6, -3, true); sheen.rotation.y = -0.7;
  put(p, new THREE.CylinderGeometry(1.8, 2, 3, 10), col(R.grey[4]), 16, 7.5, -7);
  const arm = new THREE.Group(); arm.position.set(16, 9.2, -7); arm.rotation.y = -2.5; p.add(arm);
  bx(arm, 19, 1, 1, R.yellow[3], 9.5, -0.5, 0, true);
  bx(arm, 3, 1.2, 2.4, R.yellow[2], 19, -1, 0, true);
  put(arm, new THREE.CylinderGeometry(1.6, 1.6, 3, 10).rotateZ(Math.PI / 2), col(R.grey[3]), -3, 0, 0);
  put(p, new THREE.CylinderGeometry(1.7, 1.7, 1.4, 12), col(R.yellow[1]), -20, 6.6, 8);
  put(p, new THREE.CylinderGeometry(1.7, 1.7, 1.4, 12), col(R.yellow[1]), 16, 6.6, 7);
};

// T123 漂浮小屋：小剧场模型——后面立一块日落背景板（天、太阳、云、地平线、远海），
// 前面一片薄薄的海面一直接到背景板的海，米白小楼泡在海里，楼顶红砖小屋、热水器水箱、栏杆、红布
BUILD["漂浮小屋"] = (g) => {
  const BW = 56, BD = 22, BH = 17;
  bx(g, BW, 2, BD, { all: R.walnut[2], t: R.walnut[3] }, 0, 0, 0);
  const sky = canvasTex(BW - 2, BH, (gg, w, h) => {
    const HZN = 10;
    const bands = [R.sea[2], R.sea[2], R.sea[3], R.sea[3], R.sea[4], R.sea[4], R.yellow[5], R.yellow[5], R.yellow[4], R.yellow[4]];
    for (let y = 0; y < HZN; y++) P(gg, bands[y], 0, y, w, 1);
    // 太阳：一半落在地平线上
    for (let y = 5; y < HZN; y++) for (let x = 30; x < 42; x++) if (Math.hypot(x + 0.5 - 36, y + 0.5 - HZN) < 5.2) P(gg, R.yellow[3], x, y);
    // 两朵云
    for (const [cx, cy, cw] of [[8, 3, 9], [44, 2, 7]]) { P(gg, R.sea[4], cx, cy, cw, 1); P(gg, R.sea[4], cx + 2, cy - 1, cw - 4, 1); P(gg, R.cream[4], cx + 1, cy, cw - 3, 1); }
    // 地平线以下：远海，越近越深，太阳下面一条金光
    for (let y = HZN; y < h; y++) P(gg, y < HZN + 2 ? R.sea[2] : y < HZN + 5 ? R.sea[1] : R.sea[1], 0, y, w, 1);
    P(gg, R.sea[0], 0, HZN, w, 1);
    for (let y = HZN + 1; y < h; y++) if (y % 2) P(gg, R.yellow[4], 34 + (y % 4 === 1 ? 0 : 1), y, 4 - ((y - HZN) >> 2), 1);
    for (const [y, x0, x1] of [[HZN + 3, 4, 14], [HZN + 5, 18, 26], [HZN + 6, 44, 52]]) P(gg, R.sea[2], x0, y, x1 - x0, 1);
  });
  bx(g, BW - 2, BH, 1.5, { all: R.walnut[2], f: sky }, 0, 2, -BD / 2 + 1.5, true); // 背景板不描内线，海面和远海接缝处不出黑点
  // 前面的海面：薄、宽，短亮浪线不规则，楼前有一片断开的倒影
  const SD = BD - 3;
  const seaTop = canvasTex(BW - 2, SD, (gg, w, h) => {
    P(gg, R.sea[1], 0, 0, w, h);
    for (let i = 0; i < 20; i++) P(gg, R.sea[2], Math.floor(rnd() * w), Math.floor(rnd() * h), 2 + Math.floor(rnd() * 4), 1);
    for (let i = 0; i < 9; i++) P(gg, R.sea[3], 2 + Math.floor(rnd() * (w - 8)), 1 + Math.floor(rnd() * (h - 2)), 2 + Math.floor(rnd() * 3), 1);
    for (let y = 13; y < h; y++) if (y % 2 === 0) P(gg, y < 16 ? R.cream[2] : R.red[3], 10 + (y % 4 ? 1 : 0), y, 14 - (y - 13), 1);
    for (let y = 0; y < h; y++) if (y % 2) P(gg, R.yellow[4], 39 + (y % 4 === 1 ? 0 : 1), y, 2, 1);
  });
  const seaSide = (w) => canvasTex(w, 3, (gg) => { P(gg, R.sea[2], 0, 0, w, 1); P(gg, R.sea[0], 0, 1, w, 2); });
  bx(g, BW - 2, 3, SD, { t: seaTop, f: seaSide(BW - 2), l: seaSide(SD), r: seaSide(SD), b: R.sea[0], bo: R.sea[0] }, 0, 2, 1.5);
  const house = new THREE.Group(); house.position.set(-9, 4.2, 2); house.rotation.y = 0.55; g.add(house);
  const wall = (w, wins, door) => canvasTex(w, 8, (gg) => {
    P(gg, R.cream[3], 0, 0, w, 8); P(gg, R.cream[4], 0, 0, w, 1); P(gg, R.cream[1], 0, 6, w, 1); P(gg, R.sea[2], 0, 7, w, 1);
    wins.forEach((x) => { P(gg, R.walnut[2], x, 2, 4, 3); P(gg, R.yellow[4], x + 1, 3, 2, 1); });
    if (door != null) { P(gg, R.walnut[2], door, 2, 3, 5); P(gg, R.walnut[1], door, 2, 3, 1); }
  });
  bx(house, 22, 8, 11, { all: R.cream[2], t: R.cream[2], f: wall(22, [2, 9, 16]), l: wall(11, [], 4), r: wall(11, [4]), b: wall(22, [9]) }, 0, 0, 0);
  bx(house, 24, 0.4, 13, R.sea[3], 0, -0.2, 0, true); // 楼脚一圈浅水线
  const RY = 8;
  for (const [w, dd, x, z] of [[22, 0.7, 0, 5.2], [0.7, 10.4, -10.7, 0], [0.7, 10.4, 10.7, 0]]) bx(house, w, 0.7, dd, R.walnut[3], x, RY + 2, z, true);
  for (let x = -10.7; x <= 10.8; x += 3.56) bx(house, 0.7, 2.7, 0.7, R.walnut[2], x, RY, 5.2, true);
  bx(house, 4, 3, 0.4, R.red[2], 7, RY - 0.6, 5.6, true);
  const brick = (w, h, door) => canvasTex(w, h, (gg) => {
    P(gg, R.red[2], 0, 0, w, h);
    for (let y = 1; y < h; y += 2) { P(gg, R.red[1], 0, y, w, 1); for (let x = (y % 4 === 1 ? 1 : 3); x < w; x += 4) P(gg, R.red[1], x, y - 1, 1, 1); }
    if (door) { P(gg, R.walnut[1], 2, 1, 3, h - 1); P(gg, R.cream[4], 7, 1, 2, 2); }
  });
  bx(house, 9, 5, 6, { all: brick(6, 5), f: brick(9, 5, true), t: R.grey[2] }, -5, RY, -2);
  bx(house, 10.5, 0.8, 7.5, R.red[1], -5, RY + 5, -2);
  // 热水器只留剪影：斜板 + 横放的白水箱（不要格栅笼子）
  const sol = new THREE.Group(); sol.position.set(6, RY, -2.5); house.add(sol);
  const pnl = bx(sol, 7, 0.6, 5, R.grey[2], 0, 1, 0, true); pnl.rotation.x = 0.55;
  put(sol, new THREE.CylinderGeometry(1.4, 1.4, 8, 12).rotateZ(Math.PI / 2), col(R.grey[5]), 0, 3.6, -2.4);
  blob(house, 1.3, R.green[3], -9.4, RY + 1.2, 3.6);
};

// T124 篮球框上传：杆子从小底座撑起白篮板（上传图标），橙框白网；旁边一团纸
BUILD["篮球框"] = (g, ex) => {
  const X = 6;
  // 杆在篮板右边整根露出来：小底座 → 立杆 → 一根横臂伸到篮板背后
  bx(g, 9, 2.5, 9, { all: R.yellow[1], t: R.yellow[2] }, X + 21, 0, -3);
  bx(g, 2.4, 16, 2.4, R.grey[1], X + 21, 2.5, -3);
  bx(g, 7, 2.2, 2, R.grey[1], X + 17.5, 15, -3.5);
  const board = canvasTex(32, 14, (gg) => {
    P(gg, R.grey[5], 0, 0, 32, 14);
    P(gg, R.grey[3], 0, 0, 32, 1); P(gg, R.grey[3], 0, 13, 32, 1); P(gg, R.grey[3], 0, 0, 1, 14); P(gg, R.grey[3], 31, 0, 1, 14);
    const k = R.grey[1];
    P(gg, k, 15, 3, 2, 6); P(gg, k, 14, 4, 4, 1); P(gg, k, 13, 5, 2, 1); P(gg, k, 17, 5, 2, 1); P(gg, k, 12, 6, 1, 1); P(gg, k, 19, 6, 1, 1);
    P(gg, k, 10, 7, 1, 4); P(gg, k, 21, 7, 1, 4); P(gg, k, 10, 10, 12, 1);
  });
  bx(g, 32, 14, 1.4, { all: R.grey[4], f: board }, X, 9, -2.5);
  const rim = put(g, new THREE.TorusGeometry(9, 0.75, 6, 28), col(R.orange[2], true), X, 9.4, 7.5);
  rim.rotation.x = Math.PI / 2;
  const netTex = canvasTex(48, 11, (gg) => {
    for (let y = 0; y < 11; y++) for (let x = 0; x < 48; x++) if (y === 0 || (x + y) % 3 === 0 || (x - y + 48) % 3 === 0) P(gg, R.grey[5], x, y);
    P(gg, R.grey[5], 0, 10, 48, 1);
  });
  put(g, new THREE.CylinderGeometry(8.8, 5, 8.6, 24, 1, true), toon({ map: netTex, alphaTest: 0.5, side: THREE.FrontSide }, true), X, 5.1, 7.5);
  const pg = new THREE.IcosahedronGeometry(4.6, 1), pos = pg.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const hsh = Math.sin(Math.round(v.x * 100) * 12.9898 + Math.round(v.y * 100) * 78.233 + Math.round(v.z * 100) * 37.719) * 43758.5453;
    v.multiplyScalar(0.72 + 0.4 * (hsh - Math.floor(hsh)));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pg.computeVertexNormals();
  const cols = [];
  for (let f = 0; f < pos.count / 3; f++) { const c = new THREE.Color(f % 5 === 0 || f % 7 === 3 ? R.grey[3] : R.cream[4]); for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b); }
  pg.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  const paper = put(ex, pg, toon({ vertexColors: true }), -27, 3.8, 1);
  paper.rotation.set(0.3, 0.7, 0.1);
};

// T128 无限迷宫：一块扁长的迷宫块，正面和两侧是凸起的墙，顶面是画上去的迷宫，路里一颗暖光小珠
BUILD["迷宫"] = (g) => {
  const SX = 49, SY = 17, SZ = 17, CELL = 4, WH = 1.5;
  const mazeEdges = (nx, ny) => {
    const vis = Array.from({ length: ny }, () => Array(nx).fill(false));
    const hW = Array.from({ length: ny + 1 }, () => Array(nx).fill(true));
    const vW = Array.from({ length: ny }, () => Array(nx + 1).fill(true));
    const st = [[0, 0]]; vis[0][0] = true;
    while (st.length) {
      const [i, j] = st[st.length - 1];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [i + a, j + b, a, b]).filter(([x, y]) => x >= 0 && y >= 0 && x < nx && y < ny && !vis[y][x]);
      if (!nb.length) { st.pop(); continue; }
      const [x, y, a, b] = pick(nb);
      if (a === 1) vW[j][i + 1] = false; if (a === -1) vW[j][i] = false;
      if (b === 1) hW[j + 1][i] = false; if (b === -1) hW[j][i] = false;
      vis[y][x] = true; st.push([x, y]);
    }
    const rects = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) if (hW[j][i]) rects.push([i * CELL, j * CELL, CELL + 1, 1]);
    for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) if (vW[j][i]) rects.push([i * CELL, j * CELL, 1, CELL + 1]);
    return rects;
  };
  const topTex = canvasTex(SX, SZ, (gg) => { P(gg, R.khaki[1], 0, 0, SX, SZ); mazeEdges(12, 4).forEach(([u, v, du, dv]) => P(gg, R.khaki[3], u, v, du, dv)); });
  bx(g, SX, SY, SZ, { all: R.khaki[1], t: topTex }, 0, 0, 0);
  const faces = [
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], a: SX, b: SY, off: SZ / 2, nx: 12, ny: 4 },
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], a: SZ, b: SY, off: SX / 2, nx: 4, ny: 4 },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], a: SZ, b: SY, off: SX / 2, nx: 4, ny: 4 },
  ];
  const rects = [];
  faces.forEach((f, fi) => mazeEdges(f.nx, f.ny).forEach((r) => rects.push([fi, ...r])));
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), col(R.khaki[3], true), rects.length);
  const m4 = new THREE.Matrix4(), V = (a) => new THREE.Vector3(...a);
  rects.forEach(([fi, u0, v0, du, dv], k) => {
    const f = faces[fi], u = V(f.u), v = V(f.v), n = V(f.n);
    const c = n.clone().multiplyScalar(f.off + WH / 2).add(u.clone().multiplyScalar(u0 + du / 2 - f.a / 2)).add(v.clone().multiplyScalar(v0 + dv / 2 - f.b / 2));
    m4.makeBasis(u.clone().multiplyScalar(du), v.clone().multiplyScalar(dv), n.clone().multiplyScalar(WH)).setPosition(c.x, c.y + SY / 2, c.z);
    inst.setMatrixAt(k, m4);
  });
  inst.castShadow = inst.receiveShadow = true;
  g.add(inst);
  put(g, new THREE.BoxGeometry(2, 2, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.15, 0.5) }), -SX / 2 + 2.5 + CELL * 5, 2.5 + CELL, SZ / 2 + 0.7).castShadow = false;
};

// T120 三渲二小建筑：灰色街角底座带斑马线、橘色两层小楼、亮灯的窗、条纹雨棚、一棵树、一个红邮筒
BUILD["小建筑"] = (g) => {
  const baseTop = canvasTex(50, 20, (gg) => {
    P(gg, R.grey[4], 0, 0, 50, 20);
    for (let x = 0; x < 50; x += 6) P(gg, R.grey[3], x, 0, 1, 13);
    P(gg, R.grey[3], 0, 12, 50, 1);
    P(gg, R.grey[2], 0, 13, 50, 7);
    for (let x = 20; x < 40; x += 4) P(gg, R.grey[5], x, 14, 2, 5);
  });
  bx(g, 50, 3, 20, { all: R.grey[3], t: baseTop, f: canvasTex(50, 3, (gg) => { P(gg, R.grey[2], 0, 0, 50, 3); P(gg, R.grey[3], 0, 0, 50, 1); }) }, 0, 0, 0);
  const BW = 26, BH = 17, BD = 11;
  const front = canvasTex(BW, BH, (gg) => {
    P(gg, R.orange[3], 0, 0, BW, 8);
    for (const x of [2, 8, 14, 20]) { P(gg, R.walnut[2], x, 2, 1, 4); P(gg, R.walnut[2], x + 3, 2, 1, 4); P(gg, R.yellow[4], x + 1, 2, 2, 4); P(gg, R.yellow[2], x + 1, 4, 2, 2); P(gg, R.orange[1], x, 6, 4, 1); }
    P(gg, R.orange[1], 0, 8, BW, 1);
    P(gg, R.cream[2], 0, 9, BW, 8);
    P(gg, R.grey[1], 2, 10, 13, 7); P(gg, R.black[2], 3, 11, 11, 6);
    P(gg, R.yellow[2], 3, 13, 11, 1); P(gg, R.yellow[4], 4, 12, 2, 1); P(gg, R.orange[2], 7, 12, 3, 1); P(gg, R.sea[2], 11, 12, 2, 1);
    P(gg, R.walnut[3], 18, 10, 5, 7); P(gg, R.walnut[2], 18, 10, 5, 1); P(gg, R.yellow[3], 21, 13, 1, 1);
  });
  const side = canvasTex(BD, BH, (gg) => {
    P(gg, R.orange[2], 0, 0, BD, 8); P(gg, R.cream[1], 0, 9, BD, 8); P(gg, R.orange[0], 0, 8, BD, 1);
    P(gg, R.walnut[2], 3, 2, 5, 4); P(gg, R.yellow[4], 4, 2, 3, 4); P(gg, R.cream[0], 2, 11, 7, 4);
  });
  bx(g, BW, BH, BD, { all: R.orange[2], f: front, r: side, l: side, t: R.cream[2] }, 6, 3, -3.5);
  for (const [w, d, x, z] of [[BW, 1, 6, 1.5], [BW, 1, 6, -8.5], [1, 9, -6.5, -3.5], [1, 9, 18.5, -3.5]]) bx(g, w, 1.4, d, R.cream[4], x, 3 + BH, z, true);
  bx(g, 3.6, 2.2, 2.6, R.grey[4], 14, 3 + BH, -1);
  put(g, new THREE.CylinderGeometry(1.5, 1.5, 2.6, 10), col(R.grey[5]), 0, 3 + BH + 1.3, -1);
  const stripes = canvasTex(BW, 4, (gg) => { for (let x = 0; x < BW; x++) P(gg, x % 4 < 2 ? R.orange[2] : R.cream[4], x, 0, 1, 4); });
  const awn = bx(g, 16, 0.8, 4.5, { all: stripes }, 2.5, 3 + 9.2, 4);
  awn.rotation.x = 0.42;
  bx(g, 2, 6, 2, R.walnut[2], -17, 3, 3);
  blob(g, 5, R.green[3], -17, 12.6, 3, [1, 0.88, 1]);
  blob(g, 3.2, R.green[2], -19.4, 10.4, 5);
  blob(g, 2.8, R.green[4], -15.2, 15.6, 2);
  bx(g, 3, 5, 3, { all: R.red[2], t: R.red[3] }, 21.5, 3, 5);
};

// T117 机械表：立在黄铜托上，左半米白表盘、右半露两只齿轮（一大一小、齿大、错开），中间一道深缝；
// 托前放着拆下来的表冠和一个小齿轮
BUILD["机械表"] = (g, ex) => {
  bx(ex, 50, 3, 12, { all: R.yellow[1], t: R.yellow[2], f: canvasTex(50, 3, (gg) => { P(gg, R.yellow[1], 0, 0, 50, 3); P(gg, R.yellow[3], 0, 0, 50, 1); }) }, 0, 0, -1);
  const w = new THREE.Group(); w.position.set(-4, 13.4, 0); g.add(w);
  const RW = 12;
  put(w, new THREE.CylinderGeometry(RW, RW, 4.5, 36).rotateX(Math.PI / 2), col(R.grey[4]), 0, 0, -0.8);
  // 表壳侧面一圈刻纹（转角以后看得见）
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; bx(w, 0.6, 0.6, 3.6, R.grey[2], Math.cos(a) * (RW + 0.1), Math.sin(a) * (RW + 0.1) - 0.3, -0.8, true).rotation.z = a; }
  put(w, new THREE.CylinderGeometry(RW - 1.4, RW - 1.4, 0.4, 36).rotateX(Math.PI / 2), col(R.black[1]), 0, 0, 1.5);
  put(w, new THREE.TorusGeometry(RW - 0.7, 1, 6, 36), col(R.grey[5]), 0, 0, 1.55);
  put(w, new THREE.CircleGeometry(RW - 1.6, 28, Math.PI / 2 + 0.06, Math.PI - 0.12), col(R.cream[4], true), -0.6, 0, 1.8).castShadow = false;
  bx(w, 1, 2 * RW - 3, 0.4, R.black[0], -0.1, -(RW - 1.5), 1.85, true);
  for (const a of [90, 135, 180, 225, 270]) {
    const rad = (a * Math.PI) / 180, r = RW - 3.4;
    bx(w, a % 90 ? 1 : 1.4, a % 90 ? 1 : 2, 0.4, R.grey[0], Math.cos(rad) * r - 0.6, Math.sin(rad) * r - 1, 2, true).rotation.z = rad - Math.PI / 2;
  }
  const hand = (len, a) => { const hg = new THREE.Group(); hg.position.set(-0.6, 0, 2.2); hg.rotation.z = a; w.add(hg); bx(hg, 1, len, 0.3, R.grey[0], 0, 0, 0, true); };
  hand(7.5, 0.7); hand(5, 1.9);
  // 两只齿轮：大的占右半表盘大部分（9 个大齿），小的在右下（6 个大齿），只咬一点点
  const bigGear = (r, n, x, y, z, hex, rot) => {
    const s = new THREE.Shape(), rIn = r - 1.6;
    for (let i = 0; i <= n * 4; i++) { const a = (i / (n * 4)) * Math.PI * 2 + rot, rr = Math.floor(i / 2) % 2 ? rIn : r; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.42, 0, Math.PI * 2, true); s.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 8 }); geo.translate(0, 0, -0.5);
    put(w, geo, col(hex, true), x, y, z);
    put(w, new THREE.CylinderGeometry(r * 0.42, r * 0.42, 0.4, 16).rotateX(Math.PI / 2), col(R.black[1], true), x, y, z - 0.3);
    put(w, new THREE.CylinderGeometry(1.2, 1.2, 1.2, 10).rotateX(Math.PI / 2), col(R.red[2], true), x, y, z + 0.4);
  };
  bigGear(5.4, 9, 4.8, 2.4, 2.2, R.yellow[3], 0.1);
  bigGear(3.3, 6, 3.8, -5.6, 2.6, R.orange[3], 0.3);
  put(w, new THREE.CylinderGeometry(1.6, 1.6, 2.6, 10), col(R.grey[3]), 0, RW + 0.9, -0.8);
  // 托前：拆下的表冠（横放的小圆柱）和一个小齿轮
  put(ex, new THREE.CylinderGeometry(1.8, 1.8, 3, 12).rotateZ(Math.PI / 2), col(R.grey[4]), 16, 4.8, 3);
  put(ex, new THREE.CylinderGeometry(1, 1, 2, 8).rotateZ(Math.PI / 2), col(R.grey[3]), 18.6, 4.8, 3);
  const lg = put(ex, gearGeo(3.6, 7, 1), col(R.yellow[3]), -20, 3.6 + 3.6, 3);
  lg.rotation.x = -0.2;
  put(ex, new THREE.CylinderGeometry(1, 1, 0.6, 8).rotateX(Math.PI / 2), col(R.black[1]), -20, 7.3, 3.6).rotation.x = -0.2;
};

// T112 像素办公室：小木桌、显示器、盆栽，一个大头小身的方块小人举着手
BUILD["像素办公室"] = (g) => {
  bx(g, 32, 1.6, 13, { all: R.honey[2], t: woodTex(32, 13, R.honey, false, 3) }, 8, 10, -2);
  for (const [x, z] of [[-6.5, 3.5], [22.5, 3.5], [-6.5, -7.5], [22.5, -7.5]]) bx(g, 1.6, 10, 1.6, R.honey[1], x, 0, z);
  const screen = canvasTex(14, 9, (gg) => {
    P(gg, R.grey[0], 0, 0, 14, 9); P(gg, R.black[1], 1, 1, 12, 7);
    P(gg, R.green[3], 2, 2, 6, 1); P(gg, R.yellow[3], 3, 4, 4, 1); P(gg, R.green[3], 8, 4, 3, 1); P(gg, R.cream[3], 3, 6, 6, 1);
  });
  bx(g, 14, 9, 1.4, { all: R.grey[0], f: screen }, 9, 14, -5);
  bx(g, 1.6, 2.4, 1.4, R.grey[1], 9, 11.6, -5.8);
  bx(g, 6, 0.6, 3.4, R.grey[1], 9, 11.6, -5.8);
  bx(g, 8, 0.8, 3, R.grey[4], 8, 11.6, 1.2);
  bx(g, 4, 4, 4, { all: R.orange[1], t: R.walnut[1] }, 20, 11.6, -4);
  blob(g, 2.6, R.green[3], 20, 17.4, -4); blob(g, 1.9, R.green[2], 21.5, 19, -3); blob(g, 1.7, R.green[4], 18.6, 19.4, -4.6);
  const pp = new THREE.Group(); pp.position.set(-18, 0, 3); pp.rotation.y = -0.2; g.add(pp);
  const face = canvasTex(11, 10, (gg) => {
    P(gg, R.skin[1], 0, 0, 11, 10);
    P(gg, R.black[1], 0, 0, 11, 3); P(gg, R.black[1], 0, 3, 2, 5); P(gg, R.black[1], 9, 3, 2, 5);
    P(gg, R.black[1], 2, 3, 2, 1); P(gg, R.black[1], 6, 3, 3, 1);
    P(gg, R.black[0], 3, 5, 2, 2); P(gg, R.black[0], 6, 5, 2, 2);
    P(gg, R.sea[3], 2, 7, 1, 1); P(gg, R.sea[3], 8, 7, 1, 1); P(gg, R.red[2], 5, 8, 1, 1);
  });
  const hairSide = canvasTex(9, 10, (gg) => { P(gg, R.black[1], 0, 0, 9, 10); P(gg, R.skin[0], 3, 5, 2, 2); });
  bx(pp, 11, 10, 9, { all: R.black[1], f: face, l: hairSide, r: hairSide }, 0, 10, 0);
  bx(pp, 12, 2.4, 10, { all: R.red[2], t: R.red[3] }, 0, 20, 0);
  bx(pp, 8, 1, 4, R.red[1], 0, 20, 6.4);
  const shirt = canvasTex(7, 5, (gg) => { P(gg, R.grey[5], 0, 0, 7, 5); P(gg, R.red[2], 3, 0, 1, 3); P(gg, R.grey[4], 0, 4, 7, 1); });
  bx(pp, 7, 5, 4.4, { all: R.grey[5], f: shirt }, 0, 5.6, 0);
  bx(pp, 7.4, 2.4, 4.8, R.black[1], 0, 3.4, 0);
  for (const x of [-1.8, 1.8]) { bx(pp, 2.2, 3.4, 2.4, R.skin[1], x, 0.6, 0); bx(pp, 2.6, 1.2, 3.2, R.black[0], x, 0, 0.3); }
  bx(pp, 2, 4.6, 2.2, { all: R.grey[5], bo: R.skin[1] }, 4.6, 5.8, 0);
  const armUp = new THREE.Group(); armUp.position.set(-4.6, 9.2, 0); armUp.rotation.z = 0.5; pp.add(armUp);
  bx(armUp, 2.2, 4.4, 2.4, R.grey[5], -1.1, 0, 0);
  bx(armUp, 2.4, 3, 2.6, R.skin[1], -1.1, 4.4, 0);
};

// T114 橘猫小院：草地方块，左后一棵结橘子的树，前面坐着一只橘猫，右后一个纸箱
BUILD["橘猫小院"] = (g) => {
  const GW = 50, GD = 20, GH = 8;
  const grassTop = canvasTex(GW, GD, (gg) => {
    P(gg, R.green[3], 0, 0, GW, GD);
    for (let i = 0; i < 90; i++) P(gg, pick([R.green[2], R.green[4], R.green[2]]), Math.floor(rnd() * GW), Math.floor(rnd() * GD), 1 + Math.floor(rnd() * 2), 1);
    for (const [x, y, c] of [[6, 16, R.cream[4]], [12, 18, R.yellow[4]], [36, 17, R.cream[4]], [44, 10, R.yellow[4]], [8, 6, R.sea[3]], [30, 18, R.sea[3]], [46, 17, R.cream[4]]]) P(gg, c, x, y);
    for (let x = 20; x < 32; x += 3) P(gg, R.cream[1], x, 12 + (x % 2), 2, 1);
  });
  const dirt = (w) => canvasTex(w, GH, (gg) => {
    P(gg, R.honey[1], 0, 0, w, GH);
    for (let i = 0; i < w / 2; i++) P(gg, pick([R.honey[0], R.honey[2]]), Math.floor(rnd() * w), 3 + Math.floor(rnd() * 5), 1 + Math.floor(rnd() * 2), 1);
    P(gg, R.green[3], 0, 0, w, 2);
    for (let x = 0; x < w; x++) if (rnd() < 0.45) P(gg, R.green[2], x, 2, 1, 1 + Math.floor(rnd() * 2));
  });
  bx(g, GW, GH, GD, { all: dirt(GD), f: dirt(GW), b: dirt(GW), t: grassTop, bo: R.honey[0] }, 0, 0, 0);
  bx(g, 2.4, 6, 2.4, R.walnut[3], -15, GH, -4);
  blob(g, 5.6, R.green[3], -15, GH + 10, -4, [1.15, 0.8, 1]);
  blob(g, 3.8, R.green[2], -20, GH + 7.6, -2.5);
  blob(g, 3.6, R.green[4], -11, GH + 11.4, -3.5);
  for (const [x, y, z] of [[-11.5, 17.4, 0.6], [-17.5, 19.6, -0.8], [-20.5, 16, -0.2], [-14.5, 21.2, -2], [-9, 18.6, -2]]) blob(g, 1, R.orange[2], x, y, z);
  const boxTex = canvasTex(8, 6, (gg) => { P(gg, R.honey[3], 0, 0, 8, 6); P(gg, R.honey[1], 0, 0, 8, 1); P(gg, R.honey[2], 4, 1, 1, 5); });
  bx(g, 8, 6, 7, { all: R.honey[2], f: boxTex, t: R.honey[4] }, 19, GH, -5);
  const cat = new THREE.Group(); cat.position.set(5, GH, 3); cat.rotation.y = 0.35; g.add(cat);
  const catFace = canvasTex(10, 8, (gg) => {
    P(gg, R.orange[2], 0, 0, 10, 8); P(gg, R.orange[1], 2, 0, 1, 2); P(gg, R.orange[1], 4, 0, 2, 1); P(gg, R.orange[1], 7, 0, 1, 2);
    P(gg, R.black[0], 2, 3, 2, 2); P(gg, R.black[0], 6, 3, 2, 2); P(gg, R.cream[4], 3, 5, 4, 3); P(gg, R.sea[2], 4, 5, 2, 1);
  });
  const catBody = canvasTex(8, 7, (gg) => { P(gg, R.orange[2], 0, 0, 8, 7); P(gg, R.cream[4], 2, 0, 4, 6); P(gg, R.orange[1], 0, 2, 1, 1); P(gg, R.orange[1], 7, 2, 1, 1); });
  const stripe = (w, h) => canvasTex(w, h, (gg) => { P(gg, R.orange[2], 0, 0, w, h); for (let y = 0; y < h; y += 2) P(gg, R.orange[1], 0, y, w, 1); });
  bx(cat, 8, 6, 7, { all: stripe(7, 6), f: catBody }, 0, 0, 0);
  bx(cat, 10, 8, 8, { all: stripe(8, 8), f: catFace, t: stripe(10, 8) }, 0, 6, 0.6);
  for (const x of [-3.4, 3.4]) bx(cat, 2.4, 2.2, 1.6, { all: R.orange[2], f: R.orange[1] }, x, 14, 1.4);
  for (const x of [-1.8, 1.8]) bx(cat, 2, 1.4, 2, R.cream[4], x, 0, 3.8);
  bx(cat, 7, 1.8, 2, { all: stripe(7, 2) }, 6, 0, 2.6);
};

// T134 迷你货架（系列片尾这一期上架的物件）：一个小小的胡桃木 3×3 柜子，格里放着 8 个作品的小色块，右下空着。
// 材质不进缓存（自己一套），落下时要单独关深度测试，不影响别的物件。
BUILD["迷你货架"] = (g) => {
  const own = (hex) => toon({ color: new THREE.Color(hex) });
  const MW = 48, CELLH = 5.4, T2 = 1.2, MD = 7, LEG2 = 1.4; // 和大柜子一样约 2:1 的扁长比例
  const H2 = LEG2 + 4 * T2 + 3 * CELLH; // 不含顶帽
  const DV = 1.2, CELLW = (MW - 2 * T2 - 2 * DV) / 3;
  const wood = (w, h, ramp = R.walnut) => toon({ map: woodTex(w, h, ramp, true, 3) });
  const side = own(R.walnut[3]), top = own(R.walnut[4]), backM = own(R.oak[4]), legM = own(R.walnut[1]); // 格里衬浅橡木，和大柜子一样，格子才读得出
  // 两侧板、顶帽、背板、三层板、两道竖隔板、四只脚
  for (const s of [-1, 1]) bx(g, T2, H2 - LEG2, MD, { all: side, f: wood(T2, H2 - LEG2) }, s * (MW / 2 - T2 / 2), LEG2, 0);
  bx(g, MW + 2, 1.8, MD + 1.4, { all: top, f: own(R.walnut[2]) }, 0, H2, 0.2);
  bx(g, MW, H2 - LEG2, 0.8, backM, 0, LEG2, -MD / 2 + 0.4).receiveShadow = false; // 背板不吃顶帽的影子，格子亮
  for (let k = 0; k < 4; k++) bx(g, MW - 2 * T2, T2, MD, { all: side, t: top }, 0, LEG2 + k * (CELLH + T2), 0);
  for (const c of [1, 2]) bx(g, DV, H2 - LEG2, MD, side, -MW / 2 + T2 + c * CELLW + (c - 0.5) * DV, LEG2, 0);
  for (const sx of [-1, 1]) bx(g, 1.6, LEG2, 1.6, legM, sx * (MW / 2 - 2.2), 0, MD / 2 - 2);
  // 每格一块小色块：上排 唱片机 / 小屋 / 篮球框，中排 迷宫 / 小楼 / 表，下排 工位 / 草地猫 / 空
  const cellX = (c) => -MW / 2 + T2 + CELLW / 2 + c * (CELLW + DV);
  const cellY = (r) => LEG2 + T2 + r * (CELLH + T2);
  const minis = [
    [0, 2, [[5, 1.4, 4, R.red[1]], [3.6, 0.6, 3.6, R.black[1], 0, 1.4]]],
    [1, 2, [[6.4, 3.4, 1, R.sea[2], 0, 0, -1.5], [3.4, 2.2, 2.6, R.cream[4], -1, 0, 0.6]]],
    [2, 2, [[5, 2.4, 0.8, R.grey[5], 0, 1.2, -1.4], [3.4, 0.8, 2.4, R.orange[2], 0, 1.4, 0.6]]],
    [0, 1, [[7.4, 2.6, 3, R.khaki[2]]]],
    [1, 1, [[6.4, 0.8, 3.4, R.grey[3]], [3.8, 3, 2.4, R.orange[3], 0.6, 0.8, -0.2]]],
    [2, 1, [[3.4, 3.4, 1.2, R.cream[4], 0, 0.6, 0], [1.4, 1.4, 0.4, R.yellow[3], 0.8, 1.6, 0.7], [6, 0.6, 2.4, R.yellow[2], 0, 0, 0.4]]],
    [0, 0, [[5.4, 0.8, 2.4, R.honey[3], 1, 2, 0], [1.6, 3, 1.6, R.black[1], -3.4, 0, 0.6]]],
    [1, 0, [[7, 1.6, 3.4, R.green[3]], [1.6, 1.6, 1.4, R.orange[2], 1, 1.6, 0.6], [1.8, 2, 1.8, R.green[4], -2.2, 1.6, -0.6]]],
  ];
  for (const [c, r, parts] of minis) for (const [w, h, d, hex, dx = 0, dy = 0, dz2 = 0] of parts) bx(g, w, h, d, own(hex), cellX(c) + dx, cellY(r) + dy, 0.6 + dz2);
  // 顶上一盏小灯
  bx(g, 2.4, 0.5, 2.4, own(R.yellow[1]), MW / 2 - 7, H2 + 1.8, -1);
  bx(g, 0.6, 1.8, 0.6, own(R.yellow[0]), MW / 2 - 7, H2 + 2.3, -1);
  bx(g, 2.6, 1.2, 2.2, own(R.yellow[3]), MW / 2 - 8, H2 + 3.6, -0.6);
};

// ---------- 货架上的东西：一行一个物件。新的一期就在后面加一行（arrive: true 的会走「上架」动画） ----------
// slot: [列, 层]，层 0 在最下面。clip：点开以后进的作品画面（素材/clips/作品画面/<clip>.webm，巡演用 帧-<clip>/0001.jpg…）
// 以后格子满了：给 SHELF 加 cols（例如 4），柜子在右边再接一列；colX、柜体和镜头取景都改成按列数算。这一期先不做。
const SHELF = [
  { name: "唱片机", slot: [0, 2], yaw: 0.33, dz: -2.5, clip: "唱片机" },
  { name: "漂浮小屋", slot: [1, 2], yaw: -0.3, dz: -1, clip: "漂浮小屋" },
  { name: "篮球框", slot: [2, 2], yaw: 0.38, clip: "篮球框" },
  { name: "迷宫", slot: [0, 1], yaw: -0.42, clip: "迷宫" },
  { name: "小建筑", slot: [1, 1], yaw: 0.42, clip: "小建筑" },
  { name: "机械表", slot: [2, 1], yaw: -0.38, clip: "机械表" },
  { name: "像素办公室", slot: [0, 0], yaw: 0.36, clip: "像素办公室" },
  { name: "橘猫小院", slot: [1, 0], yaw: -0.4, clip: "橘猫小院" },
  { name: "迷你货架", slot: [2, 0], yaw: -0.36, clip: null, arrive: true },
];
for (const s of SHELF) {
  const it = item(s.name, s.slot[0], s.slot[1], s.yaw, BUILD[s.name], s.dz || 0);
  it.cfg = s;
  it.home = it.holder.position.clone();
  it.shown = !s.arrive;
  it.holder.visible = it.shown;
}

settleLimits();

// 空格：整格一层均匀的薄灰（不撒点），原来放东西的地方没灰，露出深色木头
{
  const dust = canvasTex(78, 38, (gg, w, h) => {
    const x0 = 24, y0 = 9, x1 = 54, y1 = 31;
    P(gg, R.walnut[4], 0, 0, w, h);
    gg.clearRect(x0, y0, x1 - x0, y1 - y0);
    for (let y = y0; y < y1; y++) for (const x of [x0, x1 - 1]) if (y % 2) P(gg, R.walnut[4], x, y);
  });
  const d = put(cab, new THREE.PlaneGeometry(78, 38), toon({ map: dust, alphaTest: 0.5 }), colX(2), rowY(0) + 0.15, ITEM_Z);
  d.rotation.x = -Math.PI / 2;
  d.castShadow = false;
}

// ---------- 镜头：正交、正对柜子、俯 20°。竖线永远是竖直整列像素；竖直面 1 单位 = 1 像素（zoom = 1 时） ----------
// 第二阶段：只加「推近 / 拉远」（正交缩放，围着画面中心）；平移仍然只走整数。
const CY = 84; // v4：取景往下移 2 格（12 像素），柜脚下多露地板；墙上留够一圈光晕
const camera = new THREE.OrthographicCamera(-LW / 2, LW / 2, (LH / 2) * Math.cos(PITCH), (-LH / 2) * Math.cos(PITCH), 1, 2400);
const camOff = new THREE.Vector2(0, 0); // 平移只用整数（=整像素）
let camZoom = 1;
function placeCamera() {
  const tx = Math.round(camOff.x), ty = CY + Math.round(camOff.y);
  camera.position.set(tx, ty + Math.sin(PITCH) * 1000, Math.cos(PITCH) * 1000);
  camera.lookAt(tx, ty, 0);
  if (camera.zoom !== camZoom) { camera.zoom = camZoom; camera.updateProjectionMatrix(); }
}
placeCamera();

// ---------- 小工具：缓动 ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ease5 = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const easeOut3 = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut3 = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOutBack = (x, k = 1.4) => { x = clamp01(x); const c3 = k + 1; return 1 + c3 * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2); };
const bump = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));

// ---------- 台灯：开场慢慢暖起来（不闪），上架落板时轻闪一下 ----------
const bulb = shade.children[3], inner = shade.children[1];
const LAMP_ON = { bulb: new THREE.Color(2.2, 1.8, 1.0), inner: new THREE.Color(1.6, 1.25, 0.62), rim: new THREE.Color(1.5, 1.2, 0.62) };
const LAMP_OFF = { bulb: new THREE.Color(0.62, 0.5, 0.36), inner: new THREE.Color(0.5, 0.4, 0.28), rim: new THREE.Color(0.55, 0.44, 0.3) };
function setLamp(k) {
  // 先是灯丝发暖（偏橙），再到正常暖黄
  bulb.material.color.copy(LAMP_OFF.bulb).lerp(LAMP_ON.bulb, k);
  inner.material.color.copy(LAMP_OFF.inner).lerp(LAMP_ON.inner, k);
  rimGlow.material.color.copy(LAMP_OFF.rim).lerp(LAMP_ON.rim, k);
  lampLight.intensity = 180 * k * k;
  wallWash.intensity = WASH * Math.pow(k, 1.5);
}

// ---------- 后期：低清上做泛光、限色、描边，再最近邻放大；放大这一步顺带做作品画面的像素溶接和光标 ----------
const lowOpt = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
const rtWorld = new THREE.WebGLRenderTarget(LW, LH, { ...lowOpt, depthTexture: new THREE.DepthTexture(LW, LH) });
const rtA = new THREE.WebGLRenderTarget(LW, LH, { ...lowOpt, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const rtB = new THREE.WebGLRenderTarget(LW, LH, { ...lowOpt, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const rtOut = new THREE.WebGLRenderTarget(LW, LH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
const rtMask = new THREE.WebGLRenderTarget(LW, LH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
const quadScene = new THREE.Scene();
quadScene.add(quad);
const VS = "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}";
const sm = (uniforms, fs) => new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false });
const bright = sm({ t: { value: null } }, "varying vec2 vUv;uniform sampler2D t;void main(){vec3 c=clamp(texture2D(t,vUv).rgb,0.,8.);float l=dot(c,vec3(.3,.6,.1));gl_FragColor=vec4(c*smoothstep(1.05,1.6,l),1.);}");
const blur = sm({ t: { value: null }, d: { value: new THREE.Vector2() } }, "varying vec2 vUv;uniform sampler2D t;uniform vec2 d;void main(){vec3 c=vec3(0.);float s=0.;for(int i=-6;i<=6;i++){float w=exp(-float(i*i)/14.);c+=texture2D(t,vUv+d*float(i)).rgb*w;s+=w;}gl_FragColor=vec4(c/s,1.);}");
const N = PALETTE.length;
const PAL_GLSL = `vec3 quant(vec3 c){float best=1e9;vec3 m=c;for(int i=0;i<${N};i++){vec3 e=c-pal[i];float v=dot(e*e,vec3(2.,4.,3.));if(v<best){best=v;m=pal[i];}}return m;}`;
const palU = () => ({ value: PALETTE.map((c) => new THREE.Vector3(...c)) });
// v4：褪色那一路只在暖色里取色（去掉 grey 那条中性灰色阶），不会落到 (123,114,106) 那档灰上
const PAL_WARM = PALETTE.filter((_, i) => !RAMPS.grey.includes(PALETTE_HEX[i]));
const NW = PAL_WARM.length;
// 正交镜头的深度是线性的：d = near + z·(far−near)
// 点开时（v2）：mask 以外的东西褪色、降对比、往墙面奶油色淡出，亮度大约留六成以上、仍然暖；描线也一起淡；最后照样限色
const final = sm({
  t: { value: rtWorld.texture }, dep: { value: rtWorld.depthTexture }, bloom: { value: rtB.texture }, mask: { value: rtMask.texture },
  px: { value: new THREE.Vector2(1 / LW, 1 / LH) }, near: { value: camera.near }, far: { value: camera.far },
  pal: palU(), palW: { value: PAL_WARM.map((c) => new THREE.Vector3(...c)) }, lineCol: { value: new THREE.Vector3(...PALETTE[0]) },
  bloomK: { value: 0.45 }, edgeK: { value: 3.0 }, dim: { value: 0 }, cream: { value: new THREE.Vector3(...PALETTE[PALETTE_HEX.indexOf(RAMPS.cream[2])]) },
}, `varying vec2 vUv;uniform sampler2D t,dep,bloom,mask;uniform vec2 px;uniform float near,far,bloomK,edgeK,dim;uniform vec3 pal[${N}];uniform vec3 palW[${NW}];uniform vec3 lineCol,cream;
${PAL_GLSL}
vec3 quantW(vec3 c){float best=1e9;vec3 m=c;for(int i=0;i<${NW};i++){vec3 e=c-palW[i];float v=dot(e*e,vec3(2.,4.,3.));if(v<best){best=v;m=palW[i];}}return m;}
float dist(vec2 uv){return near+texture2D(dep,uv).x*(far-near);}
void main(){vec4 w=texture2D(t,vUv);vec3 c=w.rgb+texture2D(bloom,vUv).rgb*bloomK;
c=pow(clamp(c,0.,1.),vec3(1./2.2));
vec3 m=quant(c);
float d=dist(vUv);
float n=max(2.*d-dist(vUv+vec2(px.x,0.))-dist(vUv-vec2(px.x,0.)),2.*d-dist(vUv+vec2(0.,px.y))-dist(vUv-vec2(0.,px.y)));
if(n>edgeK&&w.a>.75)m=lineCol;
// v4：先算好「完全褪色」那张（只取暖色），再和原图按 dim 逐帧交叉溶解，中间色不再重新量化（v3 中间几档会落到中性灰上闪 2–3 帧）
if(dim>0.&&texture2D(mask,vUv).r<.5){float l=dot(m,vec3(.3,.59,.11));vec3 g=mix(m,vec3(l)*vec3(1.07,.98,.84),.5);g=mix(g,cream,.42);m=mix(m,quantW(g),dim);}
gl_FragColor=vec4(m,1.);}`);
// 放大到 1920×1080（v2 改成干净的大方块马赛克）：作品画面先以 48 像素一块（每块取那一块的平均色）
// 从画面中央一圈圈翻出来（vMix，不撒随机点），再 48 → 24 → 12 → 6 → 原图（vS 0..4，每级末尾 2 帧左右交叉淡化）。
// 方块网格以画面中心为角、边长都是 6 的倍数，和低清像素网格对齐。光标按 6×6 的大像素画，curA 控制淡出。
const vidTex = new THREE.Texture();
vidTex.minFilter = vidTex.magFilter = THREE.LinearFilter; vidTex.generateMipmaps = false;
const curCanvas = document.createElement("canvas"); curCanvas.width = curCanvas.height = 32;
const curTex = new THREE.CanvasTexture(curCanvas);
curTex.magFilter = curTex.minFilter = THREE.NearestFilter; curTex.generateMipmaps = false;
const up = sm({
  t: { value: rtOut.texture }, vid: { value: vidTex }, cur: { value: curTex }, pal: palU(),
  res: { value: new THREE.Vector2(W, H) }, lres: { value: new THREE.Vector2(LW, LH) },
  vMix: { value: 0 }, vEdge: { value: 0.15 }, vS: { value: 0 }, vScale: { value: 1 }, curA: { value: 1 }, curPos: { value: new THREE.Vector2(-99, -99) },
}, `varying vec2 vUv;uniform sampler2D t,vid,cur;uniform vec2 res,lres,curPos;uniform float vMix,vEdge,vS,vScale,curA;
vec2 vuv(vec2 p){return (p/res-.5)/vScale+.5;}
vec3 blockCol(float B){
  if(B<1.5)return texture2D(vid,vuv(gl_FragCoord.xy)).rgb;
  vec2 o=mod(res*.5,B), b0=floor((gl_FragCoord.xy-o)/B)*B+o; vec3 s=vec3(0.);
  for(int j=0;j<4;j++)for(int i=0;i<4;i++)s+=texture2D(vid,vuv(b0+(vec2(float(i),float(j))+.5)*B*.25)).rgb;
  return s/16.;
}
float lv(float i){return i<.5?48.:i<1.5?24.:i<2.5?12.:i<3.5?6.:1.;}
void main(){
  vec3 c=texture2D(t,vUv).rgb;
  vec2 lp=floor(vUv*lres);
  if(vMix>0.){
    vec2 o=mod(res*.5,48.), b0=floor((gl_FragCoord.xy-o)/48.)*48.+o;
    float r=length(b0+24.-res*.5)/(length(res*.5)+24.);
    float a=clamp((vMix*(1.+vEdge)-r)/vEdge,0.,1.); // 圈到这一块时整块淡入（不撒点）；收回时边更窄，最后不留半透明残影
    if(a>0.){
      float i=min(floor(vS),4.), f=smoothstep(.65,1.,vS-i);
      vec3 v=blockCol(lv(i));
      if(f>0.&&i<4.)v=mix(v,blockCol(lv(i+1.)),f);
      c=mix(c,v,a);
    }
  }
  vec2 cp=vec2(lp.x,lres.y-1.-lp.y)-curPos;
  if(curA>0.&&cp.x>=0.&&cp.y>=0.&&cp.x<32.&&cp.y<32.){vec4 k=texture2D(cur,vec2((cp.x+.5)/32.,1.-(cp.y+.5)/32.));if(k.a>.5)c=mix(c,k.rgb,curA);}
  gl_FragColor=vec4(c,1.);
}`);
const maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
function pass(m, target) { quad.material = m; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }
renderer.shadowMap.autoUpdate = false;
function draw() {
  placeCamera();
  renderer.shadowMap.needsUpdate = true;
  renderer.setRenderTarget(rtWorld);
  renderer.render(scene, camera);
  if (final.uniforms.dim.value > 0 && openSt) {
    camera.layers.set(1);
    scene.overrideMaterial = maskMat;
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(rtMask);
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    camera.layers.set(0);
  }
  bright.uniforms.t.value = rtWorld.texture; pass(bright, rtA);
  blur.uniforms.t.value = rtA.texture; blur.uniforms.d.value.set(1 / LW, 0); pass(blur, rtB);
  blur.uniforms.t.value = rtB.texture; blur.uniforms.d.value.set(0, 1 / LH); pass(blur, rtA);
  final.uniforms.bloom.value = rtA.texture;
  pass(final, rtOut);
  pass(up, null);
}

// ---------- 光标：画在低清帧里的像素小手 / 箭头（X 描线、W 奶油、S 暗一档、Y 品牌暖黄袖口） ----------
const CUR_COL = { X: RAMPS.line[0], W: RAMPS.cream[4], S: RAMPS.cream[2], Y: RAMPS.yellow[3] };
// v3：光标重画成约 1.5 倍大（箭头 19 行、小手 19 行），手机小窗里也看得见；仍是整格像素，不是放大
const SPRITES = {
  arrow: { hot: [0, 0], rows: [
    "X...........", "XX..........", "XWX.........", "XWWX........", "XWWWX.......", "XWWWWX......", "XWWWWWX.....",
    "XWWWWWWX....", "XWWWWWWWX...", "XWWWWWWWWX..", "XWWWWWWWWWX.", "XWWWWWWWWWWX", "XWWWWWSXXXXX", "XWWSXWSX....",
    "XWSX.XWSX...", "XSX..XWSX...", "XX....XWSX..", "X.....XWSX..", ".......XX...",
  ] },
  hand: { hot: [6, 0], rows: [
    ".....XXX..........", "....XWWWX.........", "....XWWWX.........", "....XWWWX.........", "....XWWWXXXX......",
    "....XWWWXWWWXXX...", "....XWWWXWWWXWWWX.", ".XXXXWWWXWWWXWWWX.", "XWWWXWWWWWWWWWWWSX", "XWWWWWWWWWWWWWWWSX",
    "XWWWWWWWWWWWWWWWSX", ".XWWWWWWWWWWWWWWSX", "..XWWWWWWWWWWWWWSX", "..XWWWWWWWWWWWWSX.", "...XWWWWWWWWWWWSX.",
    "...XWWWWWWWWWWSX..", "....XYYYYYYYYYX...", "....XYYYYYYYYYX...", "....XXXXXXXXXXX...",
  ] },
};
const curSt = { x: -99, y: -99, show: false, kind: "arrow", press: 0, spark: -1, key: "" };
const HOT = 8; // 光标图在 32×32 画布里的起点（周围留地方画点击时的小火花）
function drawCursor() {
  const sp = SPRITES[curSt.kind], pr = curSt.press > 0 ? 1 : 0;
  const spk = curSt.spark >= 0 ? Math.min(2, Math.floor(curSt.spark / 0.07)) : -1;
  const key = `${curSt.kind}|${pr}|${spk}|${curSt.show}`;
  if (key !== curSt.key) {
    curSt.key = key;
    const g = curCanvas.getContext("2d");
    g.clearRect(0, 0, 32, 32);
    if (curSt.show) {
      sp.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (CUR_COL[ch]) P(g, CUR_COL[ch], HOT - sp.hot[0] + x, HOT - sp.hot[1] + y + pr); }));
      if (spk >= 0) { // 点下去：指尖四周四颗暖黄小点往外跳两格
        const r = 3 + spk * 2, cx = HOT, cy = HOT + pr;
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [0, -1.4]]) P(g, RAMPS.yellow[3], Math.round(cx + dx * r) - (dx < 0 ? 1 : 0), Math.round(cy + dy * r) - 1);
      }
    }
    curTex.needsUpdate = true;
  }
  up.uniforms.curPos.value.set(curSt.show ? Math.floor(curSt.x) - HOT : -99, curSt.show ? Math.floor(curSt.y) - HOT : -99);
}

// ---------- 晃：一个弹簧带动歪、点头、小转；摆幅小到不到 0.6 个像素就直接停（不在两格之间来回跳） ----------
function stepWobble(dt) {
  for (const it of items) {
    if (it.ang === 0 && it.vel === 0) continue;
    it.vel += (-K * it.ang - 2 * it.zeta * W0 * it.vel) * dt;
    it.ang += it.vel * dt;
    if (Math.abs(it.ang) > it.maxAng) { it.ang = Math.sign(it.ang) * it.maxAng; it.vel *= -0.35; }
    if (Math.abs(it.ang) * it.reach < 0.6 && Math.abs(it.vel) * it.reach < 8) it.ang = it.vel = 0; // 摆幅不到 0.6 像素就停
    applyTilt(it);
  }
  scene.traverse((o) => { if (o.userData.spin) o.rotation.y -= dt * 3.5; });
}
// 巡演时记事件帧号（配乐对拍用），record_tour.py 录完导出
const EVENTS = [];
let tourF = -1;
function ev(type, extra = {}) { if (TOUR) EVENTS.push({ 帧: tourF, 秒: +(tourF / 60).toFixed(3), 事件: type, ...extra }); }
window.EVENTS = EVENTS;
function poke(it, dir, strength = 1) {
  if (!(it && it.shown && it !== openSt?.it)) return;
  if (it.ang === 0 && it.vel === 0) ev("晃动开始", { 物件: it.name });
  it.vel = dir * Math.min(1, strength) * it.maxAng * W0 * 1.1;
}

// ---------- 碰：光标在低清坐标 (lx, ly) 上，vx 是这一帧横着走了多少（1920 宽下的像素） ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let hoverIt = null;
function pickAt(lx, ly) {
  ndc.set(((Math.floor(lx) + 0.5) / LW) * 2 - 1, -(((Math.floor(ly) + 0.5) / LH) * 2 - 1));
  ray.setFromCamera(ndc, camera);
  const vis = items.filter((i) => i.shown && !i.falling);
  const hit = ray.intersectObjects(vis.map((i) => i.hit), false)[0];
  return hit ? vis.find((i) => i.hit === hit.object) : null;
}
function hoverAt(lx, ly, vx) {
  const it = openSt ? null : pickAt(lx, ly);
  if (it && it !== hoverIt) poke(it, -Math.sign(vx || 1), 1 + Math.min(1, Math.abs(vx) * 0.05));
  hoverIt = it;
  curSt.kind = it ? "hand" : "arrow";
}

// ---------- 点开：飞到画面中央放大 → 停住轻转 → 像素溶接进作品画面 → 反着退回、落回板上小晃 ----------
const DUR = {
  // v3：大方块一圈圈翻出 0.36 秒（缓出），48 像素整屏停 0.28 秒，再 0.4 秒一级级变清晰；收回反过来
  normal: { fly: 0.22, turn: 0.3, diss: 0.36, hold: 0.28, sharp: 0.4, unsharp: 0.32, uhold: 0.25, undiss: 0.45, back: 0.26 },
  fast: { fly: 0.18, turn: 0.25, diss: 0.36, hold: 0.28, sharp: 0.4, unsharp: 0.3, uhold: 0.25, undiss: 0.45, back: 0.22 },
};
const OPEN_SCALE = 2.3, OPEN_DIST = 70, DIM = 1, OPEN_PUSH = 0; // v3：不再推镜，靠物件自己飞前放大
let openSt = null; // { it, d, t, tc (null = 还没关), pendingClose }
const _v3 = new THREE.Vector3(), _e2 = new THREE.Euler(), _q2 = new THREE.Quaternion();
function frontPose(it, extraYaw, pitch, s) {
  // 物件包围盒中心落在画面中央那条视线上，离柜子前沿 OPEN_DIST
  const tgt = new THREE.Vector3(Math.round(camOff.x), CY + Math.round(camOff.y), 0).add(new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH)).multiplyScalar(OPEN_DIST));
  _e2.set(pitch, it.yaw + extraYaw, 0, "XYZ"); _q2.setFromEuler(_e2);
  const c = it.box.getCenter(_v3).multiplyScalar(s).applyQuaternion(_q2);
  return tgt.sub(c);
}
function openItem(it, fast = false) {
  if (openSt || !it || !it.cfg.clip) return false;
  it.ang = it.vel = 0; applyTilt(it);
  it.holder.traverse((o) => o.layers.enable(1));
  openSt = { it, d: DUR[fast ? "fast" : "normal"], t: 0, tc: null, pendingClose: false };
  ev("点开", { 物件: it.name });
  startClip(it.cfg.clip);
  return true;
}
function closeItem() {
  if (!openSt || openSt.tc !== null) return;
  const d = openSt.d;
  if (openSt.t < d.fly + d.turn + d.diss + d.hold + d.sharp) { openSt.pendingClose = true; return; }
  openSt.tc = 0;
}
function stepOpen(dt) {
  const o = openSt;
  if (!o) { final.uniforms.dim.value = 0; up.uniforms.vMix.value = 0; return 0; }
  const { it, d } = o;
  o.t += dt;
  const tFull = d.fly + d.turn + d.diss + d.hold + d.sharp;
  if (o.tc !== null) o.tc += dt;
  else if (o.pendingClose && o.t >= tFull) o.tc = 0;
  const tIn = d.fly + d.turn; // 作品画面从这一刻开始走
  // 在前面时一直慢慢转（先转约 12°，之后每秒再转约 2°），不在中央干停
  const extraYaw = Math.sign(it.yaw || 1) * (0.22 * easeOut3((o.t - d.fly * 0.5) / 1.6) + 0.04 * o.t), pitch = 0.16 * ease((o.t - d.fly * 0.3) / 0.8);
  let fly, dim, vmix, vs;
  if (o.tc === null) {
    fly = o.t / d.fly;
    dim = DIM * ease(o.t / d.fly);
    vmix = 1 - Math.pow(1 - clamp01((o.t - tIn) / d.diss), 2); // 缓出，但收尾不拖到几乎不动
    vs = 4 * clamp01((o.t - tIn - d.diss - d.hold) / d.sharp);
  } else {
    const tr = o.tc - d.unsharp - d.uhold, tb = tr - d.undiss;
    vs = 4 * (1 - clamp01(o.tc / d.unsharp));
    const x = clamp01(tr / d.undiss);
    vmix = Math.sqrt(1 - x); // v4：盖住的面积按时间匀速变小（0.45 秒、27 帧），最后一下收干净，收完马上飞回
    fly = 1 - clamp01(tb / d.back);
    dim = DIM * fly;
    if (tb >= d.back) { // 落回原位：小晃一下
      it.holder.position.copy(it.home); it.holder.rotation.set(0, it.yaw, 0); it.holder.scale.setScalar(1);
      it.holder.traverse((q) => q.layers.disable(1));
      openSt = null; stopClip();
      ev("飞回落板", { 物件: it.name });
      poke(it, Math.sign(it.yaw) || 1, 0.55);
      final.uniforms.dim.value = 0; up.uniforms.vMix.value = 0;
      return 0;
    }
  }
  // 位姿：去的时候快出慢停（略带过冲的放大），回来时两头缓
  const e = o.tc === null ? easeOut3(fly) : easeInOut3(fly);
  const sc = 1 + (OPEN_SCALE - 1) * (o.tc === null ? easeOutBack(fly, 1.2) : easeInOut3(fly));
  const p1 = frontPose(it, extraYaw, pitch, OPEN_SCALE);
  it.holder.position.copy(it.home).lerp(p1, e);
  it.holder.position.y += bump(e) * 8; // 飞的路上略微拱起
  it.holder.rotation.set(pitch * e, it.yaw + extraYaw * e, 0);
  it.holder.scale.setScalar(sc);
  final.uniforms.dim.value = dim;
  const mark = (k, type) => { if (!o[k]) { o[k] = true; ev(type, { 物件: it.name }); } };
  if (vmix > 0 && o.tc === null) mark("e1", "大方块开始翻");
  if (vmix >= 1 && o.tc === null) mark("e2", "48档铺满");
  if (vs >= 4 && o.tc === null) mark("e3", "变清晰完成");
  if (o.tc !== null) mark("e4", "开始收回");
  if (o.tc !== null && vmix <= 0) mark("e5", "收回完成、开始飞回");
  up.uniforms.vMix.value = vmix;
  up.uniforms.vEdge.value = o.tc === null ? 0.15 : 0.012; // 收回时每块整块消失，不留半透明残影
  up.uniforms.vS.value = vs;
  const vt = o.t - tIn;
  up.uniforms.vScale.value = 1 + 0.008 * Math.max(0, vt); // 作品画面一直匀速极慢地推近（4 秒约 3%），大方块那几档每帧也在变
  o.vt = vt;
  return 0;
}

// ---------- 作品画面：自由玩用 <video>（webm），巡演用按帧导出的 jpg ----------
const CLIP_DIR = "../clips/作品画面/";
const videos = {};
let curVideo = null;
function startClip(name) {
  if (TOUR) { tourClip = name; return; }
  const v = videos[name];
  if (!v) return;
  curVideo = v; v.currentTime = 0; v.play().catch(() => {});
  up.uniforms.vid.value = v.userData.tex; // 每条一张 VideoTexture，视频有画面以后它自己逐帧更新
}
function stopClip() { if (curVideo) curVideo.pause(); curVideo = null; }
if (!TOUR && !STILL) for (const s of SHELF) if (s.clip) {
  const v = document.createElement("video");
  Object.assign(v, { muted: true, loop: true, playsInline: true, preload: "auto", crossOrigin: "anonymous" });
  v.src = CLIP_DIR + encodeURIComponent(s.clip) + ".webm";
  const vt = new THREE.VideoTexture(v);
  vt.minFilter = vt.magFilter = THREE.LinearFilter; vt.generateMipmaps = false;
  v.userData = { tex: vt };
  videos[s.clip] = v;
}

// ---------- 上架：新物件从画面上方落进空格，落板小弹、扬几颗像素灰、左右邻格被震一下、台灯轻闪 ----------
const G_FALL = 1800, DROP_H = 172, BOUNCE = 0.22; // v3：下落约 0.44 秒（原来 0.51 秒）
let arr = null; // { it, t, y, v, contacts }
const dust = [];
const dustMats = [RAMPS.cream[3], RAMPS.cream[4], RAMPS.khaki[3]].map((h) => new THREE.MeshBasicMaterial({ color: new THREE.Color(h), depthWrite: false }));
const dustGeo = new THREE.BoxGeometry(1, 1, 1);
// v3：下落时不再关深度测试（v2 那样会半透明、背面透出来）。改成整件沿视线往镜头挪近 FALL_NEAR：
// 正交镜头下沿视线挪动，画面上的位置和大小一点不变，但真的挡在柜子、台灯前面，
// 自己各面前后照常遮挡、描线按真实深度画。落板那一刻挪回原位（那时它前面什么都没有，不会跳）。
const FALL_NEAR = 140;
function setFalling(it, on) {
  it.falling = on;
  it.holder.traverse((o) => { if (o.isMesh) o.castShadow = !on; });
}
function startArrival(it) {
  if (!it) return;
  it.ang = it.vel = 0; applyTilt(it);
  it.shown = true; it.holder.visible = true;
  it.holder.position.copy(it.home); it.holder.position.y += DROP_H;
  it.holder.scale.setScalar(1);
  setFalling(it, true);
  arr = { it, t: 0, y: DROP_H, v: 0, contacts: 0, sq: -1 };
  ev("迷你货架开始落");
}
function neighbors(it) {
  const [c, r] = it.cfg.slot;
  return items.filter((o) => o !== it && o.shown && ((o.cfg.slot[1] === r && Math.abs(o.cfg.slot[0] - c) === 1) || (o.cfg.slot[0] === c && o.cfg.slot[1] === r + 1)));
}
// n 颗、力度 kk、每颗边长 size 格：落板 9 颗 1 格满力；
// 点空格 12 颗 3 格、往上扬得高一点，一半奶油白一半淡暖黄（衬在浅色背板前也看得见；手机小窗里约 1 个点大）
const dustGeoBy = (n) => new THREE.BoxGeometry(n, n, n);
const DUST_GEO = { 1: dustGeo, 2: dustGeoBy(2), 3: dustGeoBy(3) };
const puffMats = [RAMPS.cream[4], RAMPS.yellow[4]].map((h) => new THREE.MeshBasicMaterial({ color: new THREE.Color(h), depthWrite: false }));
function spawnDust(it, n = 9, kk = 1, size = 1) {
  const base = it.home;
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(DUST_GEO[size], size > 1 ? puffMats[k % 2] : dustMats[k % 3]);
    const side = k % 2 ? 1 : -1, sx = side * (8 + (k * 37) % 11);
    m.position.set(base.x + sx, base.y + 0.6, base.z + 3 + ((k * 13) % 7));
    m.renderOrder = 6;
    scene.add(m);
    m.userData.floor = base.y + 0.5;
    if (size > 1) { // 点空格：一撮往上扬（中间几颗扬得最高），再慢慢落回地板
      const mid = 1 - Math.abs(k - (n - 1) / 2) / (n / 2);
      dust.push({ m, vx: side * (3 + ((k * 29) % 9)), vy: 62 + 48 * mid + ((k * 17) % 12), vz: 2 + ((k * 7) % 5), life: 0.95 + ((k * 11) % 5) * 0.06, g: 150 });
      continue;
    }
    dust.push({ m, vx: kk * side * (14 + ((k * 29) % 22)), vy: kk * (26 + ((k * 17) % 24)), vz: kk * (6 + ((k * 7) % 10)), life: (0.42 + ((k * 11) % 6) * 0.05) * (0.7 + 0.3 * kk) });
  }
}
function stepArrival(dt) {
  for (let i = dust.length - 1; i >= 0; i--) {
    const p = dust[i];
    p.vy -= (p.g || 170) * dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
    if (p.m.position.y < p.m.userData.floor) { p.m.position.y = p.m.userData.floor; p.vx = p.vy = p.vz = 0; }
    p.life -= dt;
    if (p.life <= 0) { scene.remove(p.m); dust.splice(i, 1); }
  }
  if (!arr) return;
  const a = arr, it = a.it;
  a.t += dt;
  a.v -= G_FALL * dt; a.y += a.v * dt;
  if (a.y <= 0) {
    a.y = 0;
    if (a.contacts === 0) {
      a.v = -a.v * BOUNCE; a.contacts = 1; a.sq = 0; a.sqK = 0.16;
      ev("落板"); ev("整帧震动开始");
      setFalling(it, false);
      spawnDust(it); dust.forEach((p) => { p.m.userData.floor = it.home.y + 0.5; });
      const nb = neighbors(it);
      nb.forEach((o) => poke(o, o.cfg.slot[0] < it.cfg.slot[0] ? -1 : 1, o.cfg.slot[1] === it.cfg.slot[1] ? 0.7 : 0.4));
      shakeT = 0; // 落板：整帧按低清像素上下抖几帧
    } else {
      a.v = 0; a.contacts = 2; a.sq = 0; a.sqK = 0.06;
      ev("第二次落板（小弹落定）");
      poke(it, -1, 0.35);
      arr = null;
    }
  }
  it.holder.position.copy(it.home);
  it.holder.position.y += a.y;
  if (it.falling) it.holder.position.add(new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH)).multiplyScalar(FALL_NEAR));
  if (a.sq >= 0) {
    a.sq += dt;
    const k = bump(a.sq / 0.14) * a.sqK;
    it.holder.scale.set(1 + k * 0.6, 1 - k, 1 + k * 0.6);
    if (a.sq > 0.14) { a.sq = -1; it.holder.scale.setScalar(1); }
  }
}
const lampFlickK = () => 1; // v3：台灯轻闪量不出来，删掉了
let shakeT = -1;
// v4：按帧数走，不按秒（v3 按秒切，实际成了 3/4/2 帧）。每档 3 帧：向下 2 格、向上 1 格、向下 1 格，第 9 帧后回位
const SHAKE = [2, 2, 2, -1, -1, -1, 1, 1, 1];
function shakeY() {
  if (shakeT < 0) return 0;
  const y = SHAKE[shakeT];
  if (y === undefined) { shakeT = -1; ev("整帧震动结束（回位）", { 说明: "每档 3 帧：+2 格 ×3、−1 格 ×3、+1 格 ×3" }); return 0; }
  shakeT++;
  return y;
}

// ---------- 自查：静止和晃到峰值（左右各一次，含点头和小转）时，按每个顶点算离上层板多少 ----------
// gap3d：3D 里离板下沿几格；gapPx：投到画面后离板下沿几个低清像素（描线 1 格，所以要 ≥ 2.5 才看得见中间有背景）
function vertGap(it) {
  it.holder.updateMatrixWorld(true);
  let top = -1e9, vis = -1e9; const v = new THREE.Vector3(), m = new THREE.Matrix4(), base = rowY(it.r);
  it.inner.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    const pa = o.geometry.attributes.position, n = o.isInstancedMesh ? o.count : 1;
    for (let q = 0; q < n; q++) {
      if (o.isInstancedMesh) o.getMatrixAt(q, m);
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i); if (o.isInstancedMesh) v.applyMatrix4(m); v.applyMatrix4(o.matrixWorld);
        top = Math.max(top, v.y - base); vis = Math.max(vis, v.y - base - v.z * TANP);
      }
    }
  });
  return [+(CIH - top).toFixed(1), +(CIH - vis).toFixed(1)];
}
window.clearance = () => items.map((it) => {
  const keep = it.ang, out = { name: it.name, 转角: Math.round(it.yaw * 180 / Math.PI), 最大歪: +(it.maxAng * 180 / Math.PI).toFixed(1) };
  for (const [k, a] of [["静止", 0], ["峰值左", it.maxAng], ["峰值右", -it.maxAng]]) { it.ang = a; applyTilt(it); out[k] = vertGap(it); }
  it.ang = keep; applyTilt(it);
  it.holder.updateMatrixWorld(true);
  const all = new THREE.Box3().setFromObject(it.holder.children[0]).union(new THREE.Box3().setFromObject(it.holder.children[1]));
  out["宽占格%"] = Math.round(((all.max.x - all.min.x) / CIW) * 100);
  out["纵深"] = Math.round(all.max.z - all.min.z) + "/" + CD;
  out["前沿z"] = +all.max.z.toFixed(1);
  return out;
});

// ---------- 一帧往前走 ----------
let simT = 0, baseZoom = 1, lampK = 1, curFade = 1;
function stepAll(dt) {
  simT += dt;
  stepWobble(dt);
  stepArrival(dt);
  const push = stepOpen(dt);
  up.uniforms.curA.value = (1 - ease(up.uniforms.vMix.value / 0.3)) * curFade; // 进到作品画面时光标淡出，退回货架后再出现；巡演收尾前整体淡出
  camZoom = baseZoom * (1 + OPEN_PUSH * push);
  camOff.y = shakeY();
  setLamp(lampK * lampFlickK());
  if (curSt.press > 0) curSt.press -= dt;
  if (curSt.spark >= 0) { curSt.spark += dt; if (curSt.spark > 0.21) curSt.spark = -1; }
  drawCursor();
}
function click(lx, ly) {
  curSt.press = 0.1; curSt.spark = 0;
  if (openSt) { closeItem(); return; }
  const it = pickAt(lx, ly);
  if (it && !openItem(it)) poke(it, -1, 1);
}

// ---------- 自由玩：鼠标划、点开、点任意处关闭；R 重放上架片尾 ----------
// v3：全程 1.0 倍，不推不拉（缩放会让描线闪、木纹重采样），和定稿静帧 v4 一致
const INTRO = 0, PULL = 1;
const introZoom = () => 1;
let freeArriveAt = 2.5, pullT = -1;
function freeTick(dt) {
  if (simT < INTRO + 0.1) baseZoom = introZoom(simT);
  lampK = 1;
  if (freeArriveAt >= 0 && simT >= freeArriveAt) { freeArriveAt = -1; startArrival(items.find((i) => i.cfg.arrive)); pullT = 0; }
  baseZoom = 1;
  stepAll(dt);
}
let lastCX = null;
const lowXY = (e) => { const r = renderer.domElement.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * LW, ((e.clientY - r.top) / r.height) * LH]; };
if (!TOUR) {
  renderer.domElement.addEventListener("pointermove", (e) => {
    const [lx, ly] = lowXY(e);
    const vx = lastCX == null ? 0 : e.clientX - lastCX; lastCX = e.clientX;
    curSt.x = lx; curSt.y = ly; curSt.show = true;
    hoverAt(lx, ly, vx * (1920 / renderer.domElement.getBoundingClientRect().width));
  });
  renderer.domElement.addEventListener("pointerleave", () => { curSt.show = false; lastCX = null; hoverIt = null; });
  renderer.domElement.addEventListener("pointerdown", (e) => { const [lx, ly] = lowXY(e); click(lx, ly); });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeItem();
    if (e.key === "r" || e.key === "R") {
      const it = items.find((i) => i.cfg.arrive);
      it.shown = false; it.holder.visible = false; arr = null;
      freeArriveAt = simT + 0.35;
    }
  });
}

// ---------- 巡演：固定时间轴，每帧 1/60 秒，可复现 ----------
// 光标路线：一段一段二次贝塞尔（bend = 弧度，垂直于连线方向的偏移比例），每段自己的缓动（in 起步加速、out 收尾减速、io 两头缓、lin 匀速）
// v5（2026-11-14，阿彦：「展示三个吧。黑胶唱片、投篮、ai办公室」）：点开三件，唱片机 → 篮球框 → 像素办公室。
// 对拍：配乐 116 BPM，一小节 2.069 秒。三次点开和最后落板都在小节第 1 拍：2.000 + n × 2.069 秒，四舍五入到整帧，
// n = 0、3、6、9 → 第 120、492、865、1237 帧。点空格在落板前 43 帧（同 v4 的 822→865）。
// ① 上排右→左拨（篮球框、漂浮小屋、唱片机晃），点开唱片机；② 退回后往右拨回上排（漂浮小屋、篮球框晃），点开篮球框；
// ③ 退回后中排右→左拨（机械表、小建筑、迷宫晃），往下停在左下，点开像素办公室；④ 退回后往右拨过橘猫小院，点空格扬灰；
// ⑤ 光标淡出，迷你货架落下、整帧震；⑥ 全景停约 2.67 秒（同 v4）
const FR = (f) => f / 60;
const BAR_F = { open1: 120, open2: 492, open3: 865, land: 1237 }; // 2.000 + n × 2.069 秒：n = 0、3、6、9
const TL = {
  opens: [
    { t: FR(BAR_F.open1), close: 6.0, item: "唱片机", fast: false },
    { t: FR(BAR_F.open2), close: 11.93, item: "篮球框", fast: true },
    { t: FR(BAR_F.open3), close: 18.12, item: "像素办公室", fast: true },
  ],
  slot: FR(BAR_F.land - 43), fade: [FR(BAR_F.land - 37), FR(BAR_F.land - 25)], drop: FR(BAR_F.land - 25),
};
const TOUR_LEN = FR(BAR_F.land + 161); // 落板后停 160 帧（同 v4）
// 各件在低清画面上的横向范围（pickName 扫出来的）：上排 唱片机 43–98、漂浮小屋 129–189、篮球框 238–285；
// 中排 迷宫 42–96、小建筑 133–186、机械表 233–258；下排 像素办公室 41–96、橘猫小院 133–186，空格约 230–285
const PATH = [
  { t: 0, p: [306, 50] },
  { t: 0.22, p: [266, 57], ease: "in", bend: 0.04 }, // 0.1–0.2 秒碰到篮球框
  { t: 1.45, p: [104, 60], ease: "lin", bend: -0.03 }, // 上排右→左：篮球框、漂浮小屋
  { t: 1.78, p: [76, 60], ease: "out" }, // 到唱片机停住，2.0 秒点开
  { t: 2.9, p: [76, 60] },
  { t: 4.3, p: [113, 62], ease: "io", bend: 0.05 }, // 真画面期间光标藏着，挪到唱片机和漂浮小屋中间的空当等
  { t: 7.32, p: [113, 62] },
  { t: 7.98, p: [244, 58], ease: "io", bend: 0.03 }, // 上排左→右：漂浮小屋、篮球框
  { t: 8.12, p: [262, 58], ease: "out" }, // 停在篮球框上，第 492 帧点开
  { t: 9.0, p: [262, 58] },
  { t: 10.4, p: [300, 100], ease: "io", bend: -0.08 }, // 藏着时挪到中排右边等
  { t: 13.17, p: [300, 100] },
  { t: 13.7, p: [110, 103], ease: "in", bend: 0.03 }, // 中排右→左：机械表、小建筑
  { t: 13.86, p: [72, 102], ease: "out" }, // 停到迷宫上
  { t: 14.27, p: [70, 148], ease: "io", bend: -0.04 }, // 往下到像素办公室上，第 865 帧点开
  { t: 15.2, p: [70, 148] },
  { t: 16.5, p: [114, 151], ease: "io", bend: 0.1 }, // 藏着时挪到像素办公室和橘猫小院中间的空当等
  { t: 19.36, p: [114, 151] },
  { t: 19.8, p: [250, 147], ease: "io", bend: -0.02 }, // 下排左→右：橘猫小院，停在右下空格上，第 1194 帧点一下
];
const EASES = { in: (x) => x * x, out: (x) => 1 - (1 - x) * (1 - x), io: easeInOut3, lin: (x) => x };
function cursorAt(T) {
  if (T <= PATH[0].t) return PATH[0].p;
  for (let i = 1; i < PATH.length; i++) {
    const a = PATH[i - 1], b = PATH[i];
    if (T > b.t) continue;
    const u = (EASES[b.ease] || EASES.lin)(clamp01((T - a.t) / (b.t - a.t)));
    const [x0, y0] = a.p, [x1, y1] = b.p, k = b.bend || 0;
    const cx = (x0 + x1) / 2 - (y1 - y0) * k, cy = (y0 + y1) / 2 + (x1 - x0) * k;
    return [(1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1, (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1];
  }
  return PATH[PATH.length - 1].p;
}
let tourClip = null, prevCX = null;
const imgCache = new Map();
const CLIP_FRAMES = { 唱片机: 276, 迷宫: 261, 篮球框: 269, 像素办公室: 267 }; // 帧-<名>/ 里的 jpg 张数
function loadFrame(name, i) {
  const src = `${CLIP_DIR}${encodeURIComponent("帧-" + name)}/${String(i + 1).padStart(4, "0")}.jpg`;
  if (imgCache.has(src)) return imgCache.get(src);
  const im = new Image(); im.src = src;
  const pr = im.decode().then(() => im);
  imgCache.clear(); imgCache.set(src, pr);
  return pr;
}
function tourTick(T, dt) {
  const fired = (t) => T >= t && T - dt < t;
  baseZoom = 1;
  lampK = 1;
  const [cx, cy] = cursorAt(T);
  curSt.show = T >= PATH[0].t && cx < LW + 4 && cy < LH + 4;
  curSt.x = cx; curSt.y = cy;
  if (T < TL.fade[0]) hoverAt(cx, cy, prevCX == null ? 0 : (cx - prevCX) * 6); // 光标淡出以后不再碰东西
  prevCX = cx;
  for (const o of TL.opens) {
    if (fired(o.t)) { curSt.press = 0.1; curSt.spark = 0; openItem(items.find((i) => i.name === o.item), o.fast); }
    if (fired(o.close)) click(cx, cy);
  }
  if (T >= TL.slot - 0.12 && T < TL.fade[1]) curSt.kind = "hand"; // v5：点空格那一下也用手形按下（同点开唱片机）
  if (fired(TL.slot)) { curSt.press = 0.1; curSt.spark = 0; const it = items.find((i) => i.cfg.arrive); spawnDust(it, 12, 1.2, 3); ev("点空格扬灰"); }
  curFade = 1 - ease((T - TL.fade[0]) / (TL.fade[1] - TL.fade[0]));
  if (fired(TL.drop)) startArrival(items.find((i) => i.cfg.arrive));
  stepAll(dt);
}
window.tourFrame = async (f) => {
  // 只能往前走；跳帧就从头补
  if (f <= tourF) throw new Error("巡演只能往前走，重新打开页面再录");
  while (tourF < f) { tourF++; const T = tourF / 60; tourTick(T, tourF === 0 ? 0 : 1 / 60); }
  if (openSt && tourClip) {
    const i = Math.max(0, Math.min((CLIP_FRAMES[tourClip] || 200) - 1, Math.floor(Math.max(0, openSt.vt) * 60 + 1e-6)));
    const im = await loadFrame(tourClip, i);
    if (vidTex.image !== im) { vidTex.image = im; vidTex.needsUpdate = true; }
  }
  draw();
  return { T: +(tourF / 60).toFixed(3), open: !!openSt, vmix: +up.uniforms.vMix.value.toFixed(3), vS: +up.uniforms.vS.value.toFixed(2), curA: +up.uniforms.curA.value.toFixed(2), zoom: +camZoom.toFixed(4) };
};
window.TOUR_FRAMES = Math.round(TOUR_LEN * 60);

// ---------- 给出静帧、录像和测帧率用的接口 ----------
window.items = items.map((i) => i.name);
window.setState = (s = {}) => {
  items.forEach((it) => { it.ang = 0; it.vel = 0; applyTilt(it); });
  if (s.tilt) { const it = items.find((i) => i.name === s.tilt[0]); it.ang = Math.max(-it.maxAng, Math.min(it.maxAng, s.tilt[1])); applyTilt(it); }
  if (s.cam) { camOff.set(s.cam[0], s.cam[1]); }
  draw();
};
// 录像用：固定时钟一步一步走，name 物件在第 0 帧被碰一下
window.simStart = (name, dir = -1) => { items.forEach((it) => { it.ang = 0; it.vel = 0; applyTilt(it); }); poke(items.find((i) => i.name === name), dir, 2); };
window.simStep = (dt) => { stepWobble(dt); draw(); };
window.poke = (name, dir = -1, k = 2) => poke(items.find((i) => i.name === name), dir, k);
// 每件被碰一下以后：晃多久、摇几下（过零次数 / 2 记作「下」，按半个来回计）、峰值多大
window.simTrace = () => items.map((it) => {
  const keepShown = it.shown; it.shown = true;
  items.forEach((o) => { o.ang = 0; o.vel = 0; applyTilt(o); });
  poke(it, -1, 1);
  let f = 0, cross = 0, prev = 0, peak = 0;
  while (f < 600 && (it.ang !== 0 || it.vel !== 0)) { stepWobble(1 / 60); f++; peak = Math.max(peak, Math.abs(it.ang)); if (prev && Math.sign(it.ang) && Math.sign(it.ang) !== Math.sign(prev)) cross++; if (it.ang) prev = it.ang; }
  items.forEach((o) => { o.ang = 0; o.vel = 0; applyTilt(o); });
  it.shown = keepShown;
  return { name: it.name, 秒: +(f / 60).toFixed(2), 摆动次数: cross + 1, 峰值度: +(peak * 180 / Math.PI).toFixed(1), 上限度: +(it.maxAng * 180 / Math.PI).toFixed(1) };
});
window.timeFrame = (n = 60) => {
  const gl = renderer.getContext(), px1 = new Uint8Array(4);
  draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); }
  return (performance.now() - t0) / n;
};
// 测帧率用：自由玩模式下直接触发
window.demoOpen = (name) => openItem(items.find((i) => i.name === name));
window.demoClose = () => closeItem();
window.pickName = (lx, ly) => { const it = pickAt(lx, ly); return it ? it.name : null; }; // 调巡演路线用：低清坐标上点到哪件
window.demoArrive = () => { const it = items.find((i) => i.cfg.arrive); it.shown = false; it.holder.visible = false; startArrival(it); };
window.fps = { frames: 0, t0: 0, worst: 0 };
let last = performance.now(), running = !STILL && !TOUR;
function loop(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.033, raw);
  last = now;
  if (running) { freeTick(dt); draw(); window.fps.frames++; window.fps.worst = Math.max(window.fps.worst, raw); }
  requestAnimationFrame(loop);
}
window.pause = (v = true) => { running = !v; };
if (STILL) { setLamp(1); drawCursor(); draw(); }
if (TOUR) { setLamp(1); }
requestAnimationFrame((t) => { last = t; window.fps.t0 = t; loop(t); });
window.READY = true;
