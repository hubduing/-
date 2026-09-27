import { test } from "node:test";
import assert from "node:assert/strict";
import {
  jdFromDate,
  gmst,
  lsta,
  precess,
  equatorialToHorizontal,
  horizontalToDirection,
} from "../js/astromath.js";

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} !~ ${b} (±${tol})`);

test("jdFromDate: J2000 эпоха", () => {
  close(jdFromDate(new Date(Date.UTC(2000, 0, 1, 12))), 2451545.0, 0.001);
  close(jdFromDate(new Date(Date.UTC(2026, 8, 27, 0))), 2461310.5, 0.001);
});

test("gmst: эталон Meeus 2000-01-01 12:00 UT ≈ 18.6973 h", () => {
  close(gmst(2451545.0), 18.6973, 0.01);
  // за солнечные сутки GMST прибывает на 24.0657ч → по модулю 24: +0.0657ч
  const gm1 = gmst(2451545.0);
  const gm2 = gmst(2451546.0);
  close(((gm2 - gm1 + 24) % 24), 0.065709, 0.0005);
});

test("lsta: долгота добавляется, wrap [0,24)", () => {
  close(lsta(10, 90), 16, 1e-9);    // восток +90° = +6h
  close(lsta(20, -90), 14, 1e-9);   // запад −90° = −6h
  close(lsta(22, 120), 6, 1e-9);    // wrap
});

test("precess: в J2000 — без изменений", () => {
  const r = precess(18.6156, 38.7837, 2451545.0);
  close(r.ra, 18.6156, 1e-6);
  close(r.dec, 38.7837, 1e-6);
});

test("precess: Вега за 50 лет: RA +0.028ч, Dec +0.045° (Meeus, gl.21)", () => {
  const jd2050 = 2451545.0 + 50 * 365.25;
  const r = precess(18.6156, 38.7837, jd2050);
  close(r.ra - 18.6156, 0.028, 0.004);
  close(r.dec - 38.7837, 0.045, 0.008);
});

test("equatorialToHorizontal: Вега в верхнюю кульминацию (LST=RA)", () => {
  // lat Москва 55.755, dec 38.7837 < lat → кульминация к ЮГУ от зенита:
  // alt = 90 − (lat−dec) = 73.0°, az = 180°
  const { alt, az } = equatorialToHorizontal(18.61565, 38.7837, 18.61565, 55.755);
  close(alt, 73.0, 0.3);
  close(az, 180, 0.5);
});

test("equatorialToHorizontal: Сириус в верхнюю кульминацию", () => {
  // dec −16.72, lat 55.755 → alt = 90 − (55.755+16.72) ≈ 17.5°, азимут 180° (юг)
  const { alt, az } = equatorialToHorizontal(6.7525, -16.7157, 6.7525, 55.755);
  close(alt, 17.5, 0.3);
  close(az, 180, 0.5);
});

test("equatorialToHorizontal: восход на востоке (H = −6h) для небесного экватора", () => {
  // dec=0: alt = asin(cos lat·cos H) = 0 при |H|=90°; H=−6h (объект на
  // 6h восточнее меридиана, т.е. LST = RA − 6) → восходит: az = 90°.
  const { alt, az } = equatorialToHorizontal(0, 0, 18, 55.755);
  close(alt, 0, 0.2);
  close(az, 90, 0.5);
});

test("horizontalToDirection: базис", () => {
  const d = (v, i) => close(v[i], 0, 1e-9);
  let v = horizontalToDirection(0, 0);   // север на горизонте
  d(v, 0); close(v[1], 0, 1e-9); close(v[2], -1, 1e-9);
  v = horizontalToDirection(90, 0);      // зенит
  close(v[1], 1, 1e-9);
  v = horizontalToDirection(0, 90);      // восток
  close(v[0], 1, 1e-9); d(v, 1); d(v, 2);
  v = horizontalToDirection(0, 180);     // юг
  close(v[2], 1, 1e-9);
});
