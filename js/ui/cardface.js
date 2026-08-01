// cardface.js — pure SVG string generators for card faces and backs.
// Per CONTRACT.md section 3: cardFaceSVG(card) / cardBackSVG() each return a
// standalone <svg viewBox="0 0 100 140" preserveAspectRatio="none"> string.
// Suit glyphs are authored once as <path> data and reused via <use>.
// Colour comes from the --suit-red / --suit-black custom properties so the
// SVG re-themes automatically with the rest of the page.

/** Suit glyph path data, authored in a 24x24 local grid, apex-oriented to
 *  match traditional card pips (diamond symmetric, heart apex-down,
 *  spade apex-up with a stem, club three lobes with a stem). */
const SUIT_PATHS = {
  D: "M12 1 L22 12 L12 23 L2 12 Z",
  H: "M12 21 C7 16.2 2 12.3 2 8.1 C2 4.5 4.7 2 8.1 2 C10.1 2 11.4 3 12 4.5 C12.6 3 13.9 2 15.9 2 C19.3 2 22 4.5 22 8.1 C22 12.3 17 16.2 12 21 Z",
  S: "M12 2 C12 2 4 10.2 4 15.1 C4 18 6.4 20.1 9.3 20.1 C10.6 20.1 11.6 19.6 12.1 18.8 C11.7 20.6 10.2 21.7 8 22.4 L16 22.4 C13.8 21.7 12.3 20.6 11.9 18.8 C12.4 19.6 13.4 20.1 14.7 20.1 C17.6 20.1 20 18 20 15.1 C20 10.2 12 2 12 2 Z",
  C: "M7.4,8.2 A4.6,4.6 0 1,1 16.6,8.2 A4.6,4.6 0 1,1 7.4,8.2 Z M2.9,13.4 A4.6,4.6 0 1,1 12.1,13.4 A4.6,4.6 0 1,1 2.9,13.4 Z M11.9,13.4 A4.6,4.6 0 1,1 21.1,13.4 A4.6,4.6 0 1,1 11.9,13.4 Z M10.3,15.2 L13.7,15.2 L15.2,22.2 L8.8,22.2 Z",
};

const SUIT_ORDER = ["S", "H", "D", "C"];

/** shared <defs> block: symbols for each suit, referenced by <use>. Every
 * standalone svg string carries its own copy so each stays self-contained. */
const SUIT_DEFS = `<defs>${SUIT_ORDER.map(
  (s) => `<symbol id="suit-${s}" viewBox="0 0 24 24"><path d="${SUIT_PATHS[s]}"/></symbol>`
).join("")}</defs>`;

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif';

function isRedSuit(suit) {
  return suit === "H" || suit === "D";
}

function colourVar(suit) {
  return isRedSuit(suit) ? "var(--suit-red)" : "var(--suit-black)";
}

function rankLabel(rank) {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

/** a suit glyph placed centred at (cx, cy), size w x h, optionally rotated
 *  180deg (used for pips that live in the lower half of the card). */
function pip(suit, cx, cy, w, h, rot180) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const use = `<use href="#suit-${suit}" x="${x}" y="${y}" width="${w}" height="${h}" fill="${colourVar(
    suit
  )}"/>`;
  return rot180 ? `<g transform="rotate(180 ${cx} ${cy})">${use}</g>` : use;
}

/** top-left corner index (rank + small suit pip), duplicated 180deg-rotated
 *  at the bottom-right corner. */
function cornerIndex(suit, rank) {
  const label = rankLabel(rank);
  const fill = colourVar(suit);
  const group = `
    <g font-family="${FONT_STACK}">
      <text x="7" y="17" font-size="15" font-weight="700" letter-spacing="-0.5"
        fill="${fill}" text-anchor="start">${label}</text>
      ${pip(suit, 12.5, 27, 10, 10, false)}
    </g>`;
  return `
    <g>${group}</g>
    <g transform="translate(100 140) rotate(180)">${group}</g>`;
}

/** traditional pip layouts for ranks 2-10, columns L/C/R, rows top->bottom.
 *  Every entry in the lower half (y > 70) is flagged for a 180deg rotation
 *  per CONTRACT's mirroring requirement. */
