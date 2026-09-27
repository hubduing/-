// Место и время: список городов, разбор URL-состояния, геолокация.
// Чистая логика (CITIES/findCity/parseState/buildQuery/watchTime) покрыта
// tests/location.test.js; resolveStart работает с браузерным окружением.
import { jdFromDate } from "./astromath.js";

export const CITIES = [
  // Россия
  { id: "moscow", ru: "Москва", lat: 55.755, lon: 37.62 },
  { id: "spb", ru: "Санкт-Петербург", lat: 59.938, lon: 30.314 },
  { id: "novosibirsk", ru: "Новосибирск", lat: 55.008, lon: 82.937 },
  { id: "ekaterinburg", ru: "Екатеринбург", lat: 56.838, lon: 60.606 },
  { id: "kazan", ru: "Казань", lat: 55.796, lon: 49.106 },
  { id: "nn", ru: "Нижний Новгород", lat: 56.296, lon: 43.936 },
  { id: "chelyabinsk", ru: "Челябинск", lat: 55.164, lon: 61.43 },
  { id: "samara", ru: "Самара", lat: 53.2, lon: 50.15 },
  { id: "omsk", ru: "Омск", lat: 54.988, lon: 73.324 },
  { id: "rostov", ru: "Ростов-на-Дону", lat: 47.235, lon: 39.702 },
  { id: "krasnoyarsk", ru: "Красноярск", lat: 56.015, lon: 92.893 },
  { id: "perm", ru: "Пермь", lat: 58.01, lon: 56.229 },
  { id: "volgograd", ru: "Волгоград", lat: 48.707, lon: 44.514 },
  { id: "krasnodar", ru: "Краснодар", lat: 45.035, lon: 38.975 },
  { id: "sochi", ru: "Сочи", lat: 43.603, lon: 39.73 },
  { id: "saratov", ru: "Саратов", lat: 51.592, lon: 45.942 },
  { id: "tyumen", ru: "Тюмень", lat: 57.153, lon: 65.564 },
  { id: "barnaul", ru: "Барнаул", lat: 53.348, lon: 83.78 },
  { id: "khabarovsk", ru: "Хабаровск", lat: 48.48, lon: 135.084 },
  { id: "vladivostok", ru: "Владивосток", lat: 43.115, lon: 131.885 },
  { id: "irkutsk", ru: "Иркутск", lat: 52.287, lon: 104.305 },
  { id: "kaliningrad", ru: "Калининград", lat: 54.71, lon: 20.453 },
  { id: "murmansk", ru: "Мурманск", lat: 68.958, lon: 33.082 },
  { id: "yakutsk", ru: "Якутск", lat: 62.035, lon: 129.675 },
  // СНГ и соседи
  { id: "kiev", ru: "Киев", lat: 50.45, lon: 30.523 },
  { id: "minsk", ru: "Минск", lat: 53.9, lon: 27.567 },
  { id: "tibilisi", ru: "Тбилиси", lat: 41.715, lon: 44.82 },
  { id: "yerevan", ru: "Ереван", lat: 40.18, lon: 44.514 },
  { id: "baku", ru: "Баку", lat: 40.409, lon: 49.867 },
  { id: "almaty", ru: "Алматы", lat: 43.238, lon: 76.889 },
  { id: "astana", ru: "Астана", lat: 51.169, lon: 71.449 },
  { id: "tashkent", ru: "Ташкент", lat: 41.298, lon: 69.286 },
  // Мир
  { id: "london", ru: "Лондон", lat: 51.507, lon: -0.128 },
  { id: "paris", ru: "Париж", lat: 48.857, lon: 2.352 },
  { id: "berlin", ru: "Берлин", lat: 52.52, lon: 13.405 },
  { id: "rome", ru: "Рим", lat: 41.902, lon: 12.496 },
  { id: "madrid", ru: "Мадрид", lat: 40.417, lon: -3.703 },
  { id: "warsaw", ru: "Варшава", lat: 52.23, lon: 21.012 },
  { id: "prague", ru: "Прага", lat: 50.075, lon: 14.437 },
  { id: "vienna", ru: "Вена", lat: 48.208, lon: 16.373 },
  { id: "stockholm", ru: "Стокгольм", lat: 59.329, lon: 18.068 },
  { id: "oslo", ru: "Осло", lat: 59.913, lon: 10.752 },
  { id: "helsinki", ru: "Хельсинки", lat: 60.17, lon: 24.938 },
  { id: "reykjavik", ru: "Рейкьявик", lat: 64.147, lon: -21.943 },
  { id: "ankara", ru: "Анкара", lat: 39.933, lon: 32.859 },
  { id: "cairo", ru: "Каир", lat: 30.044, lon: 31.236 },
  { id: "dubai", ru: "Дубай", lat: 25.204, lon: 55.27 },
  { id: "delhi", ru: "Дели", lat: 28.613, lon: 77.209 },
  { id: "beijing", ru: "Пекин", lat: 39.904, lon: 116.407 },
  { id: "tokyo", ru: "Токио", lat: 35.676, lon: 139.65 },
  { id: "bangkok", ru: "Бангкок", lat: 13.756, lon: 100.502 },
  { id: "singapore", ru: "Сингапур", lat: 1.352, lon: 103.82 },
  { id: "sydney", ru: "Сидней", lat: -33.868, lon: 151.209 },
  { id: "auckland", ru: "Окленд", lat: -36.848, lon: 174.763 },
  { id: "honolulu", ru: "Гонолулу", lat: 21.307, lon: -157.858 },
  { id: "newyork", ru: "Нью-Йорк", lat: 40.713, lon: -74.006 },
  { id: "toronto", ru: "Торонто", lat: 43.653, lon: -79.383 },
  { id: "chicago", ru: "Чикаго", lat: 41.878, lon: -87.63 },
  { id: "losangeles", ru: "Лос-Анджелес", lat: 34.052, lon: -118.244 },
  { id: "mexico", ru: "Мехико", lat: 19.433, lon: -99.133 },
  { id: "lima", ru: "Лима", lat: -12.046, lon: -77.043 },
  { id: "saopaulo", ru: "Сан-Паулу", lat: -23.55, lon: -46.633 },
  { id: "buenosaires", ru: "Буэнос-Айрес", lat: -34.603, lon: -58.382 },
  { id: "capetown", ru: "Кейптаун", lat: -33.925, lon: 18.424 },
  { id: "nairobi", ru: "Найроби", lat: -1.292, lon: 36.822 },
];

