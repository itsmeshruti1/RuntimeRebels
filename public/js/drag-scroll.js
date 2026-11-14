const DRAG = { threshold: 6, ratio: 2 };

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function dragScroll(smooth) {
  const round = (v) => Math.round(v * 100) / 100;
  const drag = { down: false, start: null, from: 0, target: 0, prev: 0 };

  document.addEventListener('pointerdown', (e) => {
    if (document.documentElement.classList.contains('is-home')) return;
    if (e.pointerType !== 'mouse' || !smooth.active) return;
    e.preventDefault();
    if (e.target.closest('a') || e.button === 2 || (e.ctrlKey && e.button === 1)) return;
    drag.down = smooth.isLocked = true;
    drag.start = { x: e.clientX, y: e.clientY };
    drag.from = drag.target = smooth.targetScroll;
  });
  document.addEventListener('pointermove', (e) => {
    if (document.documentElement.classList.contains('is-home')) return;
    if (!drag.down || e.pointerType !== 'mouse') return;
    e.preventDefault();
    const { clientX: x, clientY: y } = e;
    if (Math.abs(x - drag.start.x) <= DRAG.threshold && Math.abs(y - drag.start.y) <= DRAG.threshold) return;
    if (y > drag.prev && drag.target === 0) drag.start.y = y - drag.from / DRAG.ratio;
    else if (y < drag.prev && drag.target === smooth.limit) drag.start.y = y - (drag.from - smooth.limit) / DRAG.ratio;
    drag.prev = y;
    drag.target = round(clamp(-DRAG.ratio * (y - drag.start.y) + drag.from, 0, smooth.limit));
    smooth.scrollTo(drag.target, { programmatic: false });
  });
  document.addEventListener('pointerup', () => (drag.down = smooth.isLocked = false));
}
