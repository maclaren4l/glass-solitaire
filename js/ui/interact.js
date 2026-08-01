/**
 * Input: pointer drag-and-drop, click/tap-to-move, and double-click-to-foundation.
 *
 * No move is ever constructed by hand here. The UI describes what the player *tried* to do,
 * then looks for a matching entry in `legalMoves(state)`; if there isn't one, the attempt is
 * rejected. That keeps rule enforcement entirely in the engine — the UI cannot invent an
 * illegal move even if its own hit-testing is wrong.
 */

import { legalMoves } from '../engine/game.js';
import { isValidRun } from '../engine/rules.js';
import { getCardEl, getMetrics } from './render.js';
import { shake } from './anim.js';

const DRAG_THRESHOLD = 4; // px before a press becomes a drag rather than a click

export function initInteract({ root, piles, getState, dispatch, onDraw, onIllegal }) {
  const dragLayer = root.querySelector('.drag-layer');

  /** @type {null | object} */
  let press = null;
  let dragging = null;
  let selected = null; // { source, count } for tap-to-move

  // ---------------------------------------------------------------- locations

  /** Where in the game state does this DOM element live? */
  function locate(el) {
    const pileEl = el.closest('.pile');
    if (!pileEl) return null;
    const kind = pileEl.dataset.pile;
    if (kind === 'tableau') return { pile: 'tableau', index: Number(pileEl.dataset.index), el: pileEl };
    if (kind === 'foundation') return { pile: 'foundation', suit: pileEl.dataset.suit, el: pileEl };
    return { pile: kind, el: pileEl };
  }

  /** Contract encoding: waste/stock are bare strings, tableau/foundation are objects. */
  function toRef(loc) {
    if (!loc) return null;
    if (loc.pile === 'waste') return 'waste';
    if (loc.pile === 'stock') return 'stock';
    if (loc.pile === 'tableau') return { pile: 'tableau', index: loc.index };
    return { pile: 'foundation', suit: loc.suit };
  }

  function sameRef(a, b) {
    if (a == null || b == null) return false;
    if (typeof a === 'string' || typeof b === 'string') return a === b;
    if (a.pile !== b.pile) return false;
    return a.pile === 'tableau' ? a.index === b.index : a.suit === b.suit;
  }

  function findMove({ from, to, count }) {
    const moves = legalMoves(getState());
    return (
      moves.find(
        (m) =>
          sameRef(m.from, from) &&
          (to === undefined || sameRef(m.to, to)) &&
          (count === undefined || m.count === count),
      ) || null
    );
  }

  /** Cards the player would pick up by grabbing `cardId`, or null if that isn't allowed. */
  function grabGroup(cardId, loc) {
    const state = getState();
    if (loc.pile === 'tableau') {
      const col = state.tableau[loc.index];
      const i = col.findIndex((c) => c.id === cardId);
      if (i < 0) return null;
      const run = col.slice(i);
      if (!run[0].faceUp || !isValidRun(run)) return null;
      return run;
    }
    if (loc.pile === 'waste') {
      const top = state.waste[state.waste.length - 1];
      return top && top.id === cardId ? [top] : null;
    }
    if (loc.pile === 'foundation') {
      const f = state.foundations[loc.suit];
      const top = f[f.length - 1];
      return top && top.id === cardId ? [top] : null;
    }
    return null;
  }

  // ---------------------------------------------------------------- dragging

  function beginDrag(cards, loc, pointer) {
    const els = cards.map((c) => getCardEl(c.id)).filter(Boolean);
    if (!els.length) return null;

    const first = els[0].getBoundingClientRect();
    const { cardW, cardH } = getMetrics();
    const lastTop = els[els.length - 1].getBoundingClientRect().top;

    const group = document.createElement('div');
    group.className = 'drag-group';
    group.style.cssText =
      `position:fixed;left:0;top:0;width:${cardW}px;` +
      `height:${lastTop - first.top + cardH}px;will-change:transform;`;

    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      el.classList.add('is-dragging');
      el.style.setProperty('--y', `${r.top - first.top}px`);
      el.style.left = '0px';
      group.appendChild(el);
    });

    dragLayer.appendChild(group);
    dragLayer.classList.add('is-active');

    const d = {
      cards,
      els,
      group,
      from: loc,
      originX: first.left,
      originY: first.top,
      offsetX: pointer.x - first.left,
      offsetY: pointer.y - first.top,
      target: null,
    };
    moveDrag(d, pointer);
    return d;
  }

  function moveDrag(d, pointer) {
    const x = pointer.x - d.offsetX;
    const y = pointer.y - d.offsetY;
    d.group.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    highlight(d, { left: x, top: y });
  }

  /** Pick the legal pile with the greatest overlap with the dragged stack's top card. */
  function highlight(d, box) {
    const { cardW, cardH } = getMetrics();
    const rect = { left: box.left, top: box.top, right: box.left + cardW, bottom: box.top + cardH };
    const candidates = [...piles.tableau, ...Object.values(piles.foundation)];

    let best = null;
    let bestArea = 0;
    for (const pileEl of candidates) {
      const loc = locate(pileEl);
      if (sameRef(toRef(loc), toRef(d.from)) && loc.pile !== 'tableau') continue;
      const r = pileEl.getBoundingClientRect();
      const overlap =
        Math.max(0, Math.min(rect.right, r.right) - Math.max(rect.left, r.left)) *
        Math.max(0, Math.min(rect.bottom, r.bottom) - Math.max(rect.top, r.top));
      if (overlap <= bestArea) continue;
      if (!findMove({ from: toRef(d.from), to: toRef(loc), count: d.cards.length })) continue;
      best = { loc, el: pileEl };
      bestArea = overlap;
    }

    if (d.target?.el !== best?.el) {
      d.target?.el.classList.remove('is-drop-target');
      best?.el.classList.add('is-drop-target');
      d.target = best;
    }
  }

  function endDrag(d, { cancel = false } = {}) {
    d.target?.el.classList.remove('is-drop-target');
    dragLayer.classList.remove('is-active');

    const move = cancel
      ? null
      : d.target && findMove({ from: toRef(d.from), to: toRef(d.target.loc), count: d.cards.length });

    // Hand the elements back before re-rendering, so render.js repositions them normally.
    d.els.forEach((el) => {
      el.classList.remove('is-dragging');
      el.style.left = '0px';
    });
    d.group.remove();

    if (move) {
      dispatch(move);
    } else {
      if (!cancel && d.moved) {
        shake(d.els[0]);
        onIllegal?.();
      }
      dispatch(null); // re-render: snaps the cards home with a FLIP
    }
  }

  // ---------------------------------------------------------------- selection

  function clearSelection() {
    if (!selected) return;
    selected.els.forEach((el) => el.classList.remove('is-selected'));
    selected = null;
  }

  function select(cards, loc) {
    clearSelection();
    const els = cards.map((c) => getCardEl(c.id)).filter(Boolean);
    els.forEach((el) => el.classList.add('is-selected'));
    selected = { cards, loc, els };
  }

  /** Best available foundation/tableau destination for a single card — the double-click path. */
  function autoPlay(loc, count) {
    const from = toRef(loc);
    const toFoundation = legalMoves(getState()).find(
      (m) => sameRef(m.from, from) && m.to?.pile === 'foundation' && m.count === count,
    );
    if (toFoundation) return toFoundation;
    if (loc.pile === 'foundation') return null;
    // Prefer a tableau destination that isn't an empty column, so double-click doesn't
    // strand a card in a fresh gap the player was saving for a King.
    const tableauMoves = legalMoves(getState()).filter(
      (m) => sameRef(m.from, from) && m.to?.pile === 'tableau' && m.count === count,
    );
    const state = getState();
    return (
      tableauMoves.find((m) => state.tableau[m.to.index].length > 0) || tableauMoves[0] || null
    );
  }

  // ---------------------------------------------------------------- events

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const cardEl = e.target.closest('.card');
    const pileEl = e.target.closest('.pile');
    if (!pileEl) {
      clearSelection();
      return;
    }

    if (pileEl.dataset.pile === 'stock') {
      clearSelection();
      onDraw();
      return;
    }

    // Tap a destination while something is selected -> move it there.
    if (selected && (!cardEl || !grabGroup(cardEl.dataset.cardId, locate(cardEl)))) {
      const move = findMove({
        from: toRef(selected.loc),
        to: toRef(locate(pileEl)),
        count: selected.cards.length,
      });
      clearSelection();
      if (move) {
        dispatch(move);
        return;
      }
    }

    if (!cardEl) {
      clearSelection();
      return;
    }

    const loc = locate(cardEl);
    const cards = grabGroup(cardEl.dataset.cardId, loc);
    if (!cards) {
      clearSelection();
      return;
    }

    press = { cards, loc, x: e.clientX, y: e.clientY, pointerId: e.pointerId, el: cardEl };
    cardEl.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (dragging) {
      dragging.moved = true;
      moveDrag(dragging, { x: e.clientX, y: e.clientY });
      e.preventDefault();
      return;
    }
    if (!press) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD) return;
    clearSelection();
    dragging = beginDrag(press.cards, press.loc, { x: e.clientX, y: e.clientY });
    press = null;
    if (dragging) dragging.moved = true;
  }

  function onPointerUp(e) {
    if (dragging) {
      const d = dragging;
      dragging = null;
      endDrag(d);
      return;
    }
    if (!press) return;
    const p = press;
    press = null;
    p.el.releasePointerCapture?.(e.pointerId);

    // A tap on an already-selected card commits it to its best destination; otherwise select.
    if (selected && selected.cards[0].id === p.cards[0].id) {
      const move = autoPlay(p.loc, p.cards.length);
      clearSelection();
      if (move) dispatch(move);
      else shake(p.el);
      return;
    }
    select(p.cards, p.loc);
  }

  function onDoubleClick(e) {
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    const loc = locate(cardEl);
    const cards = grabGroup(cardEl.dataset.cardId, loc);
    if (!cards) return;
    clearSelection();
    const move = autoPlay(loc, cards.length);
    if (move) dispatch(move);
    else shake(cardEl);
  }

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove, { passive: false });
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', () => {
    if (dragging) {
      const d = dragging;
      dragging = null;
      endDrag(d, { cancel: true });
    }
    press = null;
  });
  root.addEventListener('dblclick', onDoubleClick);
  root.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.card')) e.preventDefault();
  });

  return { clearSelection, isDragging: () => !!dragging };
}
