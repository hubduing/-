#!/usr/bin/env python3
"""Конвертер открытых данных неба (d3-celestial, MIT) в компактные JSON проекта.

Источники (скачиваются в data/raw/ и коммитятся туда же):
  https://github.com/ofrohn/d3-celestial  (master/data/)
    stars.6.json              звёзды до mag 6 (Hipparcos id, mag, bv; J2000)
    constellations.json       88 созвездий: названия (в т.ч. ru), позиция подписи
    constellations.lines.json линии фигур (MultiLineString, RA/Dec)
    starnames.json            собственные имена звёзд, поле "ru"
    milkyway.json             полигоны Млечного Пути для canvas-текстуры

Формат координат d3-celestial: lon = RA_deg - 360 при RA>180,
т.е. RA_deg = (lon + 360) % 360; lat = Dec.

Артефакты:
  data/stars.json          [{id, ra(часы), dec, mag, bv, name|null}, ...]
  data/constellations.json [{id, ru, la, label{ra,dec}, lines[[[raH,dec],...]],
                             bestMonth, brightestStar{id,name,mag}, summary}, ...]
  data/milkyway.json       [[[lon,lat],...], ...] внешние кольца полигонов

Запуск:  python tools/prepare_data.py   (результат коммитить)
"""
import json
import math
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"

BASE = "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/"
FILES = {
    "d3_stars.json": "stars.6.json",
    "d3_constellations.json": "constellations.json",
    "d3_const_lines.json": "constellations.lines.json",
    "d3_starnames.json": "starnames.json",
    "d3_milkyway.json": "milkyway.json",
}

MAG_LIMIT = 6.0  # стандартный порог видимости невооружённым глазом
MATCH_TOL_DEG = 0.5  # максимальное расхождение вершины линии с ближайшей звездой
SNAP_TOL_DEG = 2.0   # снап «декоративных» вершин к ближайшей звезде (с warning)

