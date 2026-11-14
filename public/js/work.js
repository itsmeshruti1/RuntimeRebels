import { dragScroll } from './drag-scroll.js';
import { FlipRenderer } from './flip.js';
import { EASE_HIDE, EASE_SHOW } from './gallery.js';
import { splitLines } from './lines.js';
import { isMobile } from './mobile.js';
import { ProjectOpen } from './project-open.js';
import { SmoothScroll } from './smooth-scroll.js';

const { gsap } = window;

export const OPEN = {
  move: { duration: 1.7, ease: 'power2.inOut' },
  fit: { duration: 1.35, ease: 'power1.inOut' },
  zoom: { duration: 1.95, delay: 0.2, ease: 'power1.inOut' },
  wipe: { duration: 1.95, delay: 0.36, ease: 'power1.inOut' },
  wave: { duration: 4.25, ease: 'power2.out', from: { a1: 0, a2: 0.8 }, to: { a1: 3, a2: -1 } },
  lift: { duration: 0.5, ease: 'power1.inOut' },
  show: 1.5,
};
const REVERSE_FROM = OPEN.wipe.delay + OPEN.wipe.duration;
const SCROLL_BACK_LEFT = 0.03;
const CLOSE_SPEED = REVERSE_FROM / 2;
const SETTLE_LEAD = 0.5;

const REVEAL = { from: 120, duration: 1.2, ease: 'expo.out', stagger: 0.05, titleStagger: 0.04, titleDelay: 0.1 };

const PANE = { from: 102, duration: 1.4, ease: EASE_SHOW, step: 0.1 };

const HIDE = { to: -110, duration: 0.7, ease: EASE_HIDE };

const SCROLL = { touch: 1, lerp: 0.1, click: 6 };

const LAYOUT = {
  side: { top: 400, stick: 42 },
};

const BOX = { w: 0.92, h: 0.88 };
const FLIP = { duration: 1.5 };
const FADE = { duration: 0.3, ease: 'power1' };
const HEADER_BACK = { duration: 0.75, ease: 'power1.inOut' };
export const CURSOR = { offset: 16, duration: 0.35, ease: 'power3' };

const FLIP_SEGMENTS = [
  [0, 0, 0.094, 0.026, 0.124, 0.127, 0.157, 0.29],
  [0.157, 0.29, 0.197, 0.486, 0.254, 0.8, 0.348, 0.884],
  [0.348, 0.884, 0.42, 0.949, 0.374, 1, 1, 1],
];
const cubic = (t, a, b, c, d) => {
  const s = 1 - t;
  return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
};
function flipEase(n) {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  for (const [x0, y0, x1, y1, x2, y2, x3, y3] of FLIP_SEGMENTS) {
    if (n > x3) continue;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (cubic(mid, x0, x1, x2, x3) < n) lo = mid;
      else hi = mid;
    }
    return cubic((lo + hi) / 2, y0, y1, y2, y3);
  }
  return n;
}

const unit = () => Math.min(Math.max(window.innerWidth, 1440), 2560) / 1440;
const mix = (a, b, t) => a + (b - a) * t;
const mixRect = (a, b, t) => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), w: mix(a.w, b.w, t), h: mix(a.h, b.h, t) });
const screenRect = () => ({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });

