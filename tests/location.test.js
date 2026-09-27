// Юнит-тесты чистой логики места/времени/URL (без DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CITIES, findCity, parseState, buildQuery, watchTime,
} from "../js/location.js";
import { jdFromDate } from "../js/astromath.js";

test("CITIES: ~60 городов, все с валидными полями", () => {
  assert.ok(CITIES.length >= 50 && CITIES.length <= 80, `length=${CITIES.length}`);
  const ids = new Set();
  for (const c of CITIES) {
    assert.match(c.id, /^[a-z0-9-]+$/, c.id);
    assert.ok(!ids.has(c.id), `dup id ${c.id}`);
    ids.add(c.id);
    assert.ok(typeof c.ru === "string" && c.ru.length > 0);
    assert.ok(c.lat >= -90 && c.lat <= 90);
    assert.ok(c.lon >= -180 && c.lon <= 180);
  }
  assert.ok(findCity("moscow"), "Москва есть");
  assert.ok(findCity("sochi"), "Сочи есть");
});

test("parseState: пустой URL → дефолт Москва, сейчас", () => {
  const s = parseState("");
  assert.equal(s.cityId, "moscow");
  assert.equal(s.lat, 55.755);
  assert.equal(s.isNow, true);
  assert.equal(s.date, null);
});

test("parseState: несуществующий город → тихий дефолт (Review Focus No2)", () => {
  const s = parseState("?c=xyz");
  assert.equal(s.cityId, "moscow");
  assert.equal(s.isNow, true);
});

test("parseState: битое время → игнорировать параметр t, без крэша", () => {
  const s = parseState("?c=sochi&t=абракадабра");
  assert.equal(s.cityId, "sochi");
  assert.equal(s.lat, 43.603);
  assert.equal(s.isNow, true);
  assert.equal(s.date, null);
});

test("parseState: валидные c и t → город и момент", () => {
  const s = parseState("?c=spb&t=2026-01-15T21:30");
  assert.equal(s.cityId, "spb");
  assert.equal(s.isNow, false);
  assert.ok(s.date instanceof Date);
  const jd = watchTime(s);
  assert.ok(Math.abs(jd - jdFromDate(new Date(2026, 0, 15, 21, 30))) < 1e-9);
});

test("watchTime: isNow → актуальный момент", () => {
  const before = jdFromDate(new Date());
  const jd = watchTime({ cityId: "moscow", date: null });
  const after = jdFromDate(new Date());
  assert.ok(jd >= before - 1e-9 && jd <= after + 1e-9);
});

test("buildQuery: дефолт → пусто; город ≠ Москва пишется; время ≠ сейчас → t", () => {
  assert.equal(buildQuery({ cityId: null, date: null }), "");
  assert.equal(buildQuery({ cityId: "moscow", date: null }), "");
  assert.equal(buildQuery({ cityId: "sochi", date: null }), "?c=sochi");
  const q = buildQuery({ cityId: "sochi", date: new Date(2026, 8, 27, 21, 0) });
  assert.match(q, /^\?c=sochi&t=\d{4}-\d{2}-\d{2}T\d{2}%3A\d{2}$/);
});
