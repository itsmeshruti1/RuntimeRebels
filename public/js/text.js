const kernCanvas = document.createElement('canvas').getContext('2d');
function kerning(font, a, b) {
  kernCanvas.font = font;
  if ('fontKerning' in kernCanvas) kernCanvas.fontKerning = 'normal';
  const m = (s) => kernCanvas.measureText(s).width;
  return (m(a + b) - m(a) - m(b)) / 100;
}

export function splitChars(parent, text, fontFamily) {
  const font = `700 100px "${fontFamily}"`;
  const chars = [...text.toUpperCase()];
  parent.textContent = '';
  return chars.map((char, i) => {
    const span = document.createElement('span');
    span.className = 'ch';
    span.textContent = char === ' ' ? ' ' : char;
    const next = chars[i + 1];
    if (next) {
      const k = kerning(font, char, next);
      if (Math.abs(k) > 0.0001) span.style.marginRight = `${k}em`;
    }
    parent.appendChild(span);
    return span;
  });
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class ScrubText {
  constructor(index, count) {
    this.index = index;
    this.count = count;
    this.titleChars = [];
    this.lines = [];
    this.lastU = null;
  }

  addTitleLine(chars) {
    this.titleChars.push(...chars);
  }

  addLine(el) {
    this.lines.push(el);
  }

  relative(position) {
    const n = this.count;
    let u = (((position - this.index) % n) + n) % n;
    if (u >= n / 2) u -= n;
    return u;
  }

  update(position) {
    const u = this.relative(position);

    const hidden = Math.abs(u) >= 0.5;
    if (hidden && this.lastU !== null && Math.abs(this.lastU) >= 0.5 && Math.sign(u) === Math.sign(this.lastU)) return;
    this.lastU = u;

    const lineY = Math.max(-200, Math.min(200, -u * 200));
    for (const el of this.lines) el.style.transform = `translate3d(0, ${lineY}%, 0)`;

    const titleY = u >= 0 ? -110 * clamp01(u / 0.5) : 110 * (1 - clamp01((u + 0.5) / 0.5));
    const t = `translate3d(0, ${titleY}%, 0)`;
    for (const el of this.titleChars) el.style.transform = t;
  }
}
