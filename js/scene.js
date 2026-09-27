// Сцена неба: звёзды, линии созвездий, подписи, Млечный Путь, горизонт.
// Scene-базис: +Y зенит, −Z север, +X восток (горизонтальная система).
// Небесная группа (equatorial) поворачивается матрицей M = Rx(90°−φ)·Ry(LST).
import * as THREE from "../vendor/three.module.js";
import { precess, gmst } from "./astromath.js";
import { equatorialToVector, skyRotationMatrix, bvToColor } from "./skydata.js";

export const SPHERE_RADIUS = 500;
const KRA = 15 * (Math.PI / 180); // часы → радианы
const LABEL_SCALE = 4;

/* ---------- текстура Млечного Пути (equirectangular RA/Dec) ---------- */
function renderMilkyWayTexture(rings) {
  const W = 2048, H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, W, H);
  const px = (lon, lat) => [((lon % 360) + 360) % 360 / 360 * W, (90 - lat) / 180 * H];

  const strokePath = (lineWidth, strokeStyle) => {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.lineJoin = ctx.lineCap = "round";
    for (const ring of rings) {
      ctx.beginPath();
      let prev = null, started = false;
      for (const [lon, lat] of ring) {
        const [x, y] = px(lon, lat);
        if (!started || (prev && Math.abs(x - prev[0]) > W / 2)) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
        prev = [x, y];
      }
      ctx.closePath();
      ctx.stroke();
    }
  };
  const fill = () => {
    ctx.fillStyle = "rgba(105,115,150,0.32)";
    for (const ring of rings) {
      ctx.beginPath();
      let prev = null, started = false;
      for (const [lon, lat] of ring) {
        const [x, y] = px(lon, lat);
        if (!started || (prev && Math.abs(x - prev[0]) > W / 2)) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
        prev = [x, y];
      }
      ctx.closePath();
      ctx.fill();
    }
  };
  ctx.shadowColor = "rgba(190,200,230,0.45)";
  ctx.shadowBlur = 40;
  fill();
  strokePath(24, "rgba(150,160,195,0.35)");
  ctx.shadowBlur = 0;
  strokePath(8, "rgba(215,220,240,0.18)");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Сфера с ЯВНЫМ соответствие UV ↔ (RA,Dec): вершины генерируются из
 * equatorialToVector, uv.x = RA/24ч, uv.y = (90−Dec)/180. Гарантирует, что
 * equirectangular-текстура ляжет ровно по экваториальным координатам.
 */
