const PITCH = 60;
const SMALL = [12, 24, 36, 48];
const REACH = 3;
const LEFT = 0.6;
const RIGHT = 0.4;

const numberOpacity = (d) => Math.min(1, Math.max(0, d <= 0 ? 1 + d * (1 - LEFT) : 1 - d * (1 - RIGHT)));

const pad = (n) => String(n).padStart(2, '0');
const mod = (n, m) => ((n % m) + m) % m;

export class Ruler {
  constructor(root, count) {
    this.count = count;
    this.track = root.querySelector('[data-ruler-track]');
    if (!this.track) {
      this.track = document.createElement('div');
      this.track.className = 'ruler-track';
      this.track.dataset.rulerTrack = '';
      root.appendChild(this.track);
    }
    this.items = new Map();
    this.current = null;
  }

  item(i) {
    let item = this.items.get(i);
    if (item) return item;
    const el = document.createElement('div');
    el.className = 'ruler-item';
    const number = document.createElement('span');
    number.className = 'mono ruler-number';
    number.textContent = pad(mod(i, this.count) + 1);
    el.appendChild(number);
    const numberEl = number;
    const tick = document.createElement('span');
    tick.className = 'ruler-tick ruler-tick--work';
    el.appendChild(tick);
    SMALL.forEach((x) => {
      const t = document.createElement('span');
      t.className = 'ruler-tick';
      t.style.setProperty('--x', x);
      el.appendChild(t);
    });
    this.track.appendChild(el);
    item = { el, number: numberEl };
    this.items.set(i, item);
    return item;
  }

  update(position) {
    const base = Math.floor(position);
    const keep = new Set();
    for (let i = base - REACH; i <= base + REACH + 1; i++) {
      keep.add(i);
      const item = this.item(i);
      item.el.style.setProperty('--pos', (i - position) * PITCH);
      item.number.style.opacity = numberOpacity(i - position);
    }
    this.items.forEach((item, i) => {
      if (keep.has(i)) return;
      item.el.remove();
      this.items.delete(i);
    });
    const current = Math.round(position);
    if (current !== this.current) {
      if (this.items.has(this.current)) this.items.get(this.current).el.classList.remove('is-current');
      this.items.get(current).el.classList.add('is-current');
      this.current = current;
    }
  }
}
