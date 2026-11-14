const lerp = (a, b, t) => (1 - t) * a + t * b;

export class SlideScroll {
  constructor(params, count) {
    this.params = params;
    this.count = count;
    this.target = 0;
    this.current = 0;
    this.enabled = true;
    this.touchY = null;
    this.timer = null;

    window.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: true });
    window.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: true });
    window.addEventListener('touchend', () => this.onTouchEnd());
  }

  get step() {
    return (window.innerHeight * this.count) / (this.count - 1);
  }

  onWheel(e) {
    if (document.documentElement.classList.contains('is-home')) return;
    if (!this.enabled) return;
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 30;
    this.target += (dy * this.params.wheel) / this.step;
    this.scheduleSnap();
  }

  onTouchStart(e) {
    if (document.documentElement.classList.contains('is-home')) return;
    if (!this.enabled) return;
    this.touchY = e.touches[0].clientY;
  }

  onTouchMove(e) {
    if (document.documentElement.classList.contains('is-home')) return;
    if (!this.enabled || this.touchY === null) return;
    const y = e.touches[0].clientY;
    this.target -= ((y - this.touchY) * this.params.touch) / this.step;
    this.touchY = y;
  }

  onTouchEnd() {
    if (this.touchY === null) return;
    this.touchY = null;
    this.scheduleSnap();
  }

  scheduleSnap() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.target = Math.round(this.target)), this.params.snapDelay * 1000);
  }

  jump(index) {
    clearTimeout(this.timer);
    this.touchY = null;
    this.target = this.current = index;
  }

  update() {
    this.current = lerp(this.current, this.target, this.params.lerp);
    if (Math.abs(this.target - this.current) < 1e-4) this.current = this.target;
  }

  get position() {
    return this.current;
  }
}
