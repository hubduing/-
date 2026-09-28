#!/usr/bin/env python3
# Генератор миф-иллюстраций: золотые SVG-коконы созвездий.
# Запуск из корня репозитория:  python tools/gen_myths.py
# Вход: data/constellations.json (линии фигур — пары [ra, dec]).
# Выход: assets/myths/*.svg + assets/myths/meta.json (коммитятся).
#
# КРИТИЧНО для совмещения со звёздами: viewBox СТРОГО симметричен
# относительно гномонического центра (0,0) — иначе текстура на quad'е
# (mythQuadBasis, касательная плоскость) съезжает и меняет масштаб.
# Ошибка content-bounded viewBox давала дрейф до 0.1 NDC (~3°).
# Проверено: tests/myth-align.test.js (SVG-пиксели → NDC звёзд < 0.03).
import json
import math
import os

IDS = ['ori', 'umi', 'uma', 'cyg', 'cas', 'per', 'and', 'cep',
       'dra', 'tau', 'gem', 'vir', 'sco', 'lyr', 'peg']
MARGIN_DEG = 3.0      # поле вокруг контента, градусы
BLOW_PCT = 0.12       # раздув кокона от центроида
SCALE_PX = 900.0      # пикселей на максимальный размер фигуры
STROKE = "#d9b45b"


def convex_hull(points):
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def smooth_closed_path(pts):
    # Catmull-Rom → кубические Безье, замкнутый контур
    n = len(pts)
    d = f"M {pts[0][0]:.0f},{pts[0][1]:.0f} "
    for i in range(n):
        p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f"C {c1[0]:.0f},{c1[1]:.0f} {c2[0]:.0f},{c2[1]:.0f} {p2[0]:.0f},{p2[1]:.0f} "
    return d + "Z"


def main():
    with open('data/constellations.json', encoding='utf-8') as f:
        cs = json.load(f)
    os.makedirs('assets/myths', exist_ok=True)
    meta = {}
    for cid in IDS:
        c = next(x for x in cs if x['id'] == cid)
        seen = {}
        for seg in c['lines']:
            for ra, dec in seg:
                seen[(round(ra, 4), round(dec, 4))] = (ra, dec)
        pts = list(seen.values())
        # центр — среднее векторов (ra/dec мета; quad позиционируется сюда же)
        vx = vy = vz = 0.0
        for ra, dec in pts:
            a, d = math.radians(ra * 15), math.radians(dec)
            vx += math.cos(d) * math.cos(a)
            vy += math.cos(d) * math.sin(a)
            vz += math.sin(d)
        a0 = math.degrees(math.atan2(vy, vx)) % 360 / 15
        d0 = math.degrees(math.atan2(vz, math.hypot(vx, vy)))
        # гномоническая проекция вокруг центра, градусы; X+ = восток
        proj = {}
        for ra, dec in pts:
            a, d = math.radians(ra * 15), math.radians(dec)
            ac, dc = math.radians(a0 * 15), math.radians(d0)
            cosc = (math.sin(d) * math.sin(dc)
                    + math.cos(d) * math.cos(dc) * math.cos(a - ac))
            X = math.cos(d) * math.sin(a - ac) / cosc
            Y = (math.cos(dc) * math.sin(d)
                 - math.sin(dc) * math.cos(d) * math.cos(a - ac)) / cosc
            proj[(round(ra, 4), round(dec, 4))] = (math.degrees(X), math.degrees(Y))
        xs = [p[0] for p in proj.values()]
        ys = [p[1] for p in proj.values()]
        fw, fh = max(xs) - min(xs), max(ys) - min(ys)
        sc = SCALE_PX / max(fw, fh)
        # кокон: выпуклая оболочка + раздув от её центроида
        raw = list(proj.values())
        cx = sum(p[0] for p in raw) / len(raw)
        cy = sum(p[1] for p in raw) / len(raw)
        pad = BLOW_PCT * max(fw, fh)
        blown = []
        for px, py in convex_hull(raw):
            dx, dy = px - cx, py - cy
            L = math.hypot(dx, dy) or 1
            blown.append((px + dx / L * pad, py + dy / L * pad))
        # СИММЕТРИЧНЫЕ полуразмеры от (0,0): вершины + кокон + поле
        allx = [p[0] for p in raw] + [p[0] for p in blown]
        ally = [p[1] for p in raw] + [p[1] for p in blown]
        hx = max(abs(min(allx)), abs(max(allx))) + MARGIN_DEG
        hy = max(abs(min(ally)), abs(max(ally))) + MARGIN_DEG
        W2, H2 = round(2 * hx * sc), round(2 * hy * sc)

        def px_(X):
            return W2 / 2 + X * sc

        def py_(Y):
            return H2 / 2 - Y * sc

        cocoon = smooth_closed_path([(px_(x), py_(y)) for x, y in blown])
        segs = []
        for (ra1, d1), (ra2, d2) in c['lines']:
            X1, Y1 = proj[(round(ra1, 4), round(d1, 4))]
            X2, Y2 = proj[(round(ra2, 4), round(d2, 4))]
            segs.append(
                f'    <line x1="{px_(X1):.0f}" y1="{py_(Y1):.0f}"'
                f' x2="{px_(X2):.0f}" y2="{py_(Y2):.0f}"/>')
        stars = []
        for X, Y in proj.values():
            stars.append(f'    <circle cx="{px_(X):.0f}" cy="{py_(Y):.0f}" r="5"/>')
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{W2}" height="{H2}"'
            f' viewBox="0 0 {W2} {H2}">\n'
            f'  <g stroke="{STROKE}" fill="none" stroke-width="2">\n'
            f'    <path d="{cocoon}" opacity="0.55" stroke-width="2.5"/>\n'
            f'    <g opacity="0.9">\n' + "\n".join(segs) + f'\n    </g>\n'
            f'    <g fill="{STROKE}" stroke="none" opacity="0.85">\n'
            + "\n".join(stars) + f'\n    </g>\n'
            f'  </g>\n</svg>\n'
        )
        with open(f'assets/myths/{cid}.svg', 'w', encoding='utf-8') as f:
            f.write(svg)
        meta[cid] = {
            "ra": round(a0, 4), "dec": round(d0, 2),
            "wDeg": round(W2 / sc, 2), "hDeg": round(H2 / sc, 2),
            "svg": f"assets/myths/{cid}.svg",
        }
    with open('assets/myths/meta.json', 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print('wrote', len(IDS), 'svgs')


if __name__ == '__main__':
    main()