# Краткие факт-описания (рус.) для всех 88 созвездий: что видно / когда искать.
SUMMARIES = {
    "and": "Цепочка умеренно ярких звёзд к югу от Пегаса; осенью высоко. В галактике Андромеды — самый далёкий объект, видимый глазом.",
    "ant": "Насос — маленький тусклый треугольник низко у южного горизонта, легко пропустить.",
    "aps": "Райская Птица — тусклый южнополярный треугольник, без ярких звёзд.",
    "aqr": "Водолей — «звёздные капли» из тусклых звёзд; поздним летом и осенью на юге.",
    "aql": "Орёл с яркой Альтаиром — летним вечером почти в зените, угол Летнего треугольника.",
    "ara": "Жертвенник — компактная яркая группа, летом низко на юге, за Стрельцом.",
    "ari": "Овен — три звезды в дугу, осенними вечерами невысоко на востоке.",
    "aur": "Возничий с яркой Капеллой — зимними ночами высоко, пятиугольник на Млечном Пути.",
    "boo": "Волопас с оранжевым Арктуром — весной один из первых ярких гостей на востоке.",
    "cae": "Резец — тусклый вертикальный клин под Эриданом.",
    "cam": "Жираф — цепочка слабых звёзд между Ковшом и Полярной, без яркой фигуры.",
    "cnc": "Рак — тусклый, но знаменит ясельным скоплением Praesepe; весна.",
    "cvn": "Гончие Псы — две скромные цепочки к северу от Волопаса; весна-лето.",
    "cma": "Большой Пёс со Сириусом — ярчайшей звездой неба; зимой невысоко на юго-востоке.",
    "cmi": "Малый Пёс с блестящей Проционом — зимой в паре с Сириусом.",
    "cap": "Козерог — «парадный» треугольник из тусклых звёзд, летом невысоко на юге.",
    "car": "Киль с Канопусом — второй по яркости звездой неба; для средних широт низко на юге.",
    "cas": "Кассиопея — узнаваемая буква W, незаходящее, зимой напротив Полярной через полярный регион.",
    "cen": "Центавр с α Центавра и Хамаро — главный южный «часовой», для средних широт низко у горизонта.",
    "cep": "Цефей — остроконечный «домик» у Полярной звезды, виден всю осень и зиму.",
    "cet": "Кит — вытянутая фигура с переменным Меной (Алголем кита); осень-зима на юго-востоке.",
    "cha": "Хамелеон — тусклый южнополярный треугольник.",
    "cir": "Циркуль — тусклый клин у южного Млечного Пути, рядом со Южным Крестом.",
    "col": "Голубь — стая тусклых звёзд прямо под Поясом Ориона.",
    "com": "Волосы Вероники — рой слабых звёзд; весной высоко, знаменит скоплениями галактик.",
    "cra": "Южная Корона — маленький яркий полукруг, летом низко на юге.",
    "crb": "Северная Корона — яркая подкова между Геркулесом и Волопасом; лето.",
    "crv": "Ворон — компактный четырёхугольник «под Львом», весной.",
    "crt": "Чаша — тусклый сосуд на голове Гидры; весна.",
    "cru": "Южный Крест — маленькая, но яркая, главная опора южного неба; нам barely виден.",
    "cyg": "Лебедь — Северный Крест с Денебом летит вдоль Млечного Пути всё лето и осень.",
    "del": "Дельфин — маленький ромбик из ярких звёзд рядом с Лебедем.",
    "dor": "Золотая Рыба — тусклый южный ромб с Большой Магеллановой Областью.",
    "dra": "Дракон — длинная изогнутая цепь между Ковшами; голова из четырёх звёзд летом в зените.",
    "equ": "Малый Конь — короткая дуга звёзд рядом с Дельфином; осень.",
    "eri": "Эридан — длинная «река» от Курси вниз до южного горизонта; осень-зима.",
    "for": "Печь — тусклый клин под Эриданом.",
    "gem": "Близнецы — две цепочки с Кастором и Поллуксом; зимой высоко над Орионом.",
    "gru": "Журавль — яркий южный крестик, осенними вечерами у южного горизонта (нам низок).",
    "her": "Геркулес — «бабочка» без ярких звёзд, летом высоко; знаменит скоплением M13.",
    "hor": "Часы — тусклый длинный уголок к югу от Эридана.",
    "hya": "Гидра — самое длинное созвездие: от головы у Рака до хвоста у Весов.",
    "hyi": "Южная Гидра — тусклый околополярный южный треугольник.",
    "ind": "Индеец — тусклый южный пятиугольник рядом с Павлином.",
    "lac": "Ящерица — зигзаг слабых звёзд между Цефеем и Лебедем, в Млечном Пути.",
    "leo": "Лев — «вопросительный знак» и треугольник с Регуломом; весной высоко на юго-востоке.",
    "lmi": "Малый Лев — тусклый треугольник между Большой Медведицей и Львом.",
    "lep": "Заяц — группа звёзд «под ногами» Ориона; зимой.",
    "lib": "Весы — тусклые «клешни» под Скорпионом; летом низко на юге.",
    "lup": "Волк — яркий для южных широт многоугольник под Скорпионом.",
    "lyn": "Рысь — скопление слабых звёзд между Ковшом и Возничим; фигуры не рисуют.",
    "lyr": "Лира — крошечный параллелограмм с ослепительной Вегой; летом почти в зените.",
    "men": "Столовая Гора — тусклый околополярный южный уголок.",
    "mic": "Микроскоп — крохотный тусклый ромб у Стрельца.",
    "mon": "Единорог — длинная цепь слабых звёзд через зимний Млечный Путь; без фигуры.",
    "mus": "Муха — маленькая яркая группа рядом с Южным Крестом.",
    "nor": "Наугольник — тусклый южный угол рядом с Циркулем.",
    "oct": "Октант — тусклый околополярный южный, несёт Южный Полюс мира.",
    "oph": "Змееносец — огромная фигура «держит Змею»; летом с ярким Расальгёй.",
    "ori": "Орион — ярчайшая фигура зимнего неба: Пояс из трёх звёзд, красный Бетельгейзе и голубой Ригель.",
    "pav": "Павлин — южный четырёхугольник с Павлинии; осенью у южного горизонта (нам низок).",
    "peg": "Пегас — Великий квадрат — главный ориентир осеннего неба.",
    "per": "Персей — яркая цепь с Алголем; осенью высоко над Плеядами.",
    "phe": "Феникс — южный крестик между Эриданом и Скульптором.",
    "pic": "Живописец — тусклый вертикальный клин под Голубем.",
    "psc": "Рыбы — две длинные нити тусклых звёзд, замкнутые узлом у Пегаса; осень.",
    "psa": "Южная Рыба — тусклый ромб под Козерогом.",
    "pup": "Корма — остатки Корабля Арго; зимними вечерами яркая дуга низко на юге.",
    "pyx": "Компас — тусклый сегмент мачты Корабля Арго.",
    "ret": "Сетка — тусклый ромбик у Столовой Горы.",
    "sge": "Стрела — короткий яркий зигзаг между Орлом и Лисичкой; лето.",
    "sgr": "Стрелец — «чайник» из ярких звёзд: летним вечером у южного горизонта — центр Галактики.",
    "sco": "Скорпион — самая живописная фигура лета: крюк с красным Антаресом, низко на юге.",
    "scl": "Скульптор — тусклый южный треугольник.",
    "sct": "Щит — крохотный крохотная бриллиантовая стрелка у Стрельца.",
    "ser": "Змея — единственное созвездие из двух половинок, переброшенных через Змееносца.",
    "sex": "Секстант — тусклый клин между Львом и Девой; весна.",
    "tau": "Телец — V-образные Гиады и плеяда Плеяд, яркая Альдебаран; зимними вечерами высоко.",
    "tel": "Телескоп — тусклый южный уголок рядом со Стрельцом.",
    "tri": "Треугольник — маленький яркий клин у Персея и Овна; осень.",
    "tra": "Южный Треугольник — яркая летняя фигура у южного горизонта (нам едва видна).",
    "tuc": "Тукан — южный четырёхугольник с Малой Магеллановой Областью.",
    "uma": "Большая Медведица — Ковш, главный ориентир северного неба круглый год.",
    "umi": "Малая Медведица — ковшик с Полярной звездой; у северного горизонта всю ночь.",
    "vel": "Паруса — часть Корабля Арго; зимними вечерами яркая кильватерная цепь на юге.",
    "vir": "Дева — «ёлочка» из ярких звёзд с Спикой; весной занимает полнеба.",
    "vol": "Летучая Рыба — южный прямоугольник под Килем.",
    "vul": "Лисичка — короткий зигзаг слабых звёзд рядом со Стрелой; лето.",
}