const COLS = { L: 30, C: 50, R: 70 };

const PIP_LAYOUTS = {
  2: [[COLS.C, 30], [COLS.C, 110]],
  3: [[COLS.C, 26], [COLS.C, 70], [COLS.C, 114]],
  4: [[COLS.L, 30], [COLS.R, 30], [COLS.L, 110], [COLS.R, 110]],
  5: [[COLS.L, 30], [COLS.R, 30], [COLS.C, 70], [COLS.L, 110], [COLS.R, 110]],
  6: [[COLS.L, 28], [COLS.R, 28], [COLS.L, 70], [COLS.R, 70], [COLS.L, 112], [COLS.R, 112]],
  7: [
    [COLS.L, 24], [COLS.R, 24], [COLS.C, 44],
    [COLS.L, 68], [COLS.R, 68],
    [COLS.L, 112], [COLS.R, 112],
  ],
  8: [
    [COLS.L, 22], [COLS.R, 22], [COLS.C, 40],
    [COLS.L, 62], [COLS.R, 62],
    [COLS.C, 84],
    [COLS.L, 106], [COLS.R, 106],
  ],
  9: [
    [COLS.L, 20], [COLS.R, 20],
    [COLS.L, 46], [COLS.R, 46],
    [COLS.C, 70],
    [COLS.L, 94], [COLS.R, 94],
    [COLS.L, 120], [COLS.R, 120],
  ],
  10: [
    [COLS.L, 18], [COLS.R, 18],
    [COLS.C, 34],
    [COLS.L, 50], [COLS.R, 50],
    [COLS.L, 90], [COLS.R, 90],
    [COLS.C, 106],
    [COLS.L, 122], [COLS.R, 122],
  ],
};

function numberCardPips(suit, rank) {
  const layout = PIP_LAYOUTS[rank];
  const size = rank <= 3 ? 20 : 16;
  return layout
    .map(([x, y]) => pip(suit, x, y, size, size, y > 70))
    .join("");
}

function aceGlyph(suit) {
  return pip(suit, 50, 70, 40, 40, false);
}

/** simple corner-flourish quarter-arcs for the court-card frame. */
function frameOrnament(fill) {
  return `
    <rect x="14" y="20" width="72" height="100" rx="8" fill="none"
      stroke="${fill}" stroke-width="1.4" opacity="0.55"/>
    <rect x="18" y="24" width="64" height="92" rx="6" fill="none"
      stroke="${fill}" stroke-width="0.8" opacity="0.35"/>
    <path d="M14 30 Q14 20 24 20" fill="none" stroke="${fill}" stroke-width="1.4" opacity="0.55"/>
    <path d="M86 30 Q86 20 76 20" fill="none" stroke="${fill}" stroke-width="1.4" opacity="0.55"/>
    <path d="M14 110 Q14 120 24 120" fill="none" stroke="${fill}" stroke-width="1.4" opacity="0.55"/>
    <path d="M86 110 Q86 120 76 120" fill="none" stroke="${fill}" stroke-width="1.4" opacity="0.55"/>`;
}

function crownMotif(fill) {
  return `
    <path d="M36 40 L40 26 L46 36 L50 24 L54 36 L60 26 L64 40 Z"
      fill="${fill}" opacity="0.85"/>
    <rect x="35" y="40" width="30" height="4" fill="${fill}" opacity="0.85"/>
    <circle cx="40" cy="26" r="1.6" fill="${fill}"/>
    <circle cx="50" cy="24" r="1.8" fill="${fill}"/>
    <circle cx="60" cy="26" r="1.6" fill="${fill}"/>`;
}

/** laurel-style sprig: a curved stem with leaves laid along it, mirrored
 *  left/right so it reads as a wreath flanking the monogram. */
function wreathMotif(fill) {
  const leaf = (side) => {
    const sign = side === "l" ? 1 : -1;
    const x0 = side === "l" ? 25 : 75;
    const x1 = 50 - sign * 3;
    let out = `<path d="M${x0} 58 Q${50 - sign * 6} 46 ${x1} 33"
      fill="none" stroke="${fill}" stroke-width="1.2" opacity="0.55"/>`;
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const lx = x0 + (x1 - x0) * t;
      const ly = 58 + (33 - 58) * t;
      const rot = side === "l" ? -50 + t * 30 : 50 - t * 30;
      out += `<ellipse cx="${lx}" cy="${ly}" rx="4" ry="2" fill="${fill}" opacity="0.55"
        transform="rotate(${rot} ${lx} ${ly})"/>`;
    }
    return out;
  };
  return leaf("l") + leaf("r");
}

