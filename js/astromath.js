// Астрономическая математика: JD, звёздное время, прецессия, конвертация
// координат. Формулы — Meeus "Astronomical Algorithms" (упрощённые ряды;
// точность достаточна для визуализации на ±несколько веков от J2000).

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Юлианская дата по Date (UT). */
export function jdFromDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Среднее гринвичское звёздное время, часы [0, 24). Meeus gl.12.4. */
export function gmst(jd) {
  const t = (jd - 2451545.0) / 36525;
  let gm =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * t * t -
    (t * t * t) / 38710000;
  gm = ((gm % 360) + 360) % 360;
  return gm / 15;
}

/** Местное звёздное время, часы. Долгота: восток положительный. */
export function lsta(gmstH, lonDeg) {
  return (((gmstH + lonDeg / 15) % 24) + 24) % 24;
}

/**
 * Линейная прецессия J2000 → момент jd.
 * Meeus gl.21 (линейные члены): dRA = m + n·sin(RA)·tg(Dec), dDec = n·cos(RA),
 * m = 3.07496″/год, n = 20.0431″/год. Для ±веков от J2000 достаточно.
 * @param raH часы J2000; @param decDeg градусы J2000.
 * @returns {{ra: number, dec: number}} — часы/градусы в эпохе jd.
 */
export function precess(raH, decDeg, jd) {
  const years = (jd - 2451545.0) / 365.25;
  // m = 3.07496 s(времени)/год = 46.124″(угла)/год
  const m = (3.07496 * 15 / 3600) * DEG * years; // рад по RA
  const n = (20.0431 / 3600) * DEG * years;      // рад
  const ra = raH * 15 * DEG;
  const dec = decDeg * DEG;
  const newRa = ra + m + n * Math.sin(ra) * Math.tan(dec);
  const newDec = dec + n * Math.cos(ra);
  return {
    ra: ((((newRa * RAD / 15) % 24) + 24) % 24),
    dec: newDec * RAD,
  };
}

/**
 * Экваториальные → горизонтальные.
 * @returns {{alt: number, az: number}} градусы; азимут от севера через восток.
 */
export function equatorialToHorizontal(raH, decDeg, lstHours, latDeg) {
  const ha = (lstHours - raH) * 15 * DEG; // часовый угол, радианы
  const dec = decDeg * DEG;
  const lat = latDeg * DEG;
  const sinAlt =
    Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * RAD;
  // Азимут от севера через восток: az = atan2(−sin H·cos δ, sin δ·cos φ − cos δ·sin φ·cos H)
  const y = -Math.sin(ha) * Math.cos(dec);
  const x = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(ha);
  const az = (Math.atan2(y, x) * RAD + 360) % 360;
  return { alt, az };
}

/**
 * Alt/Az → единичный вектор scene-системы Three.js:
 * +Y вверх (зенит), −Z горизонт-север, +X восток, +Z юг.
 */
export function horizontalToDirection(altDeg, azDeg) {
  const alt = altDeg * DEG;
  const az = azDeg * DEG;
  const cosAlt = Math.cos(alt);
  return [
    cosAlt * Math.sin(az),   // восток (+X)
    Math.sin(alt),           // зенит (+Y)
    -cosAlt * Math.cos(az),  // север = −Z
  ];
}
