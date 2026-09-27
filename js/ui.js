// UI-слой: карточка созвездия (bottom sheet / боковая панель), выбор тапом.
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

const $ = (id) => document.getElementById(id);

/**
 * @param sky    сцена из scene.js (pickConstellation, setHighlight, byId)
 * @param controls для подавления клика после драга (wasDrag)
 */
export function createUI(sky, controls) {
  const card = $("const-card");
  let current = null;

  function openCard(id) {
    const c = sky.byId(id);
    if (!c) return;
    current = id;
    sky.setHighlight(id);
    $("card-title").textContent = c.ru;
    $("card-sub").textContent = c.la;
    $("card-legend").innerHTML = ""; // миф добавит Task 9
    const facts = [`Лучшее время: ${MONTHS[c.bestMonth - 1]}`];
    if (c.brightestStar) {
      facts.push(`Ярчайшая звезда: ${c.brightestStar.name || c.brightestStar.id} (${c.brightestStar.mag.toFixed(1)}ᵐ)`);
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

  return { openCard, closeCard, get current() { return current; } };
}
