# Glass Solitaire

Klondike Solitaire in the browser, dressed in an Apple **Liquid Glass** design system.
Gameplay is modelled on [solitaired.com](https://solitaired.com); the look is not.

**Zero build.** No npm, no bundler, no dependencies, no external assets or fonts — every card
is generated as inline SVG. Open `index.html` and it runs.

## Play

Drag a card, or tap once to pick it up and once on a destination to drop it. Double-click
sends a card to the best available pile. Click the stock to draw.

| Key | |
|---|---|
| <kbd>Space</kbd> | draw from stock |
| <kbd>U</kbd> | undo |
| <kbd>H</kbd> | hint |
| <kbd>A</kbd> | auto-complete |
| <kbd>N</kbd> | new deal |
| <kbd>R</kbd> | restart this deal |
| <kbd>Esc</kbd> | close dialog |

Draw 1 / draw 3, unlimited undo, timer, move count, standard Klondike scoring, lifetime
statistics, light/dark, and an interrupted game is resumed on reload — all stored locally in
`localStorage`. Nothing leaves the browser.

## Layout

```
index.html          board markup and toolbar
css/tokens.css      design tokens — the design system's source of truth
css/glass.css       glass primitives (surface, button, segmented control, sheet)
css/cards.css       card faces, backs, stacking, drag states
css/board.css       board layout and responsive rules
css/app.css         composition layer: sheet contents, toast, board tuning
js/engine/          pure game logic: deck, rules, state, scoring, hint, auto-complete
js/ui/              cardface (SVG), render, interact, anim, chrome
js/storage.js       settings, statistics, saved game
js/main.js          controller
tests/index.html    engine test suite (runs in the browser — there is no Node here)
styleguide.html     design system reference
```

The engine is pure: no DOM, no globals, `applyMove` never mutates its input. The UI never
constructs a move by hand — it describes an intent and looks for a match in
`legalMoves(state)`, so the rules cannot be bypassed from the interface. The interfaces
between modules are pinned in [CONTRACT.md](CONTRACT.md).

## Run locally

```bash
python3 -m http.server 8129
```

Then open <http://localhost:8129>. Run the engine tests at
<http://localhost:8129/tests/index.html> and the design system at
<http://localhost:8129/styleguide.html>.

## Deploy

Static hosting, no build command. `vercel.json` sets clean URLs and a strict CSP.
