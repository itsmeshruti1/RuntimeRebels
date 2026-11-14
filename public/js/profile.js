import { startClock } from './clock.js';
import { cloneDefaults } from './config.js';
import { o6 } from './ease.js';
import { splitLines } from './lines.js';
import { knockoutPills } from './knockout.js';
import { isMobile } from './mobile.js';
import { Portrait } from './portrait.js';
import { playOnClicks, SwitchSound } from './sound.js';
import { dragScroll } from './drag-scroll.js';
import { SmoothScroll } from './smooth-scroll.js';
import { HoverStack } from './stack.js';
import { Y3d } from './y3d.js';

const { gsap } = window;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const REVEAL = { from: 102, duration: 1.4, ease: o6, step: 0.1, start: 0.85, firstScreen: 0 };
const PHOTO_START = 0.8;
const PARALLAX = 0.13;

const isBack = (() => {
  try {
    return performance.getEntriesByType('navigation')[0].type === 'back_forward';
  } catch {
    return false;
  }
})();

document.querySelectorAll('[data-stub]').forEach((el) => el.addEventListener('click', (e) => e.preventDefault()));
knockoutPills([...document.querySelectorAll('.menu .pill')]);
startClock(document.querySelector('[data-clock]'));
playOnClicks(new SwitchSound(cloneDefaults().sound));

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const page = document.querySelector('[data-page]');
const progressEl = document.querySelector('[data-progress]');
const mobile = isMobile();
const parallaxEls = mobile ? [] : [...page.querySelectorAll('[data-parallax]')];
if (mobile) {
  page.querySelectorAll('.p-big br, .p-44 br').forEach((br) => br.replaceWith(' '));
  const [first, second] = page.querySelectorAll('.p-big');
  first.append(' ', ...second.childNodes);
  second.remove();
}

function buildGroups() {
  const groups = new Map();
  page.querySelectorAll('[data-group]').forEach((el) => {
    const name = el.dataset.group;
    if (!groups.has(name)) groups.set(name, { name, els: [], steps: [], shown: false });
    const group = groups.get(name);
    const base = Number(el.dataset.step) || 0;
    group.els.push(el);
    splitLines(el).forEach((inner, i) => {
      (group.steps[base + i] ||= []).push(inner);
    });
  });
  return [...groups.values()];
}

const masks = (group) => group.steps.flat().map((inner) => inner.parentElement);

function hideGroup(group) {
  gsap.set(group.steps.flat(), { yPercent: REVEAL.from });
  gsap.set(masks(group), { visibility: 'hidden' });
}

function splitAtWindow(group) {
  const steps = group.steps;
  let n = 0;
  while (n < steps.length && (!steps[n] || steps[n].some((inner) => inner.parentElement.getBoundingClientRect().top < window.innerHeight))) n++;
  const now = n > 0 ? { ...group, steps: steps.slice(0, n) } : null;
  const rest = n < steps.length ? { ...group, steps: steps.slice(n), trigger: steps[n][0].parentElement } : null;
  return { now, rest };
}

