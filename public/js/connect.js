import { startClock } from './clock.js';
import { cloneDefaults } from './config.js';
import { dragScroll } from './drag-scroll.js';
import { o6 } from './ease.js';
import { knockoutPills } from './knockout.js';
import { splitLines } from './lines.js';
import { SmoothScroll } from './smooth-scroll.js';
import { playOnClicks, SwitchSound } from './sound.js';

const { gsap } = window;

const WALL = { zoom: 1 / 3, cols: 4, idle: 140 };
const ROWS = [
  { r: -2, speed: 1.25 },
  { r: -1, speed: -0.5 },
  { r: 0, speed: 0 },
  { r: 1, speed: 0.5 },
  { r: 2, speed: -1.25 },
];
const REVEAL = { from: 102, duration: 1.4, ease: o6, step: 0.1, globe: 3 };

const smoothstep = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) * (1 - t);

const isBack = (() => {
  try {
    return performance.getEntriesByType('navigation')[0].type === 'back_forward';
  } catch {
    return false;
  }
})();

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const stage = document.querySelector('[data-stage]');
const screen = stage.querySelector('[data-screen]');

const template = screen.cloneNode(true);

function makeCopy() {
  const copy = template.cloneNode(true);
  copy.setAttribute('aria-hidden', 'true');
  copy.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '-1'));
  return copy;
}

stage.style.setProperty('--c-zoom', WALL.zoom);

const rows = ROWS.map(({ r, speed }) => {
  const row = document.createElement('div');
  row.className = 'c-strip';
  row.style.setProperty('--r', r);
  for (let c = -WALL.cols; c <= WALL.cols; c++) {
    const cell = document.createElement('div');
    cell.className = 'c-cell';
    cell.appendChild(r === 0 && c === 0 ? screen : makeCopy());
    cell.style.setProperty('--c', c);
    if (r === 0 && c === -1) cell.classList.add('c-cell--edge-l');
    if (r === 0 && c === 1) cell.classList.add('c-cell--edge-r');
    row.appendChild(cell);
  }
  stage.appendChild(row);
  return { el: row, speed };
});

knockoutPills([...document.querySelectorAll('.menu .pill')]);
document.querySelectorAll('[data-clock]').forEach(startClock);
playOnClicks(new SwitchSound(cloneDefaults().sound));

const progressEls = [...document.querySelectorAll('[data-progress]')];

async function boot() {
  await document.fonts.ready;

  const steps = [];
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    const base = Number(el.dataset.reveal);
    splitLines(el).forEach((inner, i) => (steps[base + i] ||= []).push(inner));
  });
  document.querySelectorAll('[data-reveal-block]').forEach((el) => (steps[Number(el.dataset.revealBlock)] ||= []).push(el));
  const inners = steps.flat();
  const masks = inners.map((inner) => inner.parentElement);
  gsap.set(inners, { yPercent: REVEAL.from });
  gsap.set(masks, { visibility: 'hidden' });
  const globes = [...document.querySelectorAll('.c-globe')];
  if (!isBack) gsap.set(globes, { opacity: 0 });
  stage.classList.add('is-ready');

  const smooth = new SmoothScroll({ wheelMultiplier: 1.25 });
  dragScroll(smooth);

  let shown = null;
  let last = null;
  let idle = null;
  function frame(now) {
    smooth.raf(now);
    const max = smooth.limit;
    const p = Math.min(1, Math.max(0, max > 0 ? smooth.animatedScroll / max : 0));
    const e = smoothstep(p);

    if (p !== last) {
      last = p;
      stage.style.transform = `scale(${1 - (1 - WALL.zoom) * easeOut(p)})`;
      const w = window.innerWidth;
      rows.forEach(({ el, speed }) => speed && (el.style.transform = `translate3d(${speed * e * w}px, 0, 0)`));
      stage.classList.add('is-moving');
      clearTimeout(idle);
      idle = setTimeout(() => stage.classList.remove('is-moving'), WALL.idle);
    }

    const shownP = Math.round(p * 100);
    if (shownP !== shown) {
      shown = shownP;
      progressEls.forEach((el) => (el.textContent = String(shownP).padStart(3, '0')));
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => (last = null));

  window.pageTransition.enter();
  gsap.set(masks, { visibility: '' });
  if (isBack) {
    gsap.set(inners, { yPercent: 0 });
    masks.forEach((m) => m.classList.add('is-in'));
    return;
  }
  steps.forEach((items, i) =>
    gsap.to(items, {
      yPercent: 0,
      duration: REVEAL.duration,
      ease: REVEAL.ease,
      delay: i * REVEAL.step,
      onComplete: () => items.forEach((inner) => inner.parentElement.classList.add('is-in')),
    }),
  );
  gsap.to(globes, { opacity: 1, duration: REVEAL.duration, ease: REVEAL.ease, delay: REVEAL.globe * REVEAL.step });
}

boot();
