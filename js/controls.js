// Управление «взглядом»: drag/swipe pan по азимуту и высоте, pinch/wheel zoom,
// двойной тап — сброс. Камера в центре сферы; orient по (az, alt).
import * as THREE from "../vendor/three.module.js";

const DEG = Math.PI / 180;
const ALT_MIN = -2, ALT_MAX = 92;
const FOV_MIN = 25, FOV_MAX = 60;

export function createControls(camera, canvas, sky) {
  const state = {
    az: 180,     // смотрим на юг (широкая аудитория: там созвездия)
    alt: 35,
    fov: 60,
    vAz: 0, vAlt: 0,
    enabled: true,
    userMoved: false,
  };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let dragging = false, lastX = 0, lastY = 0, moved = 0, lastTouchT = 0;
  const pointers = new Map();
  let pinchStartDist = 0, pinchStartFov = 60;

  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  function applyCamera() {
    // yaw вокруг Y: +X — восток. Az растёт к востоку → поворот на −Y.
    euler.set(state.alt * DEG, -state.az * DEG, 0);
    camera.quaternion.setFromEuler(euler);
    const clamped = Math.min(FOV_MAX, Math.max(FOV_MIN, state.fov));
    if (camera.fov !== clamped) {
      state.fov = clamped;
      sky.setFov(clamped);
    }
  }

  function pan(dx, dy) {
    const k = state.fov / 60;
    state.az = ((state.az - dx * 0.22 * k) % 360 + 360) % 360;
    state.alt = Math.min(ALT_MAX, Math.max(ALT_MIN, state.alt + dy * 0.22 * k));
    state.vAz = -dx * 0.22 * k;
    state.vAlt = dy * 0.22 * k;
    state.userMoved = true;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!state.enabled) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true; moved = 0;
      lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      // двойной тап
      const now = performance.now();
      if (now - lastTouchT < 320) reset();
      lastTouchT = now;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStartFov = state.fov;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2 && pinchStartDist > 0) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      state.fov = Math.min(FOV_MAX, Math.max(FOV_MIN,
        pinchStartFov * (pinchStartDist / Math.max(1, d))));
      moved += 10; // pinch не считается тапом
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    pan(dx, dy);
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
    if (pointers.size === 0) dragging = false;
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    state.fov = Math.min(FOV_MAX, Math.max(FOV_MIN, state.fov + e.deltaY * 0.03));
  }, { passive: false });

  function reset() {
    if (reduceMotion) {
      state.az = 180; state.alt = 35; state.vAz = state.vAlt = 0;
    } else {
      flyTo(180, 35);
    }
  }

  /** Плавный доворот к (alt, az). */
  let fly = null;
  function flyTo(az, alt, ms = 1200) {
    if (reduceMotion) {
      state.az = az; state.alt = Math.min(ALT_MAX, Math.max(ALT_MIN, alt));
      state.vAz = state.vAlt = 0;
      return;
    }
    fly = {
      t0: performance.now(), ms,
      fromAz: state.az, toAz: az,
      fromAlt: state.alt, toAlt: alt,
    };
    state.vAz = state.vAlt = 0;
  }

  /** update вызывается из rAF-цикла каждый кадр. */
  function update(dt) {
    if (fly) {
      const t = Math.min(1, (performance.now() - fly.t0) / fly.ms);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      let dAz = fly.toAz - fly.fromAz;
      dAz = ((dAz + 180) % 360 + 360) % 360 - 180; // кратчайший путь по азимуту
      state.az = (fly.fromAz + dAz * e + 360) % 360;
      state.alt = fly.fromAlt + (fly.toAlt - fly.fromAlt) * e;
      if (t >= 1) fly = null;
    } else if (!dragging && !reduceMotion && (Math.abs(state.vAz) > 0.01 || Math.abs(state.vAlt) > 0.01)) {
      const decay = Math.exp(-dt / 0.4);
      state.az = ((state.az + state.vAz) % 360 + 360) % 360;
      state.alt = Math.min(ALT_MAX, Math.max(ALT_MIN, state.alt + state.vAlt));
      state.vAz *= decay;
      state.vAlt *= decay;
    }
    applyCamera();
    return { moved };
  }

  return {
    state, update, flyTo, reset,
    get hasMoved() { return state.userMoved; },
    get wasDrag() { return moved > 8; },
  };
}
