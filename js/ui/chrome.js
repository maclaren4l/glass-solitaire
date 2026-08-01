/**
 * Chrome: theme, segmented controls, modal sheets, the statistics grid and toasts.
 * Nothing here knows the rules of solitaire — it only reflects and reports.
 */

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/**
 * Wire an iOS-style segmented control. Selection is expressed with aria-selected, which is
 * both the accessibility state and the hook the CSS uses to slide the pill.
 */
export function bindSegmented(el, attr, onChange) {
  if (!el) return { set() {} };
  const options = Array.from(el.querySelectorAll('.glass-segmented__option'));

  const set = (value) => {
    options.forEach((o, i) => {
      const on = o.dataset[attr] === String(value);
      o.setAttribute('aria-selected', on ? 'true' : 'false');
      o.tabIndex = on ? 0 : -1;
      if (on) el.style.setProperty('--selected-index', String(i));
    });
    el.style.setProperty('--option-count', String(options.length));
  };

  el.addEventListener('click', (e) => {
    const opt = e.target.closest('.glass-segmented__option');
    if (!opt) return;
    const value = opt.dataset[attr];
    set(value);
    onChange(value);
  });

  el.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = options.findIndex((o) => o.getAttribute('aria-selected') === 'true');
    const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
    set(next.dataset[attr]);
    next.focus();
    onChange(next.dataset[attr]);
    e.preventDefault();
  });

  return { set };
}

let lastFocused = null;

export function openSheet(scrim) {
  if (!scrim) return;
  lastFocused = document.activeElement;
  scrim.hidden = false;
  requestAnimationFrame(() => scrim.classList.add('is-open'));
  const focusable = scrim.querySelector('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
  focusable?.focus();
}

export function closeSheet(scrim) {
  if (!scrim || scrim.hidden) return;
  scrim.classList.remove('is-open');
  const done = () => {
    scrim.hidden = true;
    scrim.removeEventListener('transitionend', done);
  };
  scrim.addEventListener('transitionend', done);
  setTimeout(done, 320); // in case transitions are off
  lastFocused?.focus?.();
}

export function isSheetOpen(scrim) {
  return scrim && !scrim.hidden;
}

export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function renderStatsGrid(el, stats) {
  if (!el) return;
  const winRate = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  const rows = [
    ['Games played', stats.played],
    ['Games won', stats.won],
    ['Win rate', `${winRate}%`],
    ['Current streak', stats.currentStreak],
    ['Best streak', stats.bestStreak],
    ['Best time', stats.bestTimeMs === null ? '—' : formatTime(stats.bestTimeMs)],
    ['Fewest moves', stats.bestMoves === null ? '—' : stats.bestMoves],
    ['Best score', stats.bestScore],
  ];
  el.replaceChildren(
    ...rows.flatMap(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = String(value);
      return [dt, dd];
    }),
  );
}

let toastTimer = 0;
export function toast(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => { el.hidden = true; }, 300);
  }, 1900);
}
