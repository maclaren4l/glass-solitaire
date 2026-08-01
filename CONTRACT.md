# Build contract — Glass Solitaire

This file is the single source of truth for the interfaces between modules. Every module is
written independently against these signatures. **Do not change anything in this file.**

Zero-build static site. Vanilla ES modules (`<script type="module">`), no bundler, no npm,
no dependencies, no external assets or fonts. There is no Node on this machine — nothing may
require a build or a test runner.

---

## 1. Data model

```js
/** Suit is one of 'S' | 'H' | 'D' | 'C'. Red suits are 'H' and 'D'. */

/** @typedef {Object} Card
 *  @property {string}  id      Stable unique id, `${suit}${rank}` e.g. "S1", "H13".
 *  @property {number}  rank    1..13 (1 = Ace, 11 = Jack, 12 = Queen, 13 = King)
 *  @property {string}  suit    'S' | 'H' | 'D' | 'C'
 *  @property {boolean} faceUp
 */

/** @typedef {Object} State
 *  @property {Card[]}   stock        Face-down draw pile. Last element is the top.
 *  @property {Card[]}   waste        Face-up. Last element is the top / playable card.
 *  @property {{S:Card[],H:Card[],D:Card[],C:Card[]}} foundations  Ascending A..K per suit.
 *  @property {Card[][]} tableau      Exactly 7 columns. Last element of a column is on top.
 *  @property {1|3}      drawCount    Cards flipped per stock draw.
 *  @property {number}   moves        Player move count (a 'flip' does not increment it).
 *  @property {number}   score        Klondike score; may go negative.
 *  @property {number}   elapsedMs    Owned by the UI, persisted in state.
 *  @property {Move[]}   history      Applied moves, oldest first. Used by undo().
 *  @property {number}   passes       Completed stock recycles.
 *  @property {boolean}  won
 *  @property {number}   seed         The seed this deal came from.
 */

/** @typedef {Object} Move
 *  @property {string} type   'draw'|'recycle'|'t2t'|'t2f'|'w2t'|'w2f'|'f2t'|'flip'
 *  @property {*}      from   see table below
 *  @property {*}      to     see table below
 *  @property {number} count  number of cards moved (1 unless a tableau run or a draw)
 *  @property {Card[]} cards  the cards moved, in bottom-to-top order
 *  @property {number} [scoreDelta]  filled in by applyMove
 *  @property {boolean} [flipped]    true if this move exposed a face-down tableau card,
 *                                   which undo() must therefore re-hide
 */
```

`from` / `to` encoding by move type:

| type      | from                      | to                        | meaning |
|-----------|---------------------------|---------------------------|---------|
| `draw`    | `'stock'`                 | `'waste'`                 | flip `drawCount` (or fewer) cards stock → waste |
| `recycle` | `'waste'`                 | `'stock'`                 | waste is empty-stock refill, face down, order reversed |
| `t2t`     | `{pile:'tableau', index}` | `{pile:'tableau', index}` | move a run of `count` cards |
| `t2f`     | `{pile:'tableau', index}` | `{pile:'foundation', suit}`| |
| `w2t`     | `'waste'`                 | `{pile:'tableau', index}` | |
| `w2f`     | `'waste'`                 | `{pile:'foundation', suit}`| |
| `f2t`     | `{pile:'foundation', suit}`| `{pile:'tableau', index}`| |
| `flip`    | `{pile:'tableau', index}` | `{pile:'tableau', index}` | auto-turn the newly exposed card; never produced by `legalMoves()`, only folded into other moves via `move.flipped` |

---

## 2. Engine API — owned by `js/engine/*`

`js/engine/deck.js`
```js
export function makeRng(seed)                  // -> () => float in [0,1); deterministic
export function createDeck(seed)               // -> Card[] (52, shuffled, all faceUp:false)
export function isRed(suit)                    // -> boolean
export const SUITS   // ['S','H','D','C']
export const RANKS   // [1..13]
```

`js/engine/rules.js` — pure predicates, no state mutation.
```js
export function canStackTableau(card, ontoCard)     // alternating colour, descending; ontoCard null => card must be a King
export function canStackFoundation(card, ontoCard)  // same suit, ascending; ontoCard null => card must be an Ace
export function isValidRun(cards)                   // face-up, alternating colour, descending
```

