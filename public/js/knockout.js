const NS = 'http://www.w3.org/2000/svg';
let uid = 0;
const ascents = new Map();

function ascent(style) {
  const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  if (!ascents.has(font)) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = font;
    ascents.set(font, ctx.measureText('H').fontBoundingBoxAscent);
  }
  return ascents.get(font);
}

function svg(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (parent) parent.appendChild(el);
  return el;
}

function build(pill) {
  const old = pill.querySelector(':scope > .pill-knock');
  if (old) old.remove();
  const box = pill.getBoundingClientRect();
  if (!box.width) return;
  const k = box.width / pill.offsetWidth || 1;
  const w = box.width / k;
  const h = box.height / k;
  const id = `pill-knock-${(uid += 1)}`;
  const root = svg('svg', { class: 'pill-knock', width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true' });
  const mask = svg('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: w, height: h }, svg('defs', {}, root));
  svg('rect', { width: w, height: h, fill: '#fff' }, mask);

  const walker = document.createTreeWalker(pill, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (!text || node.parentElement.closest('svg')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    const style = getComputedStyle(node.parentElement);
    const t = svg('text', { x: (r.left - box.left) / k, y: (r.top - box.top) / k + ascent(style), fill: '#000' }, mask);
    t.style.fontFamily = style.fontFamily;
    t.style.fontWeight = style.fontWeight;
    t.style.fontSize = style.fontSize;
    t.style.letterSpacing = style.letterSpacing;
    t.style.fontFeatureSettings = style.fontFeatureSettings;
    t.textContent = style.textTransform === 'uppercase' ? text.toUpperCase() : text;
  }

  const dot = pill.querySelector('.pill-dot');
  if (dot && pill.classList.contains('is-active')) {
    const r = dot.getBoundingClientRect();
    const [, , vw, vh] = dot.getAttribute('viewBox').split(/\s+/).map(Number);
    const g = svg('g', { transform: `translate(${(r.left - box.left) / k} ${(r.top - box.top) / k}) scale(${r.width / k / vw} ${r.height / k / vh})` }, mask);
    dot.querySelectorAll('path').forEach((p) => svg('path', { d: p.getAttribute('d'), fill: '#000' }, g));
  }

  const radius = parseFloat(getComputedStyle(pill).borderTopLeftRadius) || 0;
  svg('rect', { class: 'pill-knock-fill', width: w, height: h, rx: radius, mask: `url(#${id})` }, root);
  pill.appendChild(root);
  pill.knockActive = pill.classList.contains('is-active');
  if (!pill.classList.contains('is-knocked')) pill.classList.add('is-knocked');
}

export function knockoutPills(pills) {
  const all = () => pills.forEach(build);
  document.fonts.ready.then(all);
  window.addEventListener('resize', all);
  const observer = new MutationObserver((records) =>
    records.forEach(({ target }) => target.classList.contains('is-active') !== target.knockActive && build(target)),
  );
  pills.forEach((p) => observer.observe(p, { attributes: true, attributeFilter: ['class'] }));
  all();
}
