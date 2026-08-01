/**
 * Controller. Owns the single source of truth (`state`) and is the only place that calls
 * the engine's mutating helpers. Everything else either reads state or asks for a move.
 */

import {
  newGame, applyMove, undo, legalMoves, findHint,
  autoCompleteMoves, canAutoComplete, isWon, serialize, deserialize,
} from './engine/game.js';
import {
  initRender, render, resetRender, renderStockMeta, renderStats,
  allCardEls, getCardEl, measure, getPiles,
} from './ui/render.js';
import { initInteract } from './ui/interact.js';
import {
  snapshot, flip, dealIn, pulseHint, winCascade, setAnimationsEnabled, animationsOn,
} from './ui/anim.js';
import {
  applyTheme, bindSegmented, openSheet, closeSheet, isSheetOpen,
  renderStatsGrid, toast, formatTime,
} from './ui/chrome.js';
import * as store from './storage.js';

const $ = (sel) => document.querySelector(sel);

const el = {
  app: $('.app'),
  board: $('#board'),
  dragLayer: $('#drag-layer'),
  stockMeta: $('#stock-meta'),
  stats: { time: $('#stat-time'), moves: $('#stat-moves'), score: $('#stat-score') },
  btnUndo: $('#btn-undo'),
  btnHint: $('#btn-hint'),
  btnAuto: $('#btn-auto'),
  btnNew: $('#btn-new'),
  btnMenu: $('#btn-menu'),
  menuScrim: $('#menu-scrim'),
  menuClose: $('#menu-close'),
  btnNewDeal: $('#btn-newdeal'),
  btnRestart: $('#btn-restart'),
  btnResetStats: $('#btn-resetstats'),
  statsGrid: $('#stats-grid'),
  winScrim: $('#win-scrim'),
  winSummary: $('#win-summary'),
  btnWinNew: $('#btn-winnew'),
  btnWinClose: $('#btn-winclose'),
  toast: $('#toast'),
};

let settings = store.loadSettings();
let state = null;
let timerId = 0;
let timerRunning = false;
let lastTick = 0;
let autoPlaying = false;
let stopCascade = null;
let saveTimer = 0;

// ------------------------------------------------------------------ lifecycle

function startTimer() {
  if (timerRunning || !state || state.won) return;
  timerRunning = true;
  lastTick = performance.now();
  timerId = setInterval(() => {
    const now = performance.now();
    state.elapsedMs += now - lastTick;
    lastTick = now;
    renderStats(state, el.stats);
  }, 500);
}

function stopTimer() {
  if (!timerRunning) return;
  state.elapsedMs += performance.now() - lastTick;
  timerRunning = false;
  clearInterval(timerId);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (state && !state.won) store.saveGame(serialize(state));
  }, 250);
}

function startGame(nextState, { deal = true } = {}) {
  stopTimer();
  stopCascade?.();
  stopCascade = null;
  autoPlaying = false;
  closeSheet(el.winScrim);

  state = nextState;
  state.elapsedMs = state.elapsedMs || 0;
  resetRender();
  measure();
  render(state);
  refreshChrome();

  if (deal && animationsOn()) {
    const stockRect = getPiles().stock.getBoundingClientRect();
    dealIn(allCardEls(), { x: stockRect.left, y: stockRect.top });
  }
  store.clearGame();
}

function newDeal({ seed = (Math.random() * 2 ** 32) >>> 0 } = {}) {
  // An abandoned game in progress counts as a loss, which is what breaks a win streak.
  if (state && !state.won && state.moves > 0) {
    store.recordResult({ won: false, elapsedMs: state.elapsedMs, moves: state.moves, score: state.score });
  }
  startGame(newGame({ seed, drawCount: settings.drawCount }));
}

function restartDeal() {
  if (!state) return;
  startGame(newGame({ seed: state.seed, drawCount: settings.drawCount }));
}

// ------------------------------------------------------------------ dispatch