export function findCity(id) {
  return CITIES.find((c) => c.id === id) || null;
}

/** Валидный локальный ISO «YYYY-MM-DDTHH:MM[:SS]» → Date или null. */
function parseLocalISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Разбор строки запроса (?c=&t=) в состояние. Битые/несуществующие
 * значения игнорируются молча (Review Focus No2).
 * @param {string} query строка вида location.search
 * @returns {{cityId: string, lat: number, lon: number, date: Date|null, isNow: boolean}}
 */
export function parseState(query) {
  let params;
  try {
    params = new URLSearchParams(query || "");
  } catch {
    params = new URLSearchParams();
  }
  const city = findCity(params.get("c") || "");
  const date = parseLocalISO(params.get("t") || "");
  if (city) {
    return { cityId: city.id, lat: city.lat, lon: city.lon, date, isNow: !date };
  }
  return { cityId: "moscow", lat: 55.755, lon: 37.62, date: null, isNow: true };
}

/** URL-параметры состояния: c — если город ≠ дефолт; t — если время ≠ сейчас. */
export function buildQuery({ cityId, date }) {
  const p = new URLSearchParams();
  if (cityId && cityId !== "moscow") p.set("c", cityId);
  if (date) {
    const z = (n) => String(n).padStart(2, "0");
    p.set(
      "t",
      `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}T${z(date.getHours())}:${z(date.getMinutes())}`
    );
  }
  return p.toString() ? "?" + p.toString() : "";
}

/** Юлианская дата момента: isNow → текущий, иначе date. */
export function watchTime({ date }) {
  return jdFromDate(date || new Date());
}

/**
 * Начальное состояние: URL → геолокация → дефолт Москва.
 * Возвращает промис; геолокация с коротким таймаутом, при отказе — дефолт.
 */
export function resolveStart() {
  const fromUrl = parseState(location.search);
  if (fromUrl.cityId !== "moscow" || !fromUrl.isNow) {
    return Promise.resolve({ ...fromUrl, geo: false });
  }
  const fallback = { ...fromUrl, geo: false };
  if (!navigator.geolocation || sessionStorage.getItem("geo-denied")) {
    return Promise.resolve(fallback);
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    setTimeout(() => finish(fallback), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({
        cityId: null, lat: pos.coords.latitude, lon: pos.coords.longitude,
        date: null, isNow: true, geo: true,
      }),
      () => {
        try { sessionStorage.setItem("geo-denied", "1"); } catch { /* приватный режим */ }
        finish(fallback);
      },
      { timeout: 3500, maximumAge: 600000 }
    );
  });
}

/** Заменить URL на состояние без перезагрузки (replaceState). */
export function applyStateToUrl(state) {
  const q = buildQuery(state);
  const url = location.pathname + q + location.hash;
  history.replaceState(null, "", url);
}
