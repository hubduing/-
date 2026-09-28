// Загрузка и подготовка данных неба.

const BASE = "data/";
const DEG = Math.PI / 180;

/** Загрузка JSON-артефактов. Бросает ошибку при сетевой/JSON-проблеме. */
export async function loadSkyData() {
  const [stars, constellations, milkyway] = await Promise.all([
    fetch(BASE + "stars.json").then((r) => r.json()),
    fetch(BASE + "constellations.json").then((r) => r.json()),
    fetch(BASE + "milkyway.json").then((r) => r.json()),
  ]);
  // мифы и мета иллюстраций — необязательные: при отсутствии только предупреждение
  let myths = null, mythMeta = null;
  try {
    const [m, mm] = await Promise.all([
      fetch(BASE + "myths.json").then((r) => (r.ok ? r.json() : null)),
      fetch("assets/myths/meta.json").then((r) => (r.ok ? r.json() : null)),
    ]);
    myths = m; mythMeta = mm;
  } catch (e) {
    console.warn("Мифы не загружены:", e);
  }
  return { stars, constellations, milkyway, myths, mythMeta };
}

/**
 * B−V → RGB, компоненты 0..1. Табличное приближение цвета звёзд.
 */
export function bvToColor(bv) {
  if (bv === null || bv === undefined) return [1, 1, 1];
  const t = Math.max(-0.3, Math.min(1.8, bv));
  const stops = [
    [-0.3, 0.62, 0.72, 1.0],
    [0.0, 0.9, 0.93, 1.0],
    [0.3, 1.0, 1.0, 0.96],
    [0.6, 1.0, 0.92, 0.78],
    [1.0, 1.0, 0.78, 0.55],
    [1.4, 1.0, 0.6, 0.4],
    [1.8, 1.0, 0.45, 0.3],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, r0, g0, b0] = stops[i];
    const [t1, r1, g1, b1] = stops[i + 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

/**
 * Экваториальные (α, δ) → единичный вектор локальной group-системы:
 *   x = cosδ·cosα, y = cosδ·sinα, z = sinδ (NCP = +Z).
 * Правая тройка: x×y=z. skyRotationMatrix переводит её в горизонтальный
 * базис камеры (east=+X, up=+Y, north=−Z), согласованный с
 * astromath.horizontalToDirection (проверено tests/skyframe.test.js,
 * в т.ч. вне меридиана — меридианные эталоны зеркала E–W не ловят).
 */
export function equatorialToVector(raH, decDeg, out = [0, 0, 0]) {
  const a = raH * 15 * DEG;
  const d = decDeg * DEG;
  const cd = Math.cos(d);
  out[0] = cd * Math.cos(a);
  out[1] = cd * Math.sin(a);
  out[2] = Math.sin(d);
  return out;
}

/**
 * Матрица неба (THREE.Matrix4, column-major): экваториальный вектор
 * equatorialToVector(α,δ) → горизонтальный базис камеры
 * (east=+X, up=+Y, north=−Z), согласованный с astromath.
 * Строки (row-major), L=LST·15°, φ=широта:
 *   east  = (−sinL, cosL, 0)
 *   up    = (cosφ·cosL, cosφ·sinL, sinφ)
 *   south = (sinφ·cosL, sinφ·sinL, −cosφ)
 * Собственное вращение (r0×r1=r2). Эталоны: звезда (α=LST, δ=φ) → зенит
 * (0,1,0); NCP (0,0,1) → (0, sinφ, −cosφ) — север на высоте φ.
 * @param {Float32Array} out массив из 16 чисел
 */
export function skyRotationMatrix(lstHours, latDeg, out) {
  const a = lstHours * 15 * DEG;
  const f = latDeg * DEG;
  const sa = Math.sin(a), ca = Math.cos(a);
  const sf = Math.sin(f), cf = Math.cos(f);
  // row-major M:
  //  [ -sa,      ca,     0   ]
  //  [ cf*ca, cf*sa,    sf   ]
  //  [ sf*ca, sf*sa,   -cf   ]
  out[0] = -sa;    out[4] = ca;     out[8] = 0;   out[12] = 0;
  out[1] = cf * ca; out[5] = cf * sa; out[9] = sf;  out[13] = 0;
  out[2] = sf * ca; out[6] = sf * sa; out[10] = -cf; out[14] = 0;
  out[3] = 0; out[7] = 0; out[11] = 0; out[15] = 1;
  return out;
}

/**
 * Средний экваториальный (ra,dec) всех вершин линий фигуры.
 */
export function figCentroid(c) {
  let sx = 0, sy = 0, sz = 0;
  for (const seg of c.lines) {
    for (const [ra, dec] of seg) {
      const a = ra * 15 * DEG, d = dec * DEG;
      sx += Math.cos(d) * Math.cos(a); sy += Math.cos(d) * Math.sin(a); sz += Math.sin(d);
    }
  }
  const raH = (Math.atan2(sy, sx) / DEG + 360) % 360 / 15;
  return { ra: raH, dec: Math.atan2(sz, Math.hypot(sx, sy)) / DEG };
}

/**
 * Угловой радиус (в градусах) фигуры вокруг центроида — для масштаба SVG.
 */
export function constAngularRadius(c) {
  const ctr = figCentroid(c);
  const cv = equatorialToVector(ctr.ra, ctr.dec);
  let max = 0;
  for (const seg of c.lines) {
    for (const [ra, dec] of seg) {
      const v = equatorialToVector(ra, dec);
      const dot = Math.max(-1, Math.min(1, cv[0] * v[0] + cv[1] * v[1] + cv[2] * v[2]));
      max = Math.max(max, Math.acos(dot) / DEG);
    }
  }
  return max;
}
