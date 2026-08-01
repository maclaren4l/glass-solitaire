// Pure deck utilities. No DOM, no browser APIs.

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

/**
 * mulberry32 PRNG. Deterministic: same seed -> same sequence.
 * @param {number} seed
 * @returns {() => number} function returning a float in [0, 1)
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {string} suit
 * @returns {boolean} true if suit is red (H or D)
 */
export function isRed(suit) {
  return suit === 'H' || suit === 'D';
}

/**
 * Creates a shuffled 52-card deck, all face down, using a Fisher-Yates
 * shuffle driven by a seeded PRNG so the same seed always produces the
 * same order.
 * @param {number} seed
 * @returns {Array<Object>} Card[]
 */
export function createDeck(seed) {
  const rng = makeRng(seed);
  /** @type {Array<{id:string, rank:number, suit:string, faceUp:boolean}>} */
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}${rank}`, rank, suit, faceUp: false });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}
