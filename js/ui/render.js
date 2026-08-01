/**
 * State -> DOM.
 *
 * Card elements are created once and reused for the lifetime of a deal, keyed by card id.
 * Reuse is what makes FLIP animation possible: anim.js measures the same nodes before and
 * after a render and animates the delta. Rebuilding the DOM each frame would kill that.
 *
 * JS owns each card's `--y` offset (see CONTRACT.md section 4); CSS must not set `top`.
 */

import { cardFaceSVG, cardBackSVG } from './cardface.js';

const SUITS = ['S', 'H', 'D', 'C'];

/** @type {Map<string, HTMLElement>} */
const cardEls = new Map();

let piles = null;
let metrics = { cardH: 140, gapUp: 30, gapDown: 14 };

export function initRender(root = document) {
  piles = {
    stock: root.querySelector('[data-pile="stock"]'),
    waste: root.querySelector('[data-pile="waste"]'),
    foundation: Object.fromEntries(
      SUITS.map((s) => [s, root.querySelector(`[data-pile="foundation"][data-suit="${s}"]`)]),
    ),
    tableau: Array.from(root.querySelectorAll('[data-pile="tableau"]')).sort(
      (a, b) => Number(a.dataset.index) - Number(b.dataset.index),
    ),
  };
  measure();
  return piles;
}

export function getPiles() {
  return piles;
}

/**
 * Resolve the card metrics from CSS. The tokens use clamp(), which getComputedStyle does not
 * reliably resolve for custom properties, so measure a probe element that actually applies
 * them as real properties.
 */
export function measure() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;' +
    'width:var(--card-w);height:var(--card-h);border-top:var(--stack-gap-up) solid;' +
    'border-bottom:var(--stack-gap-down) solid;';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const cardW = parseFloat(cs.width) || 100;
  const cardH = parseFloat(cs.height) || 140;
  let gapUp = parseFloat(cs.borderTopWidth);
  let gapDown = parseFloat(cs.borderBottomWidth);
  probe.remove();

  if (!gapUp || Number.isNaN(gapUp)) gapUp = cardH * 0.24;
  if (!gapDown || Number.isNaN(gapDown)) gapDown = cardH * 0.11;
  metrics = { cardW, cardH, gapUp, gapDown };
  return metrics;
}

export function getMetrics() {
  return metrics;
}

function cardEl(card) {
  let el = cardEls.get(card.id);
  if (el) return el;

  el = document.createElement('div');
  el.className = 'card';
  el.dataset.cardId = card.id;
  el.dataset.suit = card.suit;
  el.dataset.rank = String(card.rank);
  el.dataset.face = card.faceUp ? 'up' : 'down';

  const inner = document.createElement('div');
  inner.className = 'card__inner';
  const front = document.createElement('div');
  front.className = 'card__front';
  front.innerHTML = cardFaceSVG(card);
  const back = document.createElement('div');
  back.className = 'card__back';
  back.innerHTML = cardBackSVG();
  inner.append(front, back);
  el.append(inner);

  cardEls.set(card.id, el);
  return el;
}

export function getCardEl(cardId) {
  return cardEls.get(cardId) || null;
}

export function allCardEls() {
  return Array.from(cardEls.values());
}

/** Drops every cached element. Call when starting a new deal. */
export function resetRender() {
  cardEls.clear();
  if (!piles) return;
  const wipe = (p) => p && p.replaceChildren();
  wipe(piles.stock);
  wipe(piles.waste);
  SUITS.forEach((s) => wipe(piles.foundation[s]));
  piles.tableau.forEach(wipe);
}

/**
 * Vertical offsets for one tableau column, compressed to fit the available height when the
 * column runs long (7 face-down + a K..A run overflows any laptop screen otherwise).
 */
