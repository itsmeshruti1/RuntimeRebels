const { gsap } = window;

const STACK_MEDIA = {
  kyiv: ['-.webp', '--1.webp', '--2.webp', '--3.webp', '--4.webp', '--5.webp'],
  qream: ['-.webp', '--1.webp', '--2.webp', '--3.webp', '--4.webp', '--5.webp'],
  awwwards: ['-.webp', '--1.webp', '--2.webp', '--3.webp', '--4.webp'],
};

const STACK = {
  interval: 240,
  spreadX: 50,
  fromY: 50,
  tilt: 10,
  inDuration: 0.4,
  inEase: 'power4.out',
  outDelay: 0.5,
  outDuration: 0.25,
  outScale: 0.9,
  outEase: 'back.in(3)',
  box: 248,
};

const unit = () => Math.min(window.innerWidth, 2560) / 1440;
const canHover = window.matchMedia('(hover: hover)');

export class HoverStack {
  constructor(layer, page) {
    this.layer = layer;
    this.page = page;
    this.apply();
    this.words = [...page.querySelectorAll('[data-stack]')]
      .map((el) => {
        const srcs = (STACK_MEDIA[el.dataset.stack] || []).map((name) => `media/profile/hover/${el.dataset.stack}/${name}`);
        return { el, srcs, interval: null };
      })
      .filter((word) => word.srcs.length);

    this.words.forEach((word) => {
      word.srcs.forEach((src) => {
        const img = new Image();
        img.src = src;
        img.decode().catch(() => {});
      });
      word.el.addEventListener('mouseenter', () => canHover.matches && this.start(word));
      word.el.addEventListener('mouseleave', () => canHover.matches && this.stop(word));
      word.el.addEventListener('click', () => {
        if (canHover.matches) return;
        this.stop(word);
        this.start(word, word.srcs.length);
      });
    });
  }

  start(word, limit = Infinity) {
    const r = word.el.getBoundingClientRect();
    const p = this.page.getBoundingClientRect();
    const x = r.left - p.left + r.width / 2;
    const y = r.top - p.top + r.height / 2;
    let incr = 0;
    word.interval = setInterval(() => {
      this.add(word.srcs[incr++ % word.srcs.length], x, y);
      if (incr >= limit) this.stop(word);
    }, STACK.interval);
  }

  stop(word) {
    clearInterval(word.interval);
  }

  add(src, x, y) {
    const u = unit();
    const wrapper = document.createElement('div');
    wrapper.className = 'p-stack-item';
    const img = document.createElement('img');
    img.className = 'p-stack-img';
    img.alt = '';
    img.src = src;
    wrapper.appendChild(img);
    this.layer.appendChild(wrapper);

    gsap.fromTo(
      wrapper,
      {
        xPercent: -50,
        yPercent: -50,
        x: x + (Math.random() - 0.5) * STACK.spreadX * u,
        y: y + STACK.fromY * u,
        rotation: (Math.random() - 0.5) * STACK.tilt,
      },
      { y, rotation: (Math.random() - 0.5) * STACK.tilt, ease: STACK.inEase, duration: STACK.inDuration },
    );
    gsap.to(wrapper, {
      scale: STACK.outScale,
      delay: STACK.outDelay,
      duration: STACK.outDuration,
      ease: STACK.outEase,
      onComplete: () => wrapper.remove(),
    });
  }

  apply() {
    this.layer.style.setProperty('--stack-box', STACK.box);
  }

  scroll(s) {
    this.layer.style.transform = `translate3d(0, ${-s}px, 0)`;
  }
}
