// UI-слой: карточка созвездия (bottom sheet / боковая панель), выбор тапом,
// легенды из data/myths.json и лента «Все созвездия».
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

const $ = (id) => document.getElementById(id);

/**
 * @param sky    сцена из scene.js (pickConstellation, setHighlight, byId, constAltAz)
 * @param controls pan/zoom + flyTo (для ленты)
 * @param myths  данные data/myths.json или null
 */
export function createUI(sky, controls, myths) {
  const card = $("const-card");
  const ribbon = $("ribbon");
  let current = null;

  function openCard(id) {
    const c = sky.byId(id);
    if (!c) return;
    current = id;
    sky.setHighlight(id);
    $("card-title").textContent = c.ru;
    $("card-sub").textContent = c.la;
    const legend = $("card-legend");
    legend.innerHTML = "";
    const m = myths && myths[id];
    if (m) {
      const t = document.createElement("div");
      t.className = "myth-title";
      t.textContent = m.title;
      const p = document.createElement("p");
      p.textContent = m.legend;
      legend.append(t, p);
    } else if (c.summary) {
      legend.textContent = c.summary;
    }
    const facts = [`Лучшее время: ${MONTHS[c.bestMonth - 1]}`];
    if (c.brightestStar) {
      facts.push(`Ярчайшая звезда: ${c.brightestStar.name || c.brightestStar.id} (${c.brightestStar.mag.toFixed(1)}m)`);
    }
    $("card-facts").textContent = facts.join(" · ");
    card.hidden = false;
    sky.setDim(0.45); // фон гасится, когда фигура подсвечена
  }

  function closeCard() {
    if (card.hidden) return;
    current = null;
    card.hidden = true;
    sky.setHighlight(null);
    sky.setDim(1);
  }

  $("card-close").addEventListener("click", closeCard);

  // тап по небу: выбрать или закрыть (после драга не считаем)
  const canvas = $("sky");
  canvas.addEventListener("pointerup", (e) => {
    if (controls.wasDrag) return;
    const ndcx = (e.clientX / innerWidth) * 2 - 1;
    const ndcy = -((e.clientY / innerHeight) * 2 - 1);
    const id = sky.pickConstellation(ndcx, ndcy);
    if (id) openCard(id);
    else closeCard();
  });

  // свайп вниз по карточке — закрыть
  let sy = null;
  card.addEventListener("touchstart", (e) => { sy = e.touches[0].clientY; }, { passive: true });
  card.addEventListener("touchmove", (e) => {
    if (sy !== null && e.touches[0].clientY - sy > 60) { closeCard(); sy = null; }
  }, { passive: true });
  card.addEventListener("touchend", () => { sy = null; });

  // --- лента «Все созвездия» ---
  function buildRibbon() {
    const inner = $("ribbon-inner");
    inner.innerHTML = "";
    // видимые сейчас — первыми (по alt), затем невидимые по алфавиту
    const items = sky.allConstellations()
      .map((c) => ({ c, aa: sky.constAltAz(c.id) }))
      .sort((a, b) => {
        const va = a.aa && a.aa.alt > 5, vb = b.aa && b.aa.alt > 5;
        if (va !== vb) return va ? -1 : 1;
        if (va && vb) return b.aa.alt - a.aa.alt;
        return a.c.ru.localeCompare(b.c.ru, "ru");
      });
    for (const { c, aa } of items) {
      const b = document.createElement("button");
      b.textContent = c.ru;
      const visible = aa && aa.alt > 5;
      if (!visible) b.className = "invisible";
      if (c.id === current) b.classList.add("hi");
      b.addEventListener("click", () => {
        if (aa) controls.flyTo(aa.az, Math.max(2, Math.min(88, aa.alt)), 1200);
        openCard(c.id);
        ribbon.hidden = true;
      });
      inner.appendChild(b);
    }
  }
  $("btn-ribbon").addEventListener("click", () => {
    const show = ribbon.hidden;
    ribbon.hidden = !show;
    if (show) buildRibbon();
  });
  ribbon.addEventListener("click", (e) => { if (e.target === ribbon) ribbon.hidden = true; });

  return { openCard, closeCard, get current() { return current; } };
}