function tableauOffsets(column, availableH) {
  const offsets = [];
  let y = 0;
  for (let i = 0; i < column.length; i++) {
    offsets.push(y);
    y += column[i].faceUp ? metrics.gapUp : metrics.gapDown;
  }
  const extent = offsets.length ? offsets[offsets.length - 1] + metrics.cardH : 0;
  if (availableH > 0 && extent > availableH && offsets.length > 1) {
    const scale = Math.max(0.28, (availableH - metrics.cardH) / (extent - metrics.cardH));
    for (let i = 0; i < offsets.length; i++) offsets[i] = Math.round(offsets[i] * scale);
  }
  return offsets;
}

/**
 * Sync the DOM to `state`. Cards not in a visible position are simply not appended.
 * Only the top few waste cards are shown, matching the draw-3 fan of the reference game.
 */
export function render(state) {
  if (!piles) return;

  // --- stock: face-down, tightly stacked so the pile has visible depth
  syncPile(
    piles.stock,
    state.stock.slice(-6),
    (_, i, n) => Math.round((n - 1 - i) * -0.6),
  );

  // --- waste: fan the top `drawCount` cards horizontally
  const wasteShown = state.waste.slice(-Math.max(3, state.drawCount));
  const fanCount = Math.min(state.drawCount, wasteShown.length);
  syncPile(piles.waste, wasteShown, () => 0, (card, i, n) => {
    const fanIndex = i - (n - fanCount);
    return fanIndex > 0 ? Math.round(fanIndex * metrics.cardW * 0.26) : 0;
  });

  // --- foundations: the whole pile stays in the DOM, stacked flat. Only the top card is
  // visible, but keeping all 52 elements alive is what lets the win cascade throw a full deck.
  for (const suit of SUITS) {
    syncPile(piles.foundation[suit], state.foundations[suit], () => 0);
  }

  // --- tableau
  const availableH = piles.tableau[0] ? piles.tableau[0].parentElement.clientHeight : 0;
  state.tableau.forEach((column, i) => {
    const offsets = tableauOffsets(column, availableH);
    syncPile(piles.tableau[i], column, (_, idx) => offsets[idx]);
  });
}

/**
 * Make `pileEl`'s children exactly `cards`, in order, without churning nodes that are
 * already in place — appendChild on an existing child is a move, not a recreate, so element
 * identity (and therefore FLIP measurement) survives.
 */
function syncPile(pileEl, cards, yFor, xFor) {
  if (!pileEl) return;
  const wanted = new Set(cards.map((c) => c.id));

  for (const child of Array.from(pileEl.children)) {
    if (child.classList.contains('card') && !wanted.has(child.dataset.cardId)) {
      child.remove();
    }
  }

  cards.forEach((card, i) => {
    const el = cardEl(card);
    if (el.classList.contains('is-dragging')) return; // owned by the drag layer right now
    if (el.parentElement !== pileEl || pileEl.children[i] !== el) {
      pileEl.appendChild(el);
    }
    el.dataset.face = card.faceUp ? 'up' : 'down';
    el.style.setProperty('--y', `${yFor(card, i, cards.length)}px`);
    // Horizontal fan (waste only) goes on inline `left`, which beats the stylesheet's
    // `left: 0` without needing the CSS to know about it.
    el.style.left = `${xFor ? xFor(card, i, cards.length) : 0}px`;
    el.style.zIndex = String(i + 1);
  });
}

/** The stock/pass readout under the board. */
export function renderStockMeta(el, state) {
  if (!el) return;
  const left = state.stock.length;
  const parts = [`${left} in stock`];
  if (state.drawCount === 3) parts.push(`${state.passes} pass${state.passes === 1 ? '' : 'es'}`);
  el.textContent = parts.join(' · ');
}

export function renderStats(state, els) {
  const totalSeconds = Math.floor(state.elapsedMs / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  els.time.textContent = `${m}:${String(s).padStart(2, '0')}`;
  els.moves.textContent = String(state.moves);
  els.score.textContent = String(state.score);
}