def fetch(url: str, dest: Path) -> None:
    if not dest.exists():
        print("download", url)
        with urllib.request.urlopen(url, timeout=120) as r, open(dest, "wb") as f:
            f.write(r.read())


def lon_to_ra_hours(lon: float) -> float:
    return ((lon + 360.0) % 360.0) / 15.0


def load_all():
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for local, remote in FILES.items():
        fetch(BASE + remote, RAW / local)
    return {local: json.loads((RAW / local).read_text(encoding="utf-8"))
            for local in FILES}


def main() -> int:
    data = load_all()
    d3_stars = data["d3_stars.json"]
    d3_const = data["d3_constellations.json"]
    d3_lines = data["d3_const_lines.json"]
    d3_names = data["d3_starnames.json"]
    mw = data["d3_milkyway.json"]

    # --- звёзды ---
    stars, by_id, raw_by_id = [], {}, {}
    for f in d3_stars["features"]:
        lon, lat = f["geometry"]["coordinates"]
        mag = float(f["properties"]["mag"])
        bv = f["properties"].get("bv")
        st = {
            "id": int(f["id"]),
            "ra": round(lon_to_ra_hours(lon), 6),
            "dec": round(lat, 5),
            "mag": round(mag, 2),
            "bv": round(float(bv), 3) if bv not in (None, "") else None,
            "name": None,
        }
        raw_by_id[st["id"]] = st
        if mag <= MAG_LIMIT:
            stars.append(st)
            by_id[st["id"]] = st

    named = 0
    for sid, info in d3_names.items():
        s = by_id.get(int(sid)) if str(sid).lstrip("-").isdigit() else None
        ru = (info.get("ru") or "").strip()
        if s and ru:
            s["name"] = ru
            named += 1

    # --- поиск ближайшей звезды по сетке (0.5° ячейки) ---
    CELL = 0.5

    def build_grid(catalog):
        g = {}
        for s in catalog:
            key = (int(math.floor(s["ra"] * 15 / CELL)),
                   int(math.floor((s["dec"] + 90) / CELL)))
            g.setdefault(key, []).append(s)
        return g

    grid = build_grid(stars)
    grid_all = build_grid(list(raw_by_id.values()))
    extra_ids = set()  # id тусклых звёзд, добавленных линиями фигур

    def nearest_star(ra_deg: float, dec: float, cat_grid, tol: float = CELL):
        gx = int(math.floor(ra_deg / CELL))
        gy = int(math.floor((dec + 90) / CELL))
        span = int(math.ceil(tol / CELL))
        best, bestd = None, float("inf")
        for dx in range(-span, span + 1):
            for dy in range(-span, span + 1):
                for s in cat_grid.get((gx + dx, gy + dy), ()):
                    dra = (s["ra"] * 15.0 - ra_deg) * math.cos(math.radians(dec))
                    d = dra * dra + (s["dec"] - dec) ** 2
                    if d < bestd:
                        bestd, best = d, s
        return best, math.sqrt(bestd)

    # --- созвездия (dedup: Ser встречается дважды) ---
    line_by_id = {}
    for f in d3_lines["features"]:
        line_by_id.setdefault(f["id"], []).extend(f["geometry"]["coordinates"])

    consts, seen = [], set()
    unmatched, snapped = [], []
    for f in d3_const["features"]:
        key3 = f["id"]
        low = key3.lower()
        if low in seen:
            continue
        seen.add(low)
        ra_h = lon_to_ra_hours(f["geometry"]["coordinates"][0])
        dec = f["geometry"]["coordinates"][1]

        lines = []
        used_ids = {}
        for pl in line_by_id.get(key3, []):
            pts = []
            for lon, lat in pl:
                ra_deg = (lon + 360.0) % 360.0
                st, dist = nearest_star(ra_deg, lat, grid)
                if st is None or dist > MATCH_TOL_DEG:
                    # вершина слабее лимита mag — ищем в полном каталоге
                    st, dist = nearest_star(ra_deg, lat, grid_all, tol=SNAP_TOL_DEG)
                    if st is not None and dist <= MATCH_TOL_DEG:
                        extra_ids.add(st["id"])
                if st is None or dist > MATCH_TOL_DEG:
                    if st is not None and dist <= SNAP_TOL_DEG:
                        # «декоративная» вершина без своей звезды — снап к
                        # ближайшей с предупреждением
                        snapped.append((low, round(ra_deg, 3), round(lat, 3),
                                        st["id"], round(dist, 2)))
                        extra_ids.add(st["id"])
                    else:
                        unmatched.append((low, round(ra_deg, 3), round(lat, 3),
                                          round(dist, 3) if dist != float("inf") else -1))
                        pts = []  # порвать цепочку полилинии
                        continue
                pts.append(st)
                used_ids[st["id"]] = st
            for a, b in zip(pts, pts[1:]):
                seg = [[a["ra"], a["dec"]], [b["ra"], b["dec"]]]
                rev = [[b["ra"], b["dec"]], [a["ra"], a["dec"]]]
                if seg not in lines and rev not in lines:
                    lines.append(seg)

        if used_ids:
            brightest = min(used_ids.values(), key=lambda s: s["mag"])
            xs = [math.cos(math.radians(s["ra"] * 15)) for s in used_ids.values()]
            ys = [math.sin(math.radians(s["ra"] * 15)) for s in used_ids.values()]
            mean_ra = math.degrees(math.atan2(sum(ys), sum(xs))) % 360
        else:
            brightest, mean_ra = None, ra_h * 15
        # Лучший месяц: созвездие кульминирует вечером (~21:00), когда
        # RA_Солнца ≈ meanRA − 135°. RA Солнца 0° ~20 марта => сдвиг +2.5 мес.
        solar_ra = (mean_ra - 135.0) % 360.0
        best_month = int((solar_ra / 30.0 + 2.5)) % 12 + 1

        consts.append({
            "id": low,
            "ru": f["properties"].get("ru") or key3,
            "la": f["properties"].get("la", key3),
            "label": {"ra": round(ra_h, 4), "dec": round(dec, 4)},
            "lines": lines,
            "bestMonth": best_month,
            "brightestStar": ({"id": brightest["id"],
                               "name": brightest["name"] or "",
                               "mag": brightest["mag"]} if brightest else None),
            "summary": SUMMARIES.get(low, "Ищите по соседним ярким фигурам."),
        })

    # принудительно добавить тусклые звёзды, участвующие в линиях (Review Focus №3)
    for sid in sorted(extra_ids):
        if sid not in by_id:
            st = raw_by_id[sid]
            info = d3_names.get(str(sid)) or {}
            ru = (info.get("ru") or "").strip()
            if ru:
                st = dict(st, name=ru)
            stars.append(st)
            by_id[sid] = st
    stars.sort(key=lambda s: s["id"])

    if snapped:
        print(f"ПРЕДУПРЕЖДЕНИЕ: {len(snapped)} декоративных вершин снапнуто к ближайшим звёздам:")
        for s in snapped:
            print("  ", s)
    if unmatched:
        print(f"ОШИБКА: {len(unmatched)} вершин линий не совпало ни с одной звездой "
              f"(порог {MATCH_TOL_DEG}°):", file=sys.stderr)
        for u in unmatched[:50]:
            print("  ", u, file=sys.stderr)
        return 1

    missing_sum = [c["id"] for c in consts if not SUMMARIES.get(c["id"])]
    if missing_sum:
        print("ОШИБКА: нет summary для:", missing_sum, file=sys.stderr)
        return 1

    (OUT / "stars.json").write_text(
        json.dumps(stars, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "constellations.json").write_text(
        json.dumps(consts, ensure_ascii=False), encoding="utf-8")

    rings = []
    for f in mw["features"]:
        g = f["geometry"]
        ring_sets = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for rs in ring_sets:
            rings.append([[round(lon, 3), round(lat, 3)] for lon, lat in rs[0]])
    (OUT / "milkyway.json").write_text(
        json.dumps(rings, separators=(",", ":")), encoding="utf-8")

    segs = sum(len(c["lines"]) for c in consts)
    empty = [c["id"] for c in consts if not c["lines"]]
    print(f"stars: {len(stars)} (ru-named: {named}); constellations: {len(consts)}; "
          f"segments: {segs}; mw rings: {len(rings)}; без линий: {empty}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