function showGroup(group, instant = false, delay = 0) {
  group.shown = true;
  const base = (group.firstScreen ? REVEAL.firstScreen : 0) + delay;
  group.steps.forEach((inners, k) => {
    if (!inners) return;
    const show = () => gsap.set(inners.map((inner) => inner.parentElement), { visibility: '' });
    const done = () => inners.forEach((inner) => inner.parentElement.classList.add('is-in'));
    if (instant) {
      show();
      gsap.set(inners, { yPercent: 0 });
      done();
      return;
    }
    gsap.to(inners, {
      yPercent: 0,
      duration: REVEAL.duration,
      ease: REVEAL.ease,
      delay: base + k * REVEAL.step,
      onStart: show,
      onComplete: done,
    });
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function boot() {
  const images = Promise.all([loadImage('/media/profile/portrait.jpg'), loadImage('/media/profile/portrait-hover.jpg')]);
  await document.fonts.ready;

  const groups = buildGroups();
  groups.forEach(hideGroup);
  const names = groups.find((g) => g.name === 'names');
  const heroParts = groups.filter((g) => g.name.startsWith('hero'));
  const others = groups.filter((g) => g !== names && !heroParts.includes(g));
  others.forEach((g) => {
    g.firstScreen = g.els[0].getBoundingClientRect().top < window.innerHeight * REVEAL.start;
  });
  const opening = [];
  const heroRest = [];
  heroParts.forEach((g) => {
    const { now, rest } = splitAtWindow(g);
    if (now) opening.push(now);
    if (rest) heroRest.push(rest);
  });
  const below = [...heroRest, ...others];
  const heroDelay = mobile ? 0 : names.steps.length * REVEAL.step;
  page.classList.add('is-ready');

  const y3d = new Y3d(document.querySelector('[data-y3d]'));
  const stack = new HoverStack(document.querySelector('[data-stack-layer]'), page);

  const photoSlot = document.querySelector('[data-photo]');
  const portrait = new Portrait(document.querySelector('[data-gl]'), photoSlot, await images);
  let photoShown = isBack;
  if (isBack) portrait.show(true);

  const scroll = { current: window.scrollY, max: 0 };
  const parallax = { zero: 0, y: null };
  function drawParallax(s) {
    const y = Math.round(-(s - parallax.zero) * PARALLAX * 100) / 100;
    if (y === parallax.y) return;
    parallax.y = y;
    parallaxEls.forEach((el) => (el.style.transform = `translate3d(0, ${y}px, 0)`));
  }
  function measure() {
    document.body.style.height = `${page.offsetHeight}px`;
    scroll.max = Math.max(0, page.offsetHeight - window.innerHeight);
    if (parallaxEls.length) {
      const top = Math.min(...parallaxEls.map((el) => el.offsetTop));
      const bottom = Math.max(...parallaxEls.map((el) => el.offsetTop + el.offsetHeight));
      parallax.zero = (top + bottom) / 2 - window.innerHeight / 2;
      parallax.y = null;
      drawParallax(scroll.current);
    }
    page.style.transform = `translate3d(0, ${-scroll.current}px, 0)`;
    stack.scroll(scroll.current);
    portrait.resize(scroll.current);
    y3d.resize();
  }
  measure();
  window.addEventListener('resize', measure);
  const smooth = new SmoothScroll({ wheelMultiplier: 1.25 });
  dragScroll(smooth);

  let shownProgress = null;
  function frame(now) {
    smooth.raf(now);
    scroll.current = smooth.animatedScroll;
    const s = scroll.current;
    page.style.transform = `translate3d(0, ${-s}px, 0)`;
    stack.scroll(s);
    drawParallax(s);

    const value = Math.round(scroll.max > 0 ? clamp(s / scroll.max, 0, 1) * 100 : 0);
    if (value !== shownProgress) {
      shownProgress = value;
      progressEl.textContent = String(value).padStart(3, '0');
    }

    const limit = window.innerHeight * REVEAL.start;
    below.forEach((g) => {
      if (!g.shown && (g.trigger || g.els[0]).getBoundingClientRect().top < limit) showGroup(g);
    });
    if (!photoShown && photoSlot.getBoundingClientRect().top < window.innerHeight * PHOTO_START) {
      photoShown = true;
      portrait.show();
    }

    portrait.update(now, s);
    y3d.update(now, s);
    requestAnimationFrame(frame);
  }
  y3d.update(performance.now(), scroll.current);
  requestAnimationFrame(frame);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  window.pageTransition.enter();
  y3d.show(isBack);
  if (isBack) {
    heroParts.forEach((g) => showGroup(g, true));
    showGroup(names, true);
  } else {
    showGroup(names);
    opening.forEach((g) => showGroup(g, false, heroDelay));
  }
}

boot();
