const { gsap } = window;

const SQUARE = 12;
const LINE = 1;
const GAP = 4;

const pad = (n) => String(n).padStart(3, '0');

export class Stepper {
  constructor(root, count, params) {
    this.params = params;
    this.count = count;
    this.current = root.querySelector('[data-stepper-current]');
    root.querySelector('[data-stepper-count]').textContent = pad(count);
    const steps = root.querySelector('[data-stepper-steps]');

    this.lines = Array.from({ length: count }, () => {
      const line = document.createElement('span');
      line.className = 'stepper-line';
      steps.appendChild(line);
      return { el: line, x: 0 };
    });
    this.square = document.createElement('span');
    this.square.className = 'stepper-square';
    steps.appendChild(this.square);
    this.edges = { left: 0, right: SQUARE };

    this.index = -1;
    this.set(0, false);
  }

  x(i, active) {
    return i * (LINE + GAP) + (i > active ? SQUARE - LINE : 0);
  }

  draw() {
    const { left, right } = this.edges;
    this.square.style.setProperty('--left', left);
    this.square.style.setProperty('--width', right - left);
    this.lines.forEach((line) => line.el.style.setProperty('--x', line.x));
  }

  set(index, animate = true) {
    if (index === this.index) return;
    const from = this.index;
    this.index = index;
    this.current.textContent = pad(index + 1);

    const left = this.x(index, index);
    const right = left + SQUARE;
    const p = this.params;

    if (!animate || from < 0) {
      this.edges.left = left;
      this.edges.right = right;
      this.lines.forEach((line, i) => (line.x = this.x(i, index)));
      this.draw();
      return;
    }

    const forward = index > from;
    const lead = { duration: p.lead, ease: p.leadEase, overwrite: 'auto', onUpdate: () => this.draw() };
    const trail = { duration: p.trail, ease: p.trailEase, delay: p.trailDelay, overwrite: 'auto', onUpdate: () => this.draw() };
    gsap.to(this.edges, { ...(forward ? lead : trail), right });
    gsap.to(this.edges, { ...(forward ? trail : lead), left });
    this.lines.forEach((line, i) => {
      gsap.to(line, { x: this.x(i, index), duration: p.lines, ease: p.linesEase, overwrite: 'auto', onUpdate: () => this.draw() });
    });
  }
}