/** Apply a move (or `null` to simply re-render) and animate the difference. */
function dispatch(move) {
  const before = snapshot(allCardEls());

  if (move) {
    const next = applyMove(state, move);
    if (next === state) {
      render(state);
      return false;
    }
    state = next;
    if (!timerRunning && !state.won) startTimer();
  }

  render(state);
  flip(before, allCardEls());
  refreshChrome();
  scheduleSave();

  if (move && isWon(state)) onWin();
  return true;
}

function refreshChrome() {
  if (!state) return;
  renderStats(state, el.stats);
  renderStockMeta(el.stockMeta, state);
  el.btnUndo.disabled = state.history.length === 0 || autoPlaying;
  const showAuto = !state.won && canAutoComplete(state);
  // Inline display, not the `hidden` attribute: `.glass-button { display: flex }` outranks
  // the UA's `[hidden] { display: none }`, so `hidden` alone leaves the button on screen.
  el.btnAuto.hidden = !showAuto;
  el.btnAuto.style.display = showAuto ? '' : 'none';
  el.btnHint.disabled = state.won || autoPlaying;
}

// ------------------------------------------------------------------ actions

function doDraw() {
  const moves = legalMoves(state);
  const draw = moves.find((m) => m.type === 'draw') || moves.find((m) => m.type === 'recycle');
  if (draw) dispatch(draw);
  else toast(el.toast, 'No cards left to draw');
}

function doUndo() {
  if (!state.history.length || autoPlaying) return;
  const before = snapshot(allCardEls());
  state = undo(state);
  render(state);
  flip(before, allCardEls());
  refreshChrome();
  scheduleSave();
}

function doHint() {
  if (state.won || autoPlaying) return;
  const hint = findHint(state);
  if (!hint) {
    toast(el.toast, legalMoves(state).length ? 'Nothing useful — try the stock' : 'No moves left');
    return;
  }
  const targets = [getCardEl(hint.cards?.[0]?.id)];
  const piles = getPiles();
  if (hint.to?.pile === 'tableau') targets.push(piles.tableau[hint.to.index]);
  else if (hint.to?.pile === 'foundation') targets.push(piles.foundation[hint.to.suit]);
  else if (hint.to === 'waste') targets.push(piles.waste);
  pulseHint(targets);
}

async function doAutoComplete() {
  if (autoPlaying || state.won) return;
  const moves = autoCompleteMoves(state);
  if (!moves.length) return;
  autoPlaying = true;
  el.btnAuto.disabled = true;
  const step = animationsOn() ? 90 : 0;
  for (const move of moves) {
    dispatch(move);
    if (step) await new Promise((r) => setTimeout(r, step));
  }
  autoPlaying = false;
  el.btnAuto.disabled = false;
  refreshChrome();
}

function onWin() {
  stopTimer();
  store.clearGame();
  const stats = store.recordResult({
    won: true, elapsedMs: state.elapsedMs, moves: state.moves, score: state.score,
  });
  renderStatsGrid(el.statsGrid, stats);
  el.winSummary.textContent =
    `${formatTime(state.elapsedMs)} · ${state.moves} moves · ${state.score} points`;
  stopCascade = winCascade(allCardEls(), el.dragLayer);
  setTimeout(() => openSheet(el.winScrim), animationsOn() ? 2400 : 300);
}

// ------------------------------------------------------------------ settings

function setDrawCount(value) {
  const n = Number(value) === 3 ? 3 : 1;
  if (n === settings.drawCount) return;
  settings.drawCount = n;
  store.saveSettings(settings);
  drawSegments.forEach((s) => s.set(n));
  newDeal();
  toast(el.toast, `Draw ${n} — new deal`);
}

function setTheme(value) {
  settings.theme = value;
  store.saveSettings(settings);
  applyTheme(value);
}

function setAnimations(value) {
  settings.animations = value === 'on';
  store.saveSettings(settings);
  setAnimationsEnabled(settings.animations);
}

// ------------------------------------------------------------------ boot

