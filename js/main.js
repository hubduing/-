// Точка входа: загрузка данных, сцена, цикл, дефолт «Москва, сейчас».
import * as THREE from "../vendor/three.module.js";
import { loadSkyData } from "./skydata.js";
import { createSkyScene, SPHERE_RADIUS } from "./scene.js";
import { createControls } from "./controls.js";
import { jdFromDate } from "./astromath.js";

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

  // дефолт: Москва, сейчас (до Task 7 геолокации)
  sky.setTimeLocation(jdFromDate(new Date()), 55.755, 37.62);

  const controls = createControls(sky.camera, canvas, sky);
  window.__sky = sky; // отладка

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
