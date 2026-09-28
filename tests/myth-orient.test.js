// Ориентация миф-квадов: SVG нарисован с осью X = восток вправо;
// наблюдатель из центра сферы должен видеть восток СЛЕВА (как настоящие звёзды).
// Правильный базис: X=восток, Y=север, Z=наружу (+d) — собственное вращение
// (det=+1); quad виден с тыла (DoubleSide) и текстура ложится без зеркалирования.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.js";
import { mythQuadBasis, curveQuadToSphere } from "../js/scene.js";
import { equatorialToVector } from "../js/skydata.js";

function col(m, i) {
  const e = m.elements;
  return new THREE.Vector3(e[i * 4], e[i * 4 + 1], e[i * 4 + 2]);
}

// Орион ~ (5.5ч, +2°), Дракон — высокий dec, Медведица — около полюса.
const CASES = [
  [5.5, 2],
  [15.0, 65.0],
  [16.0, 75.0],
];

for (const [ra, dec] of CASES) {
  test(`mythQuadBasis(${ra}h, ${dec}°): собственное вращение, Z наружу`, () => {
    const m = mythQuadBasis(ra, dec);
    assert.ok(Math.abs(m.determinant() - 1) < 1e-9, `det=${m.determinant()}`);
    const d = equatorialToVector(ra, dec);
    const dv = new THREE.Vector3(d[0], d[1], d[2]).normalize();
    assert.ok(col(m, 2).dot(dv) > 0.999, "Z должен смотреть наружу (+d)");
    // восток = направление роста RA: NCP(+Z)×d
    const ncp = new THREE.Vector3(0, 0, 1);
    const east = new THREE.Vector3().crossVectors(ncp, dv).normalize();
    assert.ok(col(m, 0).dot(east) > 0.999, "X должен смотреть на восток");
  });
}

test("curveQuadToSphere: вершины на сфере, направления сохранены", () => {
  const R = 500;
  const basis = mythQuadBasis(5.5, 2);
  const center = new THREE.Vector3().setFromMatrixColumn(basis, 2).multiplyScalar(R);
  const geo = new THREE.PlaneGeometry(300, 400, 4, 3);
  const before = [];
  for (let i = 0; i < geo.attributes.position.count; i++) {
    before.push(new THREE.Vector3().fromBufferAttribute(geo.attributes.position, i));
  }
  curveQuadToSphere(geo, basis, center, R);
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const l = new THREE.Vector3().fromBufferAttribute(geo.attributes.position, i);
    const world = l.clone().applyMatrix4(basis).add(center);
    // 1e-3: шум Float32 BufferAttribute; физическая ошибка — единицы
    assert.ok(Math.abs(world.length() - R) < 1e-3, `вершина ${i} на сфере`);
    const was = before[i].clone().applyMatrix4(basis).add(center).normalize();
    assert.ok(was.dot(world.clone().normalize()) > 1 - 1e-9, `вершина ${i} то же направление`);
  }
});
