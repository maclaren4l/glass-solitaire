// Pure Klondike game engine. No DOM, no browser APIs, no mutation of inputs.

import { createDeck, SUITS } from './deck.js';
import { canStackTableau, canStackFoundation, isValidRun } from './rules.js';

// ---------------------------------------------------------------------------
// Small internal helpers
// ---------------------------------------------------------------------------

function emptyFoundations() {
  return { S: [], H: [], D: [], C: [] };
}

function cloneState(state) {
  return {
    stock: state.stock.slice(),
    waste: state.waste.slice(),
    foundations: {
      S: state.foundations.S.slice(),
      H: state.foundations.H.slice(),
      D: state.foundations.D.slice(),
      C: state.foundations.C.slice(),
    },
    tableau: state.tableau.map((col) => col.slice()),
    drawCount: state.drawCount,
    moves: state.moves,
    score: state.score,
    elapsedMs: state.elapsedMs,
    history: state.history.slice(),
    passes: state.passes,
    won: state.won,
    seed: state.seed,
  };
}

/** If the top of `col` is face down, flip it. Returns { col, flipped }. */
function maybeFlip(col) {
  if (col.length === 0) return { col, flipped: false };
  const top = col[col.length - 1];
  if (top.faceUp) return { col, flipped: false };
  const newTop = { ...top, faceUp: true };
  return { col: col.slice(0, -1).concat([newTop]), flipped: true };
}

/** Re-hides the current top of `col` (used by undo to reverse an auto-flip). */
function rehideTop(col) {
  if (col.length === 0) return col;
  const top = col[col.length - 1];
  return col.slice(0, -1).concat([{ ...top, faceUp: false }]);
}

/** Applies a raw score delta with a floor of 0; returns the delta actually applied. */
function applyScoreDelta(score, rawDelta) {
  const newScore = Math.max(0, score + rawDelta);
  return { newScore, applied: newScore - score };
}

function sameLoc(a, b) {
  if (a === b) return true;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (!a || !b) return false;
  if (a.pile !== b.pile) return false;
  if (a.pile === 'tableau') return a.index === b.index;
  if (a.pile === 'foundation') return a.suit === b.suit;
  return false;
}

function cardIdsKey(cards) {
  return (cards || []).map((c) => c.id).join(',');
}

function tableauTop(col) {
  return col.length ? col[col.length - 1] : null;
}

// ---------------------------------------------------------------------------
// newGame
// ---------------------------------------------------------------------------

export function newGame({ seed, drawCount }) {
  const deck = createDeck(seed);
  const tableau = [[], [], [], [], [], [], []];
  let idx = 0;
  for (let row = 0; row < 7; row++) {
    for (let col = row; col < 7; col++) {
      const card = deck[idx++];
      card.faceUp = row === col;
      tableau[col].push(card);
    }
  }
  const stock = deck.slice(idx);

  return {
    stock,
    waste: [],
    foundations: emptyFoundations(),
    tableau,
    drawCount: drawCount === 3 ? 3 : 1,
    moves: 0,
    score: 0,
    elapsedMs: 0,
    history: [],
    passes: 0,
    won: false,
    seed,
  };
}

// ---------------------------------------------------------------------------
// legalMoves
// ---------------------------------------------------------------------------