function el(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

const ARROW =
  '<svg class="work-row-arrow" viewBox="0 0 10 10" aria-hidden="true"><path transform="translate(1 1.29)" d="M6.3876 6.3876L6.2739 2.96641L1.24031 8L0 6.75969L5.03359 1.7261L1.6124 1.6124L1.59173 0L7.76227 0.237726L8 6.40827L6.3876 6.3876Z" /></svg>';

function maskLine(parent, text) {
  const outer = el('span', 'line', parent);
  return el('span', 'line-inner', outer, text);
}

function rule(parent, className = '') {
  const outer = el('div', `work-rule ${className}`.trim(), parent);
  return el('div', 'work-rule-in', outer);
}

function image(parent, className, m) {
  const item = el('div', className, parent);
  item.dataset.cursorInteractive = 'true';
  item.style.setProperty('--ar', `${m.width} / ${m.height}`);
  const frame = el('div', 'work-frame', item);
  const img = el('img', '', frame);
  img.alt = '';
  img.decoding = 'async';
  img.src = m.src;
  return {
    item,
    frame,
    img,
    media: { el: img, width: m.width, height: m.height, uploaded: false },
    flipMedia: { el: img, width: m.width, height: m.height, uploaded: false },
  };
}

export class Work {
  constructor({ root, renderer, overlay, header }) {
    this.root = root;
    this.renderer = renderer;
    this.header = header;
    this.overlay = overlay;
    this.projectOpen = new ProjectOpen(renderer, overlay);
    this.slide = null;
    this.state = 'closed';
    this.waiting = false;
    this.scroll = { target: 0, current: 0, max: 0, touchY: null };
    this.smooth = new SmoothScroll({ wheelMultiplier: 1.25, limit: () => this.scroll.max, enabled: () => this.state === 'open' });
    dragScroll(this.smooth);
    this.down = null;
    this.pointer = null;
    this.full = null;
    this.transition = null;

    this.bindEvents();
  }

  get isOpen() {
    return this.state !== 'closed';
  }

  build(slide) {
    const { work } = slide;
    const mobile = isMobile();
    this.builtMobile = mobile;
    this.root.textContent = '';

    const page = el('div', 'work-page', this.root);

    const content = el('div', 'work-content', page);
    const title = el('h2', 'work-title', content);
    const titleLines = slide.title.map((t) => maskLine(title, t));
    const column = el('div', 'work-media', content);
    const cover = image(column, 'work-item work-item--cover', work.cover);
    const side = el('div', 'work-side', mobile ? content : page);
    const rest = mobile ? el('div', 'work-media work-media--rest', content) : column;
    const items = work.media.map((m) => image(rest, 'work-item', m));

    const about = el('div', 'work-about', side);
    const aboutRule = rule(about);
    const overviewLabel = maskLine(el('p', 'mono work-about-label', about), 'Overview');
    const overview = el('p', 'work-overview', about, work.overview);
    const info = el('div', 'work-info', side);
    const rows = work.info.map((row) => {
      const wraps = row.value.length > 24;
      const r = el('div', `work-row${wraps ? ' work-row--top' : ''}`, info);
      const line = rule(r);
      const text = el('div', 'work-row-in', el('div', 'work-row-mask', r));
      const key = el('div', 'work-row-key', text);
      el('p', 'mono', key, row.key);
      el('p', 'work-row-label', key, row.label);
      const valueClass = `work-row-value${wraps ? ' work-row-value--wrap' : ''}`;
      if (row.arrow) {
        const cell = el('a', 'work-row-cell', text);
        cell.href = row.href || '#';
        cell.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (row.href) {
            window.dispatchEvent(new CustomEvent('rr:navigate', { detail: { href: row.href } }));
          }
        });
        el('p', valueClass, cell, row.value);
        cell.insertAdjacentHTML('beforeend', ARROW);
      } else el('p', valueClass, text, row.value);
      return { line, text };
    });
    const infoRule = rule(info, 'work-rule--bottom');

    const progress = el('div', 'work-progress', page);
    const progressLabel = el('p', 'h3 work-progress-label', progress);
    const progressText = el('span', 'line-inner', progressLabel, '0%');
    const track = el('div', 'work-progress-track', progress);
    const progressLine = el('div', 'work-progress-line', track);
    const fill = el('div', 'work-progress-fill', progressLine);

    const glCanvas = el('canvas', 'work-gl', this.root);

    const close = el('a', 'blend h3 work-close', this.root);
    close.href = '#';
    const closeParts = [maskLine(close, '(X)'), maskLine(close, 'Close')];
    close.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    });

    this.dom = {
      page,
      content,
      titleLines,
      cover,
      images: [cover, ...items],
      side,
      aboutRule,
      overviewLabel,
      overview,
      overviewLines: [],
      rows,
      infoRule,
      progress,
      progressLabel,
      progressText,
      progressLine,
      fill,
      glCanvas,
      close,
      closeParts,
    };
  }

  splitOverview() {
    const d = this.dom;
    if (!d.overviewLines.length) d.overviewLines = splitLines(d.overview);
  }

  async open(slide, old, source = { kind: 'zoom' }) {
    if (this.isOpen || this.waiting) return;
    this.waiting = true;
    const mobile = isMobile();
    if (this.slide !== slide || this.builtMobile !== mobile) {
      this.slide = slide;
      this.build(slide);
    }
    const d = this.dom;
    const cover = d.cover;
    await cover.img.decode().catch(() => {});
    this.waiting = false;
    this.state = 'opening';
    this.mobile = mobile;
    this.old = old;
    this.source = source;
    if (mobile) {
      this.openMobile();
      return;
    }
    if (!cover.media.uploaded) this.renderer.upload(cover.media);

    this.prepare();
    cover.frame.style.visibility = 'hidden';

    this.timeline = this.transitionTimeline();

    this.showCall = gsap.delayedCall(OPEN.show, () => {
      if (this.state !== 'opening') return;
      this.revealPage();
    });
  }

  veil(to, onComplete) {
    const { params } = window.pageTransition;
    const veil = document.querySelector('[data-veil]');
    const tween = to ? { duration: params.out, ease: 'none' } : { duration: params.in, ease: 'power2.out' };
    gsap.fromTo(veil, { opacity: 1 - to }, { opacity: to, ...tween, overwrite: true, onComplete });
  }

  openMobile() {
    this.veil(1, () => {
      this.prepare();
      this.dom.page.scrollTop = 0;
      this.veil(0);
      this.revealPage();
    });
  }

  closeMobile() {
    this.veil(1, () => {
      if (this.onCloseStart) this.onCloseStart(this.old);
      this.root.classList.remove('is-open');
      this.state = 'closed';
      if (this.onClosed) this.onClosed(this.source);
      this.veil(0);
    });
  }

  prepare() {
    const d = this.dom;
    this.scroll.target = this.scroll.current = 0;
    this.smooth.reset(0);
    this.progressShown = false;
    this.reversing = false;
    this.root.classList.add('is-open');
    gsap.set([d.page, d.close, ...this.header], { autoAlpha: 1 });
    d.close.classList.add('is-off');
    gsap.set(d.progress, { autoAlpha: 0 });
    this.layout();
    this.splitOverview();
    const title = d.titleLines;
    const lines = d.closeParts;
    gsap.set([...title, ...lines], { yPercent: REVEAL.from });
    const last = d.rows.length - 1;
    const steps = [
      [d.aboutRule, d.overviewLabel],
      ...d.overviewLines.map((line) => [null, line]),
      ...d.rows.map((row, i) => [i === last ? [row.line, d.infoRule] : [row.line], row.text]),
    ].map(([rules, text]) => ({ rules: rules ? [].concat(rules) : [], text }));
    this.steps = steps;
    steps.forEach(({ rules, text }) => {
      if (rules.length) gsap.set(rules, { xPercent: PANE.from });
      gsap.set(text, { yPercent: PANE.from });
    });
  }

  revealPage() {
    const d = this.dom;
    gsap.to(d.closeParts, { yPercent: 0, duration: REVEAL.duration, ease: REVEAL.ease, stagger: REVEAL.stagger });
    this.steps.forEach(({ rules, text }, i) => {
      const tween = { duration: PANE.duration, ease: PANE.ease, delay: i * PANE.step };
      if (rules.length) gsap.to(rules, { xPercent: 0, ...tween });
      gsap.to(text, { yPercent: 0, ...tween });
    });
    gsap.to(d.titleLines, {
      yPercent: 0,
      duration: REVEAL.duration,
      ease: REVEAL.ease,
      stagger: REVEAL.titleStagger,
      delay: REVEAL.titleDelay,
    });
    this.state = 'open';
    d.close.classList.remove('is-off');
  }

  transitionTimeline() {
    const fromSlide = Boolean(this.source.start);
    const start = fromSlide ? this.source.start : screenRect();
    const s = {
      old: this.old,
      move: 0,
      fitT: 0,
      start,
      from: this.source.fit || start,
      rect: start,
      fit: start,
      a1: OPEN.wave.from.a1,
      a2: OPEN.wave.from.a2,
      p1: 0,
      z: 0,
      lift: 0,
      liftScale: 1,
      overlay: fromSlide ? this.source.overlay || 0 : this.overlay.opacity,
      oldScale: fromSlide ? 1 : this.old.zoom || 1,
      spread: 0,
    };
    this.transition = s;
    this.dom.cover.frame.style.visibility = 'hidden';
    const tl = gsap.timeline({ onComplete: () => this.handOver(), onReverseComplete: () => this.finishClose() });
    tl.to(s, { move: 1, duration: OPEN.move.duration, ease: OPEN.move.ease }, 0);
    tl.to(s, { fitT: 1, duration: OPEN.fit.duration, ease: OPEN.fit.ease }, 0);
    tl.to(s, { z: 1, duration: OPEN.zoom.duration, ease: OPEN.zoom.ease }, OPEN.zoom.delay);
    tl.to(s, { p1: 1, duration: OPEN.wipe.duration, ease: OPEN.wipe.ease }, OPEN.wipe.delay);
    tl.to(s, { ...OPEN.wave.to, duration: OPEN.wave.duration, ease: OPEN.wave.ease }, 0);
    tl.to(s, { lift: 1, duration: OPEN.lift.duration, ease: OPEN.lift.ease }, 0);
    tl.to(s, { lift: 0, duration: OPEN.lift.duration, ease: OPEN.lift.ease }, OPEN.wave.duration - OPEN.lift.duration);
    if (fromSlide) tl.to(s, { spread: 1, duration: this.source.spread.duration, ease: this.source.spread.ease }, 0);
    return tl;
  }

  updateTransition() {
    const s = this.transition;
    const slot = this.slotRect(this.dom.cover);
    s.rect = mixRect(s.start, slot, s.move);
    s.fit = mixRect(s.start, slot, s.fitT);
  }

  handOver() {
    if (!this.transition) return;
    this.transition = null;
    this.dom.cover.frame.style.visibility = '';
  }

  get oldMedia() {
    return this.transition ? this.transition.old : null;
  }

  renderCanvas() {
    const s = this.transition;
    if (!s) return;
    this.updateTransition();
    this.projectOpen.render(s, s.old, this.dom.cover.media);
  }

  close() {
    if (this.state !== 'open' && this.state !== 'opening') return;
    this.state = 'closing';
    this.dom.close.classList.add('is-off');
    if (this.mobile) {
      this.closeMobile();
      return;
    }
    this.setCursor('');
    if (this.showCall) this.showCall.kill();
    this.scroll.target = 0;
    this.scrollBackFrom = this.scroll.current;
    this.reversing = false;
  }

  startReverse() {
    this.reversing = true;
    const d = this.dom;
    const texts = [...d.titleLines, ...d.closeParts, ...this.steps.map((step) => step.text)];
    gsap.to(texts, { yPercent: HIDE.to, duration: HIDE.duration, ease: HIDE.ease, overwrite: true });
    gsap.to(this.steps.flatMap((step) => step.rules), {
      xPercent: PANE.from,
      duration: HIDE.duration,
      ease: HIDE.ease,
      overwrite: true,
    });
    if (this.onCloseStart) this.onCloseStart(this.old);
    if (!this.transition) {
      this.timeline = this.transitionTimeline();
      this.timeline.progress(1, true);
    } else if (this.source.kind === 'slide') {
      this.transition.start = this.source.start;
    }
    const tl = this.timeline;
    if (tl.time() <= 0.001) {
      this.finishClose();
      return;
    }
    if (tl.time() > REVERSE_FROM) {
      tl.time(REVERSE_FROM, true);
      const s = this.transition;
      s.liftScale = 0;
      gsap.to(s, { liftScale: 1, duration: OPEN.lift.duration / CLOSE_SPEED, ease: OPEN.lift.ease });
    }
    tl.timeScale(CLOSE_SPEED).reverse();
    gsap.delayedCall(Math.max(0, tl.time() / CLOSE_SPEED - SETTLE_LEAD), () => {
      if (this.state === 'closing' && this.onCloseSettle) this.onCloseSettle(this.source);
    });
  }

  finishClose() {
    if (this.state !== 'closing') return;
    this.transition = null;
    if (this.full) {
      this.full.entry.frame.style.visibility = '';
      this.flip.clear();
      this.dom.glCanvas.style.visibility = 'hidden';
      this.full = null;
    }
    this.dom.cover.frame.style.visibility = '';
    this.root.classList.remove('is-open');
    this.state = 'closed';
    if (this.onClosed) this.onClosed(this.source);
  }

  forceReset() {
    if (this.showCall) {
      this.showCall.kill();
      this.showCall = null;
    }
    if (this.timeline) {
      this.timeline.kill();
      this.timeline = null;
    }
    this.transition = null;
    this.waiting = false;
    this.reversing = false;
    this.scroll.target = 0;
    this.scroll.current = 0;
    this.smooth.reset(0);
    if (this.full) {
      this.full.entry.frame.style.visibility = '';
      if (this.flip) this.flip.clear();
      this.full = null;
    }
    if (this.dom) {
      this.dom.glCanvas.style.visibility = 'hidden';
      this.dom.cover.frame.style.visibility = '';
      this.dom.close.classList.remove('is-off');
      gsap.killTweensOf([this.dom.page, this.dom.close, ...this.header]);
      gsap.set(this.header, { autoAlpha: 1 });
    }
    this.root.classList.remove('is-open');
    this.state = 'closed';
  }

  layout() {
    if (!this.dom || this.mobile) return;
    this.scroll.max = Math.max(this.dom.content.offsetHeight - window.innerHeight, 0);
    if (this.smooth.targetScroll > this.scroll.max) this.smooth.reset(this.scroll.max);
    if (this.flip) this.flip.resize();
    if (this.full) this.full.dirty = true;
  }

  addScroll(dy) {
    if (!this.smooth.active) return;
    this.smooth.scrollTo(this.smooth.targetScroll + dy, { programmatic: false });
  }

  drawScroll() {
    const d = this.dom;
    const s = this.scroll;
    if (this.mobile) {
      s.current = d.page.scrollTop;
      return;
    }
    if (this.state === 'closing') {
      s.current = mix(s.current, s.target, SCROLL.lerp);
      if (Math.abs(s.target - s.current) < 0.01) s.current = s.target;
    } else s.current = this.smooth.animatedScroll;
    const y = s.current;
    d.content.style.transform = `translate3d(0, ${-y}px, 0)`;

    const u = unit();
    const sideTop = Math.max(LAYOUT.side.top * u - y, LAYOUT.side.stick * u);
    d.side.style.transform = `translate3d(0, ${sideTop}px, 0)`;

    const shown = this.state !== 'opening' && !this.reversing && sideTop + d.side.offsetHeight <= d.progress.offsetTop;
    if (shown !== this.progressShown) {
      this.progressShown = shown;
      gsap.set(d.progress, { autoAlpha: shown ? 1 : 0 });
      if (shown) {
        const tween = { duration: PANE.duration, ease: PANE.ease, overwrite: true };
        gsap.fromTo(d.progressLine, { xPercent: PANE.from }, { xPercent: 0, ...tween });
        gsap.fromTo(d.progressText, { yPercent: PANE.from }, { yPercent: 0, ...tween });
      }
    }

    const p = s.max > 0 ? y / s.max : 0;
    d.fill.style.transform = `scaleX(${p})`;
    const text = `${Math.round(p * 100)}%`;
    if (d.progressText.textContent !== text) d.progressText.textContent = text;
    const x = Math.max(p * d.progress.offsetWidth - d.progressLabel.offsetWidth, 0);
    d.progressLabel.style.transform = `translate3d(${x}px, 0, 0)`;
  }

  slotRect(entry) {
    const r = entry.frame.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  boxRect(entry) {
    const slot = this.slotRect(entry);
    const aspect = slot.w / slot.h;
    const w = Math.min(BOX.w * window.innerWidth, BOX.h * window.innerHeight * aspect);
    const h = w / aspect;
    return { x: (window.innerWidth - w) / 2, y: (window.innerHeight - h) / 2, w, h };
  }

  openFull(entry) {
    if (this.state !== 'open') return false;
    if (entry === this.dom.cover && this.transition && this.timeline) this.timeline.progress(1);
    if (!this.flip) this.flip = new FlipRenderer(this.dom.glCanvas);
    const back = this.full;
    if (back && back.entry !== entry) back.entry.frame.style.visibility = '';
    this.state = 'full';
    if (!entry.flipMedia.uploaded) this.flip.upload(entry.flipMedia);
    const from = back && back.entry === entry ? mixRect(back.from, this.slotRect(entry), flipEase(back.t)) : this.slotRect(entry);
    this.full = { entry, from, toBox: true, t: 0, dirty: true };
    entry.frame.style.visibility = 'hidden';
    this.dom.glCanvas.style.visibility = 'visible';
    gsap.to([this.dom.page, this.dom.close, ...this.header], { autoAlpha: 0, duration: FADE.duration, ease: FADE.ease, overwrite: 'auto' });
    return true;
  }

  closeFull() {
    const f = this.full;
    if (!f || !f.toBox) return false;
    f.from = mixRect(f.from, this.fullTarget(), flipEase(f.t));
    f.toBox = false;
    f.t = 0;
    this.state = 'open';
    gsap.to([this.dom.page, this.dom.close], { autoAlpha: 1, duration: FADE.duration, ease: FADE.ease, overwrite: 'auto' });
    gsap.to(this.header, { autoAlpha: 1, duration: HEADER_BACK.duration, ease: HEADER_BACK.ease, overwrite: 'auto' });
    return true;
  }

  fullTarget() {
    const f = this.full;
    return f.toBox ? this.boxRect(f.entry) : this.slotRect(f.entry);
  }

  drawFull(dt) {
    const f = this.full;
    const flipping = f.t < 1;
    if (flipping) f.t = Math.min(1, f.t + dt / 1000 / FLIP.duration);
    if (!flipping && !f.dirty) return;
    f.dirty = false;
    const to = this.fullTarget();
    this.flip.clear();
    this.flip.render({ media: f.entry.flipMedia, from: f.t < 1 ? f.from : to, to, progress: flipEase(f.t) });

    if (f.t >= 1 && !f.toBox) {
      f.entry.frame.style.visibility = '';
      this.flip.clear();
      this.dom.glCanvas.style.visibility = 'hidden';
      this.full = null;
    }
  }

  setCursor() {}

  updateCursor() {}

  bindEvents() {
    window.addEventListener('touchstart', (e) => (this.scroll.touchY = e.touches[0].clientY), { passive: true });
    window.addEventListener(
      'touchmove',
      (e) => {
        if (!this.isOpen || this.mobile || this.scroll.touchY === null) return;
        const y = e.touches[0].clientY;
        this.addScroll((this.scroll.touchY - y) * SCROLL.touch);
        this.scroll.touchY = y;
      },
      { passive: true },
    );
    window.addEventListener('touchend', () => (this.scroll.touchY = null));

    window.addEventListener('pointerdown', (e) => (this.down = { x: e.clientX, y: e.clientY }));
    window.addEventListener('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
    });

    this.root.addEventListener('click', (e) => {
      const d = this.down;
      if (d && Math.max(Math.abs(e.clientX - d.x), Math.abs(e.clientY - d.y)) > SCROLL.click) return;
      let acted = false;
      if (this.mobile) return;
      if (this.state === 'full') {
        acted = this.closeFull();
      } else if (this.state === 'open') {
        const node = e.target.closest('[data-cursor-interactive]');
        const entry = node && this.dom.images.find((i) => i.item === node);
        if (entry) acted = this.openFull(entry);
      }
      if (acted && this.onPictureClick) this.onPictureClick();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.state === 'full') this.closeFull();
      else if (this.state === 'open') this.dom.close.click();
    });
  }

  update(dt) {
    if (!this.isOpen || !this.dom) return;
    this.smooth.raf(performance.now());
    this.drawScroll();
    if (this.state === 'closing' && !this.reversing && !this.mobile) {
      if (this.scroll.current <= Math.max(this.scrollBackFrom * SCROLL_BACK_LEFT, 0.5)) this.startReverse();
    }
    if (this.full) this.drawFull(dt);
    this.updateCursor();
  }
}
