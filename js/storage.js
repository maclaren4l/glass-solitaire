/**
 * localStorage persistence: settings, lifetime statistics, and the in-progress game.
 * Every access is guarded — private browsing and disabled storage must not break the game.
 */

const KEY_SETTINGS = 'glass-solitaire:settings';
const KEY_STATS = 'glass-solitaire:stats';
const KEY_GAME = 'glass-solitaire:game';

const DEFAULT_SETTINGS = { drawCount: 1, theme: 'auto', animations: true };

const DEFAULT_STATS = {
  played: 0,
  won: 0,
  currentStreak: 0,
  bestStreak: 0,
  bestTimeMs: null,
  bestMoves: null,
  bestScore: 0,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return { ...fallback };
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function loadSettings() {
  const s = read(KEY_SETTINGS, DEFAULT_SETTINGS);
  s.drawCount = s.drawCount === 3 ? 3 : 1;
  if (!['auto', 'light', 'dark'].includes(s.theme)) s.theme = 'auto';
  s.animations = s.animations !== false;
  return s;
}

export function saveSettings(settings) {
  write(KEY_SETTINGS, settings);
}

export function loadStats() {
  return read(KEY_STATS, DEFAULT_STATS);
}

export function saveStats(stats) {
  write(KEY_STATS, stats);
}

export function resetStats() {
  remove(KEY_STATS);
  return { ...DEFAULT_STATS };
}

/** Counts a finished game. `won` false means the deal was abandoned for a new one. */
export function recordResult({ won, elapsedMs, moves, score }) {
  const stats = loadStats();
  stats.played += 1;
  if (won) {
    stats.won += 1;
    stats.currentStreak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    if (stats.bestTimeMs === null || elapsedMs < stats.bestTimeMs) stats.bestTimeMs = elapsedMs;
    if (stats.bestMoves === null || moves < stats.bestMoves) stats.bestMoves = moves;
    stats.bestScore = Math.max(stats.bestScore, score);
  } else {
    stats.currentStreak = 0;
  }
  saveStats(stats);
  return stats;
}

export function saveGame(serialized) {
  write(KEY_GAME, serialized);
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY_GAME);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearGame() {
  remove(KEY_GAME);
}