export function legalMoves(state) {
  const result = [];

  // draw
  if (state.stock.length > 0) {
    const n = Math.min(state.drawCount, state.stock.length);
    const raw = state.stock.slice(state.stock.length - n);
    const dealt = raw.slice().reverse().map((c) => ({ ...c, faceUp: true }));
    result.push({ type: 'draw', from: 'stock', to: 'waste', count: n, cards: dealt });
  }

  // recycle
  if (state.stock.length === 0 && state.waste.length > 0) {
    const newStockOrder = state.waste.slice().reverse().map((c) => ({ ...c, faceUp: false }));
    result.push({ type: 'recycle', from: 'waste', to: 'stock', count: state.waste.length, cards: newStockOrder });
  }

  // t2t
  for (let si = 0; si < 7; si++) {
    const col = state.tableau[si];
    let faceUpStart = col.length;
    for (let i = 0; i < col.length; i++) {
      if (col[i].faceUp) { faceUpStart = i; break; }
    }
    for (let p = faceUpStart; p < col.length; p++) {
      const run = col.slice(p);
      if (!isValidRun(run)) continue;
      for (let di = 0; di < 7; di++) {
        if (di === si) continue;
        const destTop = tableauTop(state.tableau[di]);
        if (canStackTableau(run[0], destTop)) {
          result.push({
            type: 't2t',
            from: { pile: 'tableau', index: si },
            to: { pile: 'tableau', index: di },
            count: run.length,
            cards: run,
          });
        }
      }
    }
  }

  // t2f
  for (let si = 0; si < 7; si++) {
    const col = state.tableau[si];
    const top = tableauTop(col);
    if (!top || !top.faceUp) continue;
    const fnd = state.foundations[top.suit];
    const fndTop = fnd.length ? fnd[fnd.length - 1] : null;
    if (canStackFoundation(top, fndTop)) {
      result.push({
        type: 't2f',
        from: { pile: 'tableau', index: si },
        to: { pile: 'foundation', suit: top.suit },
        count: 1,
        cards: [top],
      });
    }
  }

  // w2t
  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1];
    for (let di = 0; di < 7; di++) {
      const destTop = tableauTop(state.tableau[di]);
      if (canStackTableau(top, destTop)) {
        result.push({
          type: 'w2t',
          from: 'waste',
          to: { pile: 'tableau', index: di },
          count: 1,
          cards: [top],
        });
      }
    }
  }

  // w2f
  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1];
    const fnd = state.foundations[top.suit];
    const fndTop = fnd.length ? fnd[fnd.length - 1] : null;
    if (canStackFoundation(top, fndTop)) {
      result.push({
        type: 'w2f',
        from: 'waste',
        to: { pile: 'foundation', suit: top.suit },
        count: 1,
        cards: [top],
      });
    }
  }

  // f2t
  for (const suit of SUITS) {
    const fnd = state.foundations[suit];
    if (fnd.length === 0) continue;
    const top = fnd[fnd.length - 1];
    for (let di = 0; di < 7; di++) {
      const destTop = tableauTop(state.tableau[di]);
      if (canStackTableau(top, destTop)) {
        result.push({
          type: 'f2t',
          from: { pile: 'foundation', suit },
          to: { pile: 'tableau', index: di },
          count: 1,
          cards: [top],
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// applyMove
// ---------------------------------------------------------------------------

function movesMatch(candidate, requested) {
  if (candidate.type !== requested.type) return false;
  if (requested.from != null && !sameLoc(candidate.from, requested.from)) return false;
  if (requested.to != null && !sameLoc(candidate.to, requested.to)) return false;
  if (requested.count != null && requested.count !== candidate.count) return false;
  if (requested.cards != null && cardIdsKey(requested.cards) !== cardIdsKey(candidate.cards)) return false;
  return true;
}

export function applyMove(state, move) {
  if (!move) return state;
  const candidates = legalMoves(state);
  const match = candidates.find((m) => movesMatch(m, move));
  if (!match) return state;

  const next = cloneState(state);
  let rawDelta = 0;
  const recorded = { ...match };

  switch (match.type) {
    case 'draw': {
      const n = match.count;
      next.stock = state.stock.slice(0, state.stock.length - n);
      next.waste = state.waste.concat(match.cards);
      rawDelta = 0;
      break;
    }
    case 'recycle': {
      next.stock = match.cards;
      next.waste = [];
      next.passes = state.passes + 1;
      rawDelta = state.drawCount === 1 ? -100 : 0;
      break;
    }
    case 't2t': {
      const si = match.from.index;
      const di = match.to.index;
      const run = match.cards;
      const remaining = state.tableau[si].slice(0, state.tableau[si].length - run.length);
      const { col: newSi, flipped } = maybeFlip(remaining);
      next.tableau[si] = newSi;
      next.tableau[di] = state.tableau[di].concat(run);
      recorded.flipped = flipped;
      rawDelta = flipped ? 5 : 0;
      break;
    }
    case 't2f': {
      const si = match.from.index;
      const suit = match.to.suit;
      const card = match.cards[0];
      const remaining = state.tableau[si].slice(0, -1);
      const { col: newSi, flipped } = maybeFlip(remaining);
      next.tableau[si] = newSi;
      next.foundations[suit] = state.foundations[suit].concat([card]);
      recorded.flipped = flipped;
      rawDelta = 10 + (flipped ? 5 : 0);
      break;
    }
    case 'w2t': {
      const di = match.to.index;
      const card = match.cards[0];
      next.waste = state.waste.slice(0, -1);
      next.tableau[di] = state.tableau[di].concat([card]);
      rawDelta = 5;
      break;
    }
    case 'w2f': {
      const suit = match.to.suit;
      const card = match.cards[0];
      next.waste = state.waste.slice(0, -1);
      next.foundations[suit] = state.foundations[suit].concat([card]);
      rawDelta = 10;
      break;
    }
    case 'f2t': {
      const suit = match.from.suit;
      const di = match.to.index;
      const card = match.cards[0];
      next.foundations[suit] = state.foundations[suit].slice(0, -1);
      next.tableau[di] = state.tableau[di].concat([card]);
      rawDelta = -15;
      break;
    }
    default:
      return state;
  }

  const { newScore, applied } = applyScoreDelta(state.score, rawDelta);
  next.score = newScore;
  recorded.scoreDelta = applied;
  if (recorded.flipped === undefined) recorded.flipped = false;

  next.history = state.history.concat([recorded]);
  next.moves = state.moves + 1;
  next.won = isWon(next);

  return next;
}

// ---------------------------------------------------------------------------
// undo
// ---------------------------------------------------------------------------

export function undo(state) {
  if (!state.history || state.history.length === 0) return state;
  const last = state.history[state.history.length - 1];
  const next = cloneState(state);
  next.history = state.history.slice(0, -1);
  next.moves = Math.max(0, state.moves - 1);

  switch (last.type) {
    case 'draw': {
      const dealt = last.cards;
      next.waste = state.waste.slice(0, state.waste.length - dealt.length);
      next.stock = state.stock.concat(dealt.slice().reverse().map((c) => ({ ...c, faceUp: false })));
      break;
    }
    case 'recycle': {
      const newStockOrder = last.cards; // bottom-to-top of the stock as it exists now
      next.waste = newStockOrder.slice().reverse().map((c) => ({ ...c, faceUp: true }));
      next.stock = [];
      next.passes = Math.max(0, state.passes - 1);
      break;
    }
    case 't2t': {
      const si = last.from.index;
      const di = last.to.index;
      const run = last.cards;
      let currentDi = state.tableau[di];
      next.tableau[di] = currentDi.slice(0, currentDi.length - run.length);
      let restoredSi = state.tableau[si];
      if (last.flipped) restoredSi = rehideTop(restoredSi);
      next.tableau[si] = restoredSi.concat(run);
      break;
    }
    case 't2f': {
      const si = last.from.index;
      const suit = last.to.suit;
      const card = last.cards[0];
      next.foundations[suit] = state.foundations[suit].slice(0, -1);
      let restoredSi = state.tableau[si];
      if (last.flipped) restoredSi = rehideTop(restoredSi);
      next.tableau[si] = restoredSi.concat([card]);
      break;
    }
    case 'w2t': {
      const di = last.to.index;
      const card = last.cards[0];
      const currentDi = state.tableau[di];
      next.tableau[di] = currentDi.slice(0, -1);
      next.waste = state.waste.concat([card]);
      break;
    }
    case 'w2f': {
      const suit = last.to.suit;
      const card = last.cards[0];
      next.foundations[suit] = state.foundations[suit].slice(0, -1);
      next.waste = state.waste.concat([card]);
      break;
    }
    case 'f2t': {
      const suit = last.from.suit;
      const di = last.to.index;
      const card = last.cards[0];
      const currentDi = state.tableau[di];
      next.tableau[di] = currentDi.slice(0, -1);
      next.foundations[suit] = state.foundations[suit].concat([card]);
      break;
    }
    default:
      return state;
  }

  next.score = state.score - (last.scoreDelta || 0);
  next.won = isWon(next);
  return next;
}

// ---------------------------------------------------------------------------
// findHint
// ---------------------------------------------------------------------------

function exposesFaceDown(state, move) {
  if (move.type !== 't2t' && move.type !== 't2f') return false;
  const si = move.from.index;
  const col = state.tableau[si];
  const remain = col.length - move.count;
  return remain > 0 && !col[remain - 1].faceUp;
}

function emptiesColumn(state, move) {
  if (!move.from || move.from.pile !== 'tableau') return false;
  const col = state.tableau[move.from.index];
  return col.length - move.count === 0;
}

function hasAvailableKing(state, excludeIndex) {
  if (state.waste.length && state.waste[state.waste.length - 1].rank === 13) return true;
  return state.tableau.some((col, idx) => {
    if (idx === excludeIndex) return false;
    const top = tableauTop(col);
    return top && top.faceUp && top.rank === 13;
  });
}

function isReversal(candidate, last) {
  if (!last) return false;
  if (!sameLoc(candidate.from, last.to)) return false;
  if (!sameLoc(candidate.to, last.from)) return false;
  if (cardIdsKey(candidate.cards) !== cardIdsKey(last.cards)) return false;
  return true;
}

export function findHint(state) {
  const last = state.history.length ? state.history[state.history.length - 1] : null;
  const candidates = legalMoves(state).filter((m) => m.type !== 'f2t' && !isReversal(m, last));
  if (candidates.length === 0) return null;

  let best = null;
  let bestPriority = Infinity;
  for (const m of candidates) {
    let p;
    if (exposesFaceDown(state, m)) {
      p = 1;
    } else if (emptiesColumn(state, m) && hasAvailableKing(state, m.from.index)) {
      p = 2;
    } else if (m.type === 'w2t' || m.type === 'w2f') {
      p = 3;
    } else if (m.type === 't2f') {
      p = 4;
    } else if (m.type === 't2t') {
      p = 5;
    } else {
      p = 6; // draw / recycle
    }
    if (p < bestPriority) {
      bestPriority = p;
      best = m;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// autoCompleteMoves / canAutoComplete
// ---------------------------------------------------------------------------

const AUTO_COMPLETE_MAX_ITER = 1000;

function simulateAutoComplete(state) {
  let s = state;
  const moves = [];
  for (let i = 0; i < AUTO_COMPLETE_MAX_ITER; i++) {
    if (isWon(s)) break;
    let progressed = false;

    const all = legalMoves(s);
    const foundationMoves = all.filter((m) => m.type === 't2f' || m.type === 'w2f');
    if (foundationMoves.length > 0) {
      const ns = applyMove(s, foundationMoves[0]);
      if (ns !== s) {
        moves.push(ns.history[ns.history.length - 1]);
        s = ns;
        progressed = true;
      }
    }

    if (!progressed) {
      const drawMoves = all.filter((m) => m.type === 'draw');
      if (drawMoves.length > 0) {
        const ns = applyMove(s, drawMoves[0]);
        if (ns !== s) {
          moves.push(ns.history[ns.history.length - 1]);
          s = ns;
          progressed = true;
        }
      }
    }

    if (!progressed) {
      const recycleMoves = all.filter((m) => m.type === 'recycle');
      if (recycleMoves.length > 0) {
        const ns = applyMove(s, recycleMoves[0]);
        if (ns !== s) {
          moves.push(ns.history[ns.history.length - 1]);
          s = ns;
          progressed = true;
        }
      }
    }

    if (!progressed) break;
  }
  return { finalState: s, moves, won: isWon(s) };
}

export function canAutoComplete(state) {
  for (const col of state.tableau) {
    for (const c of col) {
      if (!c.faceUp) return false;
    }
  }
  return simulateAutoComplete(state).won;
}

export function autoCompleteMoves(state) {
  if (!canAutoComplete(state)) return [];
  return simulateAutoComplete(state).moves;
}

// ---------------------------------------------------------------------------
// isWon / serialize / deserialize
// ---------------------------------------------------------------------------

export function isWon(state) {
  return SUITS.every((suit) => state.foundations[suit].length === 13);
}

export function serialize(state) {
  return JSON.parse(JSON.stringify(state));
}

export function deserialize(obj) {
  return JSON.parse(JSON.stringify(obj));
}