`js/engine/game.js`
```js
export function newGame({ seed, drawCount })   // -> State, fully dealt (28 to tableau, tops face up)
export function legalMoves(state)              // -> Move[]; never includes 'flip'
export function applyMove(state, move)         // -> new State. Never mutates the input.
                                               //    Auto-flips a newly exposed tableau card and
                                               //    sets move.flipped on the recorded history entry.
                                               //    Returns the SAME state object if the move is illegal.
export function undo(state)                    // -> new State one move earlier; no-op if history empty
export function findHint(state)                // -> Move | null. Prefers a genuinely useful move:
                                               //    never suggests a move that just undoes the last one,
                                               //    and never a pointless foundation->tableau.
export function autoCompleteMoves(state)       // -> Move[] moving everything possible to foundations,
                                               //    in application order. [] if none.
export function canAutoComplete(state)         // -> boolean; true when no face-down tableau cards remain
                                               //    and the stock/waste can be fully played out
export function isWon(state)                   // -> all four foundations have 13 cards
export function serialize(state)               // -> plain JSON-safe object
export function deserialize(obj)               // -> State
```

**Scoring**, applied inside `applyMove`: `w2t` +5 · `t2f` +10 · `w2f` +10 · exposing a
face-down tableau card +5 · `f2t` −15 · `recycle` −100 when `drawCount === 1`, 0 when 3.
Score is clamped at a minimum of 0. `undo` exactly reverses the score delta.

---

## 3. Card rendering — owned by `js/ui/cardface.js`

```js
export function cardFaceSVG(card)  // -> SVG markup string for the face of `card`
export function cardBackSVG()      // -> SVG markup string for the card back
```

Both return a standalone `<svg>` string with `viewBox="0 0 100 140"`,
`preserveAspectRatio="none"`, width/height 100%. No external references, no `<image>`, no
fonts — all glyphs must be paths or plain `<text>` using the CSS font stack. Colour comes
from the `--suit-red` / `--suit-black` tokens so it can be themed.

---

## 4. DOM contract — `js/ui/render.js` produces this; `css/*` styles it

```html
<div class="app">
  <header class="toolbar">…</header>
  <main class="board">
    <div class="board__top">
      <div class="pile pile--stock"      data-pile="stock"></div>
      <div class="pile pile--waste"      data-pile="waste"></div>
      <div class="board__gap"></div>
      <div class="pile pile--foundation" data-pile="foundation" data-suit="S"></div>
      <!-- …H, D, C -->
    </div>
    <div class="board__tableau">
      <div class="pile pile--tableau" data-pile="tableau" data-index="0"></div>
      <!-- …1..6 -->
    </div>
  </main>
  <div class="drag-layer"></div>
</div>
```

A card element:
```html
<div class="card" data-card-id="S1" data-suit="S" data-rank="1" data-face="up"
     style="--y: 0px" >
  <div class="card__inner">
    <div class="card__front"><!-- cardFaceSVG --></div>
    <div class="card__back"><!-- cardBackSVG --></div>
  </div>
</div>
```

Rules the CSS must honour:
- `.pile` is `position: relative`, sized `var(--card-w)` × `var(--card-h)`, and shows an
  empty "well" via `::before` when it has no `.card` children.
- `.card` is `position: absolute; left: 0; top: var(--y, 0px);` — **JS owns `--y`**, CSS must
  not set `top` on `.card`.
- `data-face="down"` shows `.card__back`; `data-face="up"` shows `.card__front`.
- State classes JS toggles, which CSS must style: `.is-dragging`, `.is-drop-target`
  (on `.pile`), `.is-hint`, `.is-invalid` (shake), `.is-selected`.
- The `.drag-layer` is a fixed, `pointer-events: none`, top-most layer; JS moves cards into
  it during a drag and positions them with `transform: translate3d(x, y, 0)`.

Design tokens that other modules rely on existing in `css/tokens.css`:
`--card-w`, `--card-h`, `--stack-gap-up`, `--stack-gap-down`, `--suit-red`, `--suit-black`.

---

## 5. Conventions

- ES modules with explicit `.js` extensions in every import path (no bundler to resolve them).
- No `innerHTML` from user data; SVG strings from `cardface.js` are the only markup injection.
- Every animation must be skipped when `matchMedia('(prefers-reduced-motion: reduce)')` matches.
- Comments only where the reasoning isn't obvious from the code.
