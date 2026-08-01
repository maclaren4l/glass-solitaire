/**
 * Motion. Everything here is decorative: if animation is off, or the user prefers reduced
 * motion, each function degrades to a no-op and the game still plays identically.
 *
 * Movement uses FLIP — snapshot rects before the DOM changes, let render.js reposition the
 * (reused) elements, then animate each card from its old position to its new one.
 */

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let enabled = true;
export function setAnimationsEnabled(on) {
  enabled = !!on;
}
export function animationsOn() {
  return enabled && !reduceMotion.matches;
}

/** @param {HTMLElement[]} els */
export function snapshot(els) {
  const map = new Map();
  if (!animationsOn()) return map;
  for (const el of els) {
    if (!el.isConnected) continue;
    const r = el.getBoundingClientRect();
    map.set(el, { x: r.left, y: r.top });
  }
  return map;
}

/**
 * Animate every element that moved since `before`. Cards entering the DOM for the first
 * time are left alone — they simply appear where they belong.
 */
export function flip(before, els, { duration = 240, stagger = 0 } = {}) {
  if (!animationsOn() || !before.size) return;
  let i = 0;
  for (const el of els) {
    const prev = before.get(el);
    if (!prev || !el.isConnected) continue;
    const r = el.getBoundingClientRect();
    const dx = prev.x - r.left;
    const dy = prev.y - r.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    el.animate(
      [{ transform: `translate3d(${dx}px, ${dy}px, 0)` }, { transform: 'translate3d(0,0,0)' }],
      { duration, easing: EASE, delay: stagger * i++, fill: 'both' },
    );
  }
}

/** Cards slide in from the stock position as the deal is laid out. */
export function dealIn(els, origin) {
  if (!animationsOn()) return;
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const dx = origin.x - r.left;
    const dy = origin.y - r.top;
    el.animate(
      [
        { transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.94)`, opacity: 0.4 },
        { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
      ],
      { duration: 340, easing: EASE, delay: i * 16, fill: 'both' },
    );
  });
}

export function shake(el) {
  if (!el) return;
  if (!animationsOn()) return;
  el.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-7px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 300, easing: 'ease-in-out' },
  );
}

/** Pulse a card and its destination so a hint reads as "this goes there". */
export function pulseHint(els) {
  els.filter(Boolean).forEach((el) => {
    el.classList.remove('is-hint');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('is-hint');
    setTimeout(() => el.classList.remove('is-hint'), 1800);
  });
}

/**
 * The classic bouncing-cards finale. Cards are cloned into a fixed layer so the real board
 * is untouched, and the whole thing self-cleans.
 */
export function winCascade(cardEls, layer) {
  if (!layer) return () => {};
  layer.replaceChildren();
  if (!animationsOn()) return () => {};

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const movers = [];

  cardEls.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    const clone = el.cloneNode(true);
    clone.classList.add('card--flying');
    clone.style.cssText =
      `position:fixed;left:0;top:0;width:${r.width}px;height:${r.height}px;` +
      `transform:translate3d(${r.left}px, ${r.top}px, 0);z-index:1;`;
    layer.appendChild(clone);
    movers.push({
      el: clone,
      x: r.left,
      y: r.top,
      vx: (Math.random() * 2 - 1) * 9 - 3,
      vy: -Math.random() * 9 - 2,
      w: r.width,
      h: r.height,
      rot: 0,
      vrot: (Math.random() * 2 - 1) * 3,
    });
  });

  let raf = 0;
  let stopped = false;
  const gravity = 0.55;
  const bounce = -0.74;

  const tick = () => {
    if (stopped) return;
    let alive = 0;
    for (const m of movers) {
      m.vy += gravity;
      m.x += m.vx;
      m.y += m.vy;
      m.rot += m.vrot;
      if (m.y + m.h > vh) {
        m.y = vh - m.h;
        m.vy *= bounce;
        m.vx *= 0.96;
        m.vrot *= 0.8;
        if (Math.abs(m.vy) < 1.2) m.vy = 0;
      }
      if (m.x < -m.w * 1.6 || m.x > vw + m.w * 1.6) continue;
      alive++;
      m.el.style.transform = `translate3d(${m.x}px, ${m.y}px, 0) rotate(${m.rot}deg)`;
    }
    if (alive === 0) {
      layer.replaceChildren();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    layer.replaceChildren();
  };
}