const drawSegments = [];

function boot() {
  applyTheme(settings.theme);
  setAnimationsEnabled(settings.animations);
  initRender(document);

  drawSegments.push(bindSegmented($('#draw-mode'), 'draw', setDrawCount));
  drawSegments.push(bindSegmented($('#draw-mode-sheet'), 'draw', setDrawCount));
  drawSegments.forEach((s) => s.set(settings.drawCount));
  bindSegmented($('#theme-mode'), 'theme', setTheme).set(settings.theme);
  bindSegmented($('#anim-mode'), 'anim', setAnimations).set(settings.animations ? 'on' : 'off');

  initInteract({
    root: el.app,
    piles: getPiles(),
    getState: () => state,
    dispatch: (move) => dispatch(move),
    onDraw: doDraw,
    onIllegal: () => {},
  });

  el.btnUndo.addEventListener('click', doUndo);
  el.btnHint.addEventListener('click', doHint);
  el.btnAuto.addEventListener('click', doAutoComplete);
  el.btnNew.addEventListener('click', () => newDeal());
  el.btnMenu.addEventListener('click', () => {
    renderStatsGrid(el.statsGrid, store.loadStats());
    openSheet(el.menuScrim);
  });
  el.menuClose.addEventListener('click', () => closeSheet(el.menuScrim));
  el.menuScrim.addEventListener('click', (e) => {
    if (e.target === el.menuScrim) closeSheet(el.menuScrim);
  });
  el.btnNewDeal.addEventListener('click', () => { closeSheet(el.menuScrim); newDeal(); });
  el.btnRestart.addEventListener('click', () => { closeSheet(el.menuScrim); restartDeal(); });
  el.btnResetStats.addEventListener('click', () => {
    renderStatsGrid(el.statsGrid, store.resetStats());
    toast(el.toast, 'Statistics reset');
  });
  el.btnWinNew.addEventListener('click', () => { closeSheet(el.winScrim); newDeal(); });
  el.btnWinClose.addEventListener('click', () => { closeSheet(el.winScrim); stopCascade?.(); });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'escape') {
      closeSheet(el.menuScrim);
      closeSheet(el.winScrim);
      return;
    }
    if (isSheetOpen(el.menuScrim) || isSheetOpen(el.winScrim)) return;
    // e.target can be the document itself, which has no .matches
    if (e.target?.matches?.('input, textarea')) return;
    // Space belongs to whichever control has focus, so it must not also deal a card.
    if (key === ' ' && e.target?.matches?.('button, [role="tab"]')) return;
    const actions = {
      ' ': doDraw, u: doUndo, h: doHint, a: doAutoComplete,
      n: () => newDeal(), r: restartDeal,
    };
    const action = actions[key === ' ' ? ' ' : key];
    if (action) { e.preventDefault(); action(); }
  });

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => { measure(); render(state); });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer();
    else if (state && !state.won && state.moves > 0) startTimer();
  });

  // Restore an interrupted game, but only if it still matches the current draw setting.
  const saved = store.loadGame();
  let restored = false;
  if (saved) {
    try {
      const s = deserialize(saved);
      if (s && s.tableau?.length === 7 && !isWon(s)) {
        settings.drawCount = s.drawCount;
        drawSegments.forEach((seg) => seg.set(s.drawCount));
        startGame(s, { deal: false });
        restored = true;
        if (s.moves > 0) toast(el.toast, 'Game resumed');
      }
    } catch {
      store.clearGame();
    }
  }
  if (!restored) startGame(newGame({ seed: (Math.random() * 2 ** 32) >>> 0, drawCount: settings.drawCount }));

  // Local-only inspection hook for manual and automated testing. Never defined in production.
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    window.__solitaire = {
      get state() { return state; },
      dispatch, legalMoves: () => legalMoves(state), newDeal, restartDeal, doAutoComplete,
      load: (obj) => startGame(deserialize(obj), { deal: false }),
    };
  }
}

boot();
