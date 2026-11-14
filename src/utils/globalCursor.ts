import { gsap } from 'gsap';

export interface ResiliaCursor {
  el: HTMLElement;
  setEnabled: (on: boolean) => void;
  setPill: (on: boolean) => void;
  setHover: (on: boolean) => void;
}

declare global {
  interface Window {
    __resiliaCursor?: ResiliaCursor;
  }
}

export function initGlobalCursor(): ResiliaCursor {
  if (typeof window === 'undefined') {
    return {
      el: null as unknown as HTMLElement,
      setEnabled: () => {},
      setPill: () => {},
      setHover: () => {},
    };
  }

  // If already initialized, return existing instance
  if (window.__resiliaCursor) {
    return window.__resiliaCursor;
  }

  // Ensure cursor DOM element exists
  let el = document.querySelector<HTMLElement>('[data-cursor]');
  if (!el) {
    el = document.createElement('div');
    el.className = 'cursor-example';
    el.setAttribute('data-cursor', '');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  } else if (!el.classList.contains('cursor-example')) {
    el.className = 'cursor-example';
    el.textContent = '';
  }

  let posX = window.innerWidth / 2;
  let posY = window.innerHeight / 2;
  let mouseX = posX;
  let mouseY = posY;
  let isMoving = false;
  let isHovering = false;
  let isEnabled = true;

  gsap.set(el, {
    opacity: 0,
    scale: 0,
    left: posX - 12.5,
    top: posY - 12.5,
  });

  // Smooth lagging cursor loop from GSAP Topic #36296:
  // Interpolates toward mouse coordinates with linear lag formula
  gsap.to(el, {
    duration: 0.018,
    repeat: -1,
    onRepeat: function () {
      posX += (mouseX - posX) / 8;
      posY += (mouseY - posY) / 8;
      gsap.set(el, { css: { left: posX - 12.5, top: posY - 12.5 } });
    },
  });

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!isMoving && isEnabled) {
      isMoving = true;
      gsap.to(el, {
        opacity: 1,
        scale: 1,
        duration: 0.25,
        clearProps: 'transform',
        overwrite: 'auto',
      });
    }
    const target =
      (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null) ||
      (e.target as HTMLElement | null);
    const isInteractive = Boolean(
      target?.closest(
        'a, button, [role="button"], .dock-item, .view-switch-item, .pill, select, input, textarea, .slide-arrow-btn, .r-item, .j-article-card, [data-stub]'
      )
    );
    if (isInteractive !== isHovering) {
      isHovering = isInteractive;
      el.classList.toggle('is-hovering', isHovering);
    }
  });

  window.addEventListener('mousedown', () => {
    el.classList.add('is-clicking');
  });

  window.addEventListener('mouseup', () => {
    el.classList.remove('is-clicking');
  });

  document.documentElement.addEventListener('mouseleave', () => {
    isMoving = false;
    gsap.to(el, { opacity: 0, scale: 0, duration: 0.25, overwrite: 'auto' });
  });

  document.documentElement.addEventListener('mouseenter', () => {
    if (isEnabled) {
      isMoving = true;
      gsap.to(el, {
        opacity: 1,
        scale: 1,
        duration: 0.25,
        clearProps: 'transform',
        overwrite: 'auto',
      });
    }
  });

  const cursor: ResiliaCursor = {
    el,
    setEnabled: (on: boolean) => {
      isEnabled = on;
      gsap.to(el, {
        opacity: on ? 1 : 0,
        scale: on ? 1 : 0,
        duration: 0.25,
        ...(on ? { clearProps: 'transform' } : {}),
        overwrite: 'auto',
      });
    },
    setPill: (on: boolean) => {
      el.classList.toggle('is-hovering', on);
    },
    setHover: (on: boolean) => {
      el.classList.toggle('is-hovering', on);
    },
  };

  window.__resiliaCursor = cursor;
  return cursor;
}
