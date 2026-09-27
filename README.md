# Карта созвездий — небо над тобой

Панорамный 3D-планетарий в браузере: статический сайт (HTML + Three.js без
сборщика) с ~5000 видимых звёзд, фигурами 88 созвездий, легендами и
мифологическими иллюстрациями. Небо рассчитывается под ваше местоположение
и выбранное время.

Спецификация: `docs/superpowers/specs/2026-09-27-star-map-design.md`
План реализации: `docs/superpowers/plans/2026-09-27-star-map.md`

## Запуск (разработка)

```bash
python -m http.server 8000
# или
npx serve
```

Открыть http://localhost:8000 (ES-модули требуют http://, не file://).

## Данные

`data/*.json` генерируются один раз скриптом `tools/prepare_data.py` из
открытых файлов проекта [d3-celestial](https://github.com/ofrohn/d3-celestial)
(MIT; звёзды — каталог Hipparcos, линии и названия — IAU). Артефакты
закоммичены; перерегенерация: `python tools/prepare_data.py`.

- `data/stars.json` — 5044 звезды (mag ≤ 6.0): ra (часы J2000), dec, mag, bv, ru-имя
- `data/constellations.json` — 88 созвездий: линии фигур, подписи, лучшие месяцы
- `data/milkyway.json` — полигоны Млечного Пути (растеризуются в canvas-текстуру на лету)

## Three.js

`vendor/three.module.js` — three.js r160.1 (build `three.module.js` из
https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js),
vendored без CDN-зависимости в рантайме.

## Тесты

```bash
node --test tests/
```

## Деплой

GitHub Pages: Settings → Pages → Source: `main`, root. Сайт полностью
статический.