function filigreeMotif(fill) {
  return `
    <path d="M28 40 C36 34 40 34 50 40 C60 34 64 34 72 40"
      fill="none" stroke="${fill}" stroke-width="1.6" opacity="0.6"/>
    <path d="M28 100 C36 106 40 106 50 100 C60 106 64 106 72 100"
      fill="none" stroke="${fill}" stroke-width="1.6" opacity="0.6"/>
    <circle cx="28" cy="40" r="2" fill="${fill}" opacity="0.7"/>
    <circle cx="72" cy="40" r="2" fill="${fill}" opacity="0.7"/>
    <circle cx="28" cy="100" r="2" fill="${fill}" opacity="0.7"/>
    <circle cx="72" cy="100" r="2" fill="${fill}" opacity="0.7"/>`;
}

/** court-card (J/Q/K) ornament: frame + suit watermark + monogram + motif. */
function courtCard(suit, rank) {
  const fill = colourVar(suit);
  const label = rankLabel(rank);
  const motif =
    rank === 13 ? crownMotif(fill) : rank === 12 ? wreathMotif(fill) : filigreeMotif(fill);
  return `
    <g>
      ${frameOrnament(fill)}
      <g opacity="0.16">${pip(suit, 50, 74, 56, 56, false)}</g>
      ${motif}
      <text x="50" y="86" font-family="${FONT_STACK}" font-size="34" font-weight="700"
        letter-spacing="-1" text-anchor="middle" fill="${fill}">${label}</text>
      <g transform="translate(100 140) rotate(180)">
        ${rank === 13 ? crownMotif(fill) : ""}
      </g>
    </g>`;
}

const faceCache = new Map();
const BACK_SVG_CACHE_KEY = "__back__";

export function cardFaceSVG(card) {
  const cached = faceCache.get(card.id);
  if (cached) return cached;

  const { suit, rank } = card;
  let body;
  if (rank === 1) {
    body = aceGlyph(suit);
  } else if (rank >= 2 && rank <= 10) {
    body = numberCardPips(suit, rank);
  } else {
    body = courtCard(suit, rank);
  }

  const svg =
    `<svg viewBox="0 0 100 140" preserveAspectRatio="none" width="100%" height="100%" ` +
    `xmlns="http://www.w3.org/2000/svg">${SUIT_DEFS}${body}${cornerIndex(suit, rank)}</svg>`;

  faceCache.set(card.id, svg);
  return svg;
}

export function cardBackSVG() {
  const cached = faceCache.get(BACK_SVG_CACHE_KEY);
  if (cached) return cached;

  // etched rosette built from the four suit glyphs, rendered in translucent
  // white so the frosted glass gradient painted by css/cards.css shows
  // through — this file only supplies the ornament, not the fill.
  const rosette = SUIT_ORDER.map((s, i) => {
    const angle = i * 90;
    return `<g transform="rotate(${angle} 50 70)" opacity="0.5">
      <use href="#suit-${s}" x="42" y="30" width="16" height="16" fill="#ffffff"/>
    </g>`;
  }).join("");

  const svg =
    `<svg viewBox="0 0 100 140" preserveAspectRatio="none" width="100%" height="100%" ` +
    `xmlns="http://www.w3.org/2000/svg">${SUIT_DEFS}` +
    `<rect x="10" y="12" width="80" height="116" rx="10" fill="none" stroke="#ffffff" stroke-width="1.4" opacity="0.4"/>` +
    `<rect x="15" y="17" width="70" height="106" rx="7" fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.28"/>` +
    `<circle cx="50" cy="70" r="22" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.35"/>` +
    `<circle cx="50" cy="70" r="3.2" fill="#ffffff" opacity="0.55"/>` +
    rosette +
    `</svg>`;

  faceCache.set(BACK_SVG_CACHE_KEY, svg);
  return svg;
}