function makeEquatorialSphere(radius, tex) {
  const segU = 96, segV = 48;
  const pos = [], uvs = [], idx = [];
  for (let j = 0; j <= segV; j++) {
    const dec = 90 - (j / segV) * 180;
    for (let i = 0; i <= segU; i++) {
      const raH = (i / segU) * 24;
      pos.push(...equatorialToVector(raH, dec).map((v) => v * radius));
      // CanvasTexture flipY=true: uv.y=1 ↔ верх canvas (dec=+90)
      uvs.push(i / segU, 1 - j / segV);
    }
  }
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i, b = a + segU + 1;
      // winding: нормали наружу → BackSide виден изнутри сферы
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, side: THREE.BackSide, transparent: true, opacity: 0.5,
    color: 0x9aa6c4, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/* ---------- спрайты подписей ---------- */
function makeLabelSprite(text) {
  const pad = 10, fs = 64;
  const c = document.createElement("canvas");
  let ctx = c.getContext("2d");
  ctx.font = `${fs}px system-ui, sans-serif`;
  c.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  c.height = fs + pad * 2;
  ctx = c.getContext("2d");
  ctx.font = `${fs}px system-ui, sans-serif`;
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "rgba(214,226,246,0.95)";
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set((c.width / fs) * LABEL_SCALE, LABEL_SCALE, 1);
  return sp;
}

/* ---------- шейдер звёзд ---------- */
const STAR_VERT = `
attribute float size;
attribute float twinkle;
attribute vec3 color;
uniform float uTime;
uniform float uTwinkle;
uniform float uPixelRatio;
uniform float uDim;
varying vec3 vColor;
varying float vFade;
void main() {
  vColor = color;
  float tw = 1.0 + uTwinkle * 0.12 * sin(uTime * (1.5 + twinkle * 3.0) + twinkle * 40.0);
  vFade = uDim * (0.75 + 0.25 * tw);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * uPixelRatio * (1600.0 / -mv.z);
}
`;
const STAR_FRAG = `
varying vec3 vColor;
varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.02, d);
  float halo = smoothstep(0.5, 0.0, d) * 0.45;
  float a = (core + halo) * vFade;
  if (a < 0.012) discard;
  gl_FragColor = vec4(vColor * (0.8 + 0.6 * core), a);
}
`;

/**
 * Создать сцену неба. Возвращает sky с методами управления.
 */
export function createSkyScene(canvas, data) {
  const { stars, constellations, milkyway } = data;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);
  camera.position.set(0, 0, 0);

  const skyGroup = new THREE.Group();
  skyGroup.matrixAutoUpdate = false;
  scene.add(skyGroup);

  // звёзды
  const starPos = new Float32Array(stars.length * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const col = new Float32Array(stars.length * 3);
  const size = new Float32Array(stars.length);
  const tw = new Float32Array(stars.length);
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const [r, g, b] = bvToColor(s.bv);
    col.set([r, g, b], i * 3);
    size[i] = Math.max(0.8, 3.4 - 0.42 * s.mag);
    tw[i] = Math.random();
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("twinkle", new THREE.BufferAttribute(tw, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uTwinkle: { value: 1 },
      uPixelRatio: { value: 1 }, uDim: { value: 1 },
    },
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, starMat);
  points.frustumCulled = false;
  skyGroup.add(points);

  // линии созвездий
  const linePos = [];
  const lineMeta = []; // {id, start, count(вершин)}
  for (const c of constellations) {
    const start = linePos.length / 3;
    for (const [a, b] of c.lines) {
      linePos.push(0, 0, 0, 0, 0, 0);
    }
    lineMeta.push({ id: c.id, start, count: linePos.length / 3 - start, src: c.lines });
  }
  const lineGeo = new THREE.BufferGeometry();
  const lineArr = new Float32Array(linePos);
  lineGeo.setAttribute("position", new THREE.BufferAttribute(lineArr, 3));
  const lineCol = new Float32Array(lineArr.length).fill(0.75);
  lineGeo.setAttribute("color", new THREE.BufferAttribute(lineCol, 3));
  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  skyGroup.add(lines);

  // подписи
  const labelGroup = new THREE.Group();
  skyGroup.add(labelGroup);
  const labels = constellations.map((c) => {
    const sp = makeLabelSprite(c.ru);
    sp.userData.constId = c.id;
    labelGroup.add(sp);
    return { sp, ra: c.label.ra, dec: c.label.dec };
  });

  // невидимые сферические «мишени» в центроидах — надёжный тап по созвездию
  const pickGroup = new THREE.Group();
  skyGroup.add(pickGroup);
  const pickMeshes = constellations.map((c) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    m.userData.constId = c.id;
    m.scale.setScalar(12);
    pickGroup.add(m);
    return { m, ra: c.label.ra, dec: c.label.dec };
  });

  // Млечный Путь
  skyGroup.add(makeEquatorialSphere(SPHERE_RADIUS * 1.05, renderMilkyWayTexture(milkyway)));

  // горизонт + земля (горизонтальная система, не вращается со skyGroup)
  const groundGroup = new THREE.Group();
  scene.add(groundGroup);
  {
    const grad = document.createElement("canvas");
    grad.width = 4; grad.height = 128;
    const g = grad.getContext("2d");
    const lg = g.createLinearGradient(0, 0, 0, 128);
    lg.addColorStop(0, "rgba(10,12,18,0.0)");
    lg.addColorStop(0.06, "rgba(9,11,17,0.9)");
    lg.addColorStop(0.45, "rgba(5,6,11,1)");
    lg.addColorStop(1, "rgba(4,5,10,1)");
    g.fillStyle = lg;
    g.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(grad);
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(SPHERE_RADIUS * 1.06, SPHERE_RADIUS * 1.06, SPHERE_RADIUS * 0.55, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, depthWrite: false })
    );
    cyl.position.y = -SPHERE_RADIUS * 0.27;
    cyl.renderOrder = 5; // рисуем после звёзд/GP: закрывает всё под горизонтом
    groundGroup.add(cyl);
    const horizon = new THREE.Mesh(
      new THREE.TorusGeometry(SPHERE_RADIUS, 0.7, 6, 128),
      new THREE.MeshBasicMaterial({ color: 0x39415a, transparent: true, opacity: 0.65 })
    );
    horizon.rotation.x = Math.PI / 2;
    horizon.renderOrder = 6;
    groundGroup.add(horizon);
  }

  // подписи сторон света — зафиксированы по азимуту (в groundGroup, не в skyGroup)
  {
    const dirs = [
      { t: "С", x: 0, z: -1 },   // север: −Z
      { t: "Ю", x: 0, z: 1 },    // юг: +Z
      { t: "В", x: 1, z: 0 },    // восток: +X
      { t: "З", x: -1, z: 0 },   // запад: −X
    ];
    for (const d of dirs) {
      const sp = makeLabelSprite(d.t);
      const r = SPHERE_RADIUS * 0.99;
      sp.position.set(d.x * r, 14, d.z * r);
      sp.scale.multiplyScalar(4.5); // стороны света крупнее подписей созвездий
      sp.renderOrder = 7; // поверх земли
      groundGroup.add(sp);
    }
  }

  // ---- методы ----
  const rot = new Float32Array(16);
  const v = [0, 0, 0];

  function fillPositions(jd) {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const { ra, dec } = precess(s.ra, s.dec, jd);
      equatorialToVector(ra, dec, v);
      starPos[i * 3] = v[0] * SPHERE_RADIUS;
      starPos[i * 3 + 1] = v[1] * SPHERE_RADIUS;
      starPos[i * 3 + 2] = v[2] * SPHERE_RADIUS;
    }
    let cur = 0;
    for (const m of lineMeta) {
      for (const [a, b] of m.src) {
        const pa = precess(a[0], a[1], jd);
        const pb = precess(b[0], b[1], jd);
        equatorialToVector(pa.ra, pa.dec, v);
        lineArr[cur++] = v[0] * SPHERE_RADIUS; lineArr[cur++] = v[1] * SPHERE_RADIUS; lineArr[cur++] = v[2] * SPHERE_RADIUS;
        equatorialToVector(pb.ra, pb.dec, v);
        lineArr[cur++] = v[0] * SPHERE_RADIUS; lineArr[cur++] = v[1] * SPHERE_RADIUS; lineArr[cur++] = v[2] * SPHERE_RADIUS;
      }
    }
    for (const l of labels) {
      const p = precess(l.ra, l.dec, jd);
      equatorialToVector(p.ra, p.dec, v);
      l.sp.position.set(v[0] * SPHERE_RADIUS * 0.97, v[1] * SPHERE_RADIUS * 0.97, v[2] * SPHERE_RADIUS * 0.97);
    }
    for (const t of pickMeshes) {
      const p = precess(t.ra, t.dec, jd);
      equatorialToVector(p.ra, p.dec, v);
      t.m.position.set(v[0] * SPHERE_RADIUS, v[1] * SPHERE_RADIUS, v[2] * SPHERE_RADIUS);
    }
    geo.attributes.position.needsUpdate = true;
    lineGeo.attributes.position.needsUpdate = true;
  }

  const sky = {
    scene, camera, points, lines, labelGroup, groundGroup, skyGroup, lineMeta,
    _raycaster: new THREE.Raycaster(),
    /**
     * Тап по экранным координатам → id созвездия или null.
     * @param {number} ndcx [-1..1], @param {number} ndcy [-1..1]
     */
    pickConstellation(ndcx, ndcy) {
      this._raycaster.setFromCamera({ x: ndcx, y: ndcy }, camera);
      const hits = this._raycaster.intersectObjects(pickGroup.children, false);
      return hits.length ? hits[0].object.userData.constId : null;
    },
    /** Горизонтальные координаты (alt/az, градусы) центроида созвездия. */
    constAltAz(id) {
      const c = constellations.find((x) => x.id === id);
      if (!c) return null;
      const t = pickMeshes.find((p) => p.m.userData.constId === id);
      if (!t) return null;
      const world = t.m.position.clone().applyMatrix4(skyGroup.matrix);
      const n = world.normalize();
      const alt = Math.asin(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI;
      const az = (Math.atan2(n.x, -n.z) * 180 / Math.PI + 360) % 360;
      return { alt, az };
    },
    byId: (id) => constellations.find((c) => c.id === id),
    setTimeLocation(jd, latDeg, lonDeg) {
      fillPositions(jd);
      const lstHours = (((gmst(jd) + lonDeg / 15) % 24) + 24) % 24;
      skyRotationMatrix(lstHours, latDeg, rot);
      skyGroup.matrix.fromArray(rot);
    },
    setFov(deg) {
      camera.fov = Math.min(60, Math.max(25, deg));
      camera.updateProjectionMatrix();
    },
    setDim(dim) { starMat.uniforms.uDim.value = dim; },
    setTwinkle(on) { starMat.uniforms.uTwinkle.value = on ? 1 : 0; },
    setPixelRatio(pr) { starMat.uniforms.uPixelRatio.value = pr; },
    /** id подсвеченного созвездия или null */
    setHighlight(id) {
      for (let i = 0; i < lineCol.length / 3; i++) lineCol[i * 3] = lineCol[i * 3 + 1] = lineCol[i * 3 + 2] = 0.75;
      if (id) {
        const m = lineMeta.find((x) => x.id === id);
        const others = id ? 0.22 : 0.75;
        for (let i = 0; i < lineCol.length / 3; i++) {
          if (!(m && i >= m.start && i < m.start + m.count)) {
            lineCol[i * 3] = lineCol[i * 3 + 1] = lineCol[i * 3 + 2] = others;
          }
        }
        for (let i = m.start; i < m.start + m.count; i++) {
          lineCol[i * 3] = 1.0; lineCol[i * 3 + 1] = 0.72; lineCol[i * 3 + 2] = 0.24;
        }
      }
      lineGeo.attributes.color.needsUpdate = true;
      for (const l of labelGroup.children) {
        l.material.opacity = id && l.userData.constId !== id ? 0.2 : 1;
      }
    },
    tick(t) { starMat.uniforms.uTime.value = t; },
  };

  return sky;
}
