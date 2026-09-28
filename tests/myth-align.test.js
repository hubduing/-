// Сквозная проверка Review Focus №5 / Task 9: золотой SVG-кокон совпадает
// со звёздной фигурой на небе.
// Цепочка: committed SVG (px) → UV (flipY) → quad (mythQuadBasis, 0.96R) →
// камера в центре → NDC; рядом: (ra,dec) → equatorialToVector → та же камера
// → NDC. Совпадение = кокон лежит на своих звёздах (без зеркалирования).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "../vendor/three.module.js";
import { mythQuadBasis } from "../js/scene.js";
import { equatorialToVector } from "../js/skydata.js";

const R = 500;
const root = new URL("..", import.meta.url).pathname;
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf-8");

function loadCase(cid) {
  const consts = JSON.parse(read("../data/constellations.json"));
  const metaAll = JSON.parse(read("../assets/myths/meta.json"));
  const c = consts.find((x) => x.id === cid);
  const meta = metaAll[cid];
  const svg = read(`../assets/myths/${cid}.svg`);
  const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const W = +vb[1], H = +vb[2];
  const lines = [...svg.matchAll(/<line x1="(\d+)" y1="(\d+)" x2="(\d+)" y2="(\d+)"\/>/g)]
    .map((m) => [+m[1], +m[2], +m[3], +m[4]]);
  return { c, meta, W, H, lines };
}

// Камера в центре сферы, смотрит на центроид, up = север локальной
// group-системы (NCP=+Z): east=NCP×d, north=d×east.
function makeCamera(ra, dec) {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);
  const d = equatorialToVector(ra, dec);
  const target = new THREE.Vector3(d[0], d[1], d[2]);
  const ncp = new THREE.Vector3(0, 0, 1);
  const east = new THREE.Vector3().crossVectors(ncp, target).normalize();
  const north = new THREE.Vector3().crossVectors(target, east).normalize();
  cam.position.set(0, 0, 0);
  cam.up.copy(north);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  return cam;
}

function ndcOf(v3, cam) {
  const v = v3.clone().project(cam);
  return [v.x, v.y];
}

function checkCase(cid) {
  const { c, meta, W, H, lines } = loadCase(cid);
  assert.equal(lines.length, c.lines.length, `${cid}: SVG линий = линий фигуры`);
  const basis = mythQuadBasis(meta.ra, meta.dec);
  const cam = makeCamera(meta.ra, meta.dec);
  const D2R = Math.PI / 180;
  let worst = 0;
  // каждые концы SVG-линий ↔ (ra,dec) той же линии фигуры.
  // Независимая проверка (без репликации геометрии quad'а): пиксель SVG →
  // гномонические градусы → направление → NDC обязано совпасть со звездой.
  const pts = [];
  lines.forEach((L, i) => {
    pts.push([L[0], L[1], c.lines[i][0]], [L[2], L[3], c.lines[i][1]]);
  });
  for (const [px, py, radec] of pts) {
    const v = 1 - py / H; // CanvasTexture flipY=true
    const XD = (px / W - 0.5) * meta.wDeg * D2R;
    const YD = (v - 0.5) * meta.hDeg * D2R;
    const dir = new THREE.Vector3(XD, YD, 1).normalize().applyMatrix4(basis);
    const [ax, ay] = ndcOf(dir.clone().multiplyScalar(R), cam);
    const sv = equatorialToVector(radec[0], radec[1]);
    const [bx, by] = ndcOf(new THREE.Vector3(sv[0], sv[1], sv[2]).multiplyScalar(R), cam);
    worst = Math.max(worst, Math.hypot(ax - bx, ay - by));
  }
  return worst;
}

for (const cid of ["ori", "cyg", "cas"]) {
  test(`myth cocoon ${cid}: SVG-фигура на своих звёздах в NDC`, () => {
    // 0.03 NDC ≈ 1°: округление SVG до целых px + нелинейность; зеркало дало бы ≥0.4
    const worst = checkCase(cid);
    assert.ok(worst < 0.03, `${cid}: worst NDC drift=${worst}`);
  });
}
void root;
