// Рамка сцены = эталону: матричный путь (equatorialToVector →
// skyRotationMatrix) обязан совпадать с тестированным astromath
// (equatorialToHorizontal → horizontalToDirection), в т.ч. ВНЕ меридиана.
// Ловит зеркалирование неба восток–запад (X): меридианные эталоны его не видят.
import test from "node:test";
import assert from "node:assert/strict";
import {
  equatorialToHorizontal,
  horizontalToDirection,
} from "../js/astromath.js";
import { equatorialToVector, skyRotationMatrix } from "../js/skydata.js";

function viaMatrix(ra, dec, lst, lat) {
  const v = equatorialToVector(ra, dec);
  const m = new Float32Array(16);
  skyRotationMatrix(lst, lat, m);
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
  ];
}

const CASES = [
  ["Вега восходит (восток)", 18.6156, 38.78, 12.0, 55.755],
  ["Ригель заходит (запад)", 5.24, -8.2, 12.0, 55.755],
  ["Полярная", 2.53, 89.26, 10.0, 55.755],
  ["Южное полушарие", 6.75, -16.7, 3.0, -33.9],
  ["Зенит (LST=RA, dec=lat)", 10.0, 40.0, 10.0, 40.0],
];

for (const [name, ra, dec, lst, lat] of CASES) {
  test(`skyframe: ${name} — матрица = astromath`, () => {
    const { alt, az } = equatorialToHorizontal(ra, dec, lst, lat);
    const ref = horizontalToDirection(alt, az);
    const got = viaMatrix(ra, dec, lst, lat);
    for (let i = 0; i < 3; i++) {
      // 1e-6: шум Float32Array матрицы; физическое расхождение ≥1e-3
      assert.ok(
        Math.abs(ref[i] - got[i]) < 1e-6,
        `${name}: comp[${i}] ref=${ref[i]} got=${got[i]}`
      );
    }
  });
}
