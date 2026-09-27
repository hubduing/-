// Точка входа: загрузка данных, сцена, цикл, панель места/времени.
import * as THREE from "../vendor/three.module.js";
import { loadSkyData } from "./skydata.js";
import { createSkyScene, SPHERE_RADIUS } from "./scene.js";
import { createControls } from "./controls.js";
import { resolveStart, applyStateToUrl, watchTime, findCity, CITIES } from "./location.js";
import { createUI } from "./ui.js";

const canvas = document.getElementById("sky");
const loader = document.getElementById("loader");

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

async function boot() {
  if (!hasWebGL()) {
    loader.hidden = true;
    document.getElementById("no-webgl").hidden = false;
    return;
  }
  const data = await loadSkyData();
  const sky = createSkyScene(canvas, data);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setClearColor(0x05070d, 1);

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4 ||
    devicePixelRatio < 1.5;
  sky.setTwinkle(!reduceMotion && !lowPower);

  function resize() {
    const pr = Math.min(devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    sky.camera.aspect = innerWidth / innerHeight;
    sky.camera.updateProjectionMatrix();
    sky.setPixelRatio(pr);
  }
  addEventListener("resize", resize);
  resize();

  // --- состояние места/времени и панель «Где я?» (ui-lite до Task 8) ---
  const state = await resolveStart();
  sky.setTimeLocation(watchTime(state), state.lat, state.lon);

  const $ = (id) => document.getElementById(id);
  const panel = $("location-panel"), notice = $("watch-notice"),
        slider = $("hour-slider"), dateInput = $("date-input");

  function refresh() {
    sky.setTimeLocation(watchTime(state), state.lat, state.lon);
    applyStateToUrl(state);
    const now = state.isNow;
    notice.hidden = now;
    if (!now) {
      const d = state.date;
      const where = state.geo ? "моё местоположение"
        : (findCity(state.cityId)?.ru || "Москва");
      const dayMonth = d.toLocaleString("ru", { day: "numeric", month: "long" });
      $("watch-text").textContent =
        `Вы смотрите небо: ${where}, ${dayMonth}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
  }

  $("btn-location").addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      const d = state.isNow ? new Date() : state.date;
      slider.value = d.getHours() + d.getMinutes() / 60;
      dateInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      renderCities("");
    }
  });
  $("btn-close-location").addEventListener("click", () => (panel.hidden = true));

  function setTime(d) {
    state.date = d;
    state.isNow = false;
    refresh();
  }
  let throttle = 0;
  function setTimeThrottled(d) {
    state.date = d; state.isNow = false;
    const t = performance.now();
    if (t - throttle > 60) { throttle = t; refresh(); }
    else { clearTimeout(setTimeThrottled._id); setTimeThrottled._id = setTimeout(refresh, 70); }
  }
  slider.addEventListener("input", () => {
    const h = parseFloat(slider.value);
    const d = new Date(state.date || new Date());
    d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    setTimeThrottled(d);
  });
  dateInput.addEventListener("change", () => {
    const [y, m, dd] = dateInput.value.split("-").map(Number);
    const d = new Date(state.date || new Date());
    d.setFullYear(y, m - 1, dd);
    setTime(d);
  });
  const shift = (ms) => () => setTime(new Date((state.date || new Date()).getTime() + ms));
  $("btn-minus-hour").addEventListener("click", shift(-3600e3));
  $("btn-plus-hour").addEventListener("click", shift(3600e3));
  $("btn-minus-day").addEventListener("click", shift(-86400e3));
  $("btn-plus-day").addEventListener("click", shift(86400e3));
  $("btn-now").addEventListener("click", () => {
    state.date = null; state.isNow = true; refresh();
  });
  $("btn-geo").addEventListener("click", () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        Object.assign(state, {
          cityId: null, lat: pos.coords.latitude, lon: pos.coords.longitude, geo: true,
        });
        refresh();
      },
      () => { try { sessionStorage.setItem("geo-denied", "1"); } catch {} },
      { timeout: 4000 }
    );
  });

  function renderCities(q) {
    const list = $("city-list");
    list.innerHTML = "";
    const s = q.trim().toLowerCase();
    for (const c of CITIES) {
      if (s && !c.ru.toLowerCase().includes(s)) continue;
      const b = document.createElement("button");
      b.className = "city-item";
      b.textContent = c.ru;
      b.addEventListener("click", () => {
        Object.assign(state, { cityId: c.id, lat: c.lat, lon: c.lon, geo: false });
        panel.hidden = true;
        refresh();
      });
      list.appendChild(b);
    }
  }
  $("city-search").addEventListener("input", () => renderCities($("city-search").value));
  renderCities("");
  refresh();


  const controls = createControls(sky.camera, canvas, sky);
  window.__sky = sky; // отладка
  const ui = createUI(sky, controls);
  window.__ui = ui; // отладка

  loader.hidden = true;
  canvas.style.opacity = "0";
  canvas.style.transition = reduceMotion ? "none" : "opacity 1.5s";
  requestAnimationFrame(() => (canvas.style.opacity = "1"));
  document.getElementById("hint").hidden = false;
  document.getElementById("topbar").hidden = false;
  const hideHint = () => { document.getElementById("hint").hidden = true; };
  canvas.addEventListener("pointerdown", hideHint, { once: true });
  window.__controls = controls; // для автотестов

  let last = performance.now(), hidden = false;
  document.addEventListener("visibilitychange", () => (hidden = document.hidden));
  function frame(now) {
    requestAnimationFrame(frame);
    if (hidden) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    sky.tick(now / 1000);
    controls.update(dt);
    renderer.render(sky.scene, sky.camera);
    // отладочный снимок сразу после рендера (для автотестов)
    if (window.__checkRequested) {
      window.__checkRequested = false;
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const buf = new Uint8Array(4 * w * h);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let bright = 0, maxV = 0;
      for (let i = 0; i < buf.length; i += 4) {
        const v = buf[i] + buf[i + 1] + buf[i + 2];
        if (v > 30) bright++;
        if (v > maxV) maxV = v;
      }
      window.__renderCheck = { bright, maxV, w, h, t: now };
    }
  }
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  loader.querySelector(".loader-text").textContent =
    "Не удалось загрузить данные неба. Обновите страницу.";
});
