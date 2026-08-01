// Pure predicates for Klondike legality. No state mutation, no DOM.

import { isRed } from './deck.js';

/**
 * Can `card` be placed onto `ontoCard` in a tableau column?
 * Alternating colour, descending rank. ontoCard === null means the
 * destination column is empty, so only a King may be placed.
 * @param {Object} card
 * @param {Object|null} ontoCard
 * @returns {boolean}
 */
export function canStackTableau(card, ontoCard) {
  if (!card) return false;
  if (ontoCard == null) return card.rank === 13;
  if (isRed(card.suit) === isRed(ontoCard.suit)) return false;
  return card.rank === ontoCard.rank - 1;
}

/**
 * Can `card` be placed onto `ontoCard` in a foundation pile?
 * Same suit, ascending rank. ontoCard === null means the foundation is
 * empty, so only an Ace may be placed.
 * @param {Object} card
 * @param {Object|null} ontoCard
 * @returns {boolean}
 */
export function canStackFoundation(card, ontoCard) {
  if (!card) return false;
  if (ontoCard == null) return card.rank === 1;
  if (card.suit !== ontoCard.suit) return false;
  return card.rank === ontoCard.rank + 1;
}

/**
 * Is `cards` a valid movable run: all face-up, alternating colour,
 * strictly descending rank from bottom (index 0) to top (last index)?
 * @param {Array<Object>} cards
 * @returns {boolean}
 */
export function isValidRun(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return false;
  for (let i = 0; i < cards.length; i++) {
    if (!cards[i] || !cards[i].faceUp) return false;
  }
  for (let i = 1; i < cards.length; i++) {
    const prev = cards[i - 1];
    const cur = cards[i];
    if (isRed(prev.suit) === isRed(cur.suit)) return false;
    if (cur.rank !== prev.rank - 1) return false;
  }
  return true;
}
