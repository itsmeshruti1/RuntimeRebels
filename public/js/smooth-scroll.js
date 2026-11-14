const clamp = (min, v, max) => Math.max(min, Math.min(v, max));

export class SmoothScroll {
  constructor({ duration = 1.2, easing = (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), wheelMultiplier = 1, normalizeWheel = true, limit = null, enabled = null } = {}) {
    this.options = { duration, easing, wheelMultiplier, normalizeWheel, limit, enabled };
    this.virtual = Boolean(limit);
    this.targetScroll = this.animatedScroll = this.virtual ? 0 : window.scrollY;
    this.isScrolling = false;
    this.isLocked = false;
    this.animation = null;
    this.time = null;

    window.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    if (!this.virtual) window.addEventListener('scroll', () => this.onScroll(), { passive: false });
  }

  get limit() {
    if (this.virtual) return this.options.limit();
    return document.documentElement.scrollHeight - window.innerHeight;
  }

  get active() {
    return !this.options.enabled || this.options.enabled();
  }

  reset(value = 0) {
    this.targetScroll = this.animatedScroll = value;
    this.animation = null;
    this.time = null;
  }

  onWheel(e) {
    if (document.documentElement.classList.contains('is-home')) return;
    if (e.ctrlKey || !this.active) return;
    let dy = e.deltaY;
    if (this.options.normalizeWheel) dy = clamp(-100, dy, 100);
    dy *= this.options.wheelMultiplier;
    if (dy === 0) return;
    e.preventDefault();
    if (this.isLocked) return;
    this.scrollTo(this.targetScroll + dy, { programmatic: false });
  }

  onScroll() {
    if (this.isScrolling) return;
    this.animatedScroll = this.targetScroll = window.scrollY;
  }

  scrollTo(target, { programmatic = true } = {}) {
    const to = clamp(0, Math.round(target), this.limit);
    if (!programmatic) {
      if (to === this.targetScroll) return;
      this.targetScroll = to;
    }
    this.animation = { from: this.animatedScroll, to, time: 0, programmatic };
  }

  raf(now) {
    const dt = now - (this.time || now);
    this.time = now;
    const a = this.animation;
    if (!a) return;
    a.time += dt * 0.001;
    const p = clamp(0, a.time / this.options.duration, 1);
    const done = p >= 1;
    const value = a.from + (a.to - a.from) * (done ? 1 : this.options.easing(p));
    this.isScrolling = true;
    this.animatedScroll = value;
    if (!this.virtual) window.scrollTo(0, value);
    if (a.programmatic) this.targetScroll = value;
    if (done) {
      this.animation = null;
      requestAnimationFrame(() => (this.isScrolling = false));
    }
  }
}
