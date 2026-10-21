import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Game, createCatalog, shuffled } from '../public/game.js';

const entries = JSON.parse(await readFile(new URL('../public/data/abbreviations.json', import.meta.url), 'utf8'));
const catalog = createCatalog(entries);
const config = { mode: 'classic', cardCount: 10, slot: 1, names: ['Аня', 'Саша'] };
const makeGame = (extra = {}) => new Game({ ...config, ...extra }, catalog.cards);

test('250 unique abbreviations make 50 cards, each with all five themes', () => {
  assert.equal(catalog.cards.length, 50);
  assert.equal(new Set(catalog.cards.flatMap(card => card.entries.map(entry => entry.id))).size, 250);
  for (const card of catalog.cards) {
    assert.equal(card.entries.length, 5);
    assert.equal(new Set(card.entries.map(entry => entry.category)).size, 5);
  }
  assert.throws(() => createCatalog(entries.slice(1)));
  assert.throws(() => createCatalog([...entries.slice(1), entries[1]]));
});

test('configuration keeps original limits and trims names', () => {
  const game = makeGame({ cardCount: 200, slot: 9, names: ['  Аня ', '', ...Array(10).fill('Саша')] });
  assert.equal(game.deck.length, 50);
  assert.equal(game.config.slot, 5);
  assert.equal(game.players.length, 8);
  assert.equal(game.players[0].name, 'Аня');
  assert.equal(game.players[1].name, 'Игрок 2');
  assert.equal(makeGame({ cardCount: 1, slot: 0 }).deck.length, 10);
});

test('shuffle never loses or duplicates a card and never mutates the original', () => {
  const original = [...catalog.cards];
  const result = shuffled(catalog.cards, () => 0.25);
  assert.deepEqual(catalog.cards, original);
  assert.deepEqual(result.map(c => c.id).sort((a,b) => a-b), original.map(c => c.id));
  assert.notDeepEqual(result, original);
});

test('answers cannot be judged before revealing or starting', () => {
  const game = makeGame();
  assert.equal(game.answer(true), false);
  assert.equal(game.reveal(), false);
  game.begin();
  assert.equal(game.answer(true), false);
  assert.equal(game.players[0].score, 0);
  assert.equal(game.deck.length, 10);
});

test('correct answer awards one card and hands off to next player', () => {
  const game = makeGame();
  const first = game.deck[0];
  game.begin(); game.reveal(); game.answer(true);
  assert.equal(game.players[0].score, 1);
  assert.equal(game.deck.length, 9);
  assert.deepEqual(game.awarded, [first]);
  assert.equal(game.current, 1);
  assert.equal(game.phase, 'handoff');
  assert.equal(game.revealed, false);
  assert.equal(game.answer(true), false);
});

test('wrong answer goes to the bottom, stays in play, and earns no score', () => {
  const game = makeGame();
  const original = [...game.deck];
  game.begin(); game.reveal(); game.answer(false);
  assert.deepEqual(game.deck, [...original.slice(1), original[0]]);
  assert.equal(game.players[0].score, 0);
  assert.equal(game.phase, 'handoff');
});

test('classic game finishes only after every card has been won, and allows a tie', () => {
  const game = makeGame();
  for (let i = 0; i < 10; i++) { game.begin(); game.reveal(); game.answer(true); }
  assert.equal(game.phase, 'finished');
  assert.equal(game.deck.length, 0);
  assert.equal(game.players[0].score, 5);
  assert.equal(game.players[1].score, 5);
  assert.equal(game.winners.length, 2);
  assert.equal(game.begin(), false);
  assert.equal(game.reveal(), false);
});

test('selected number maps to one of the five entries throughout a party', () => {
  for (let slot = 1; slot <= 5; slot++) {
    const game = makeGame({ slot });
    assert.equal(game.entry, catalog.cards[0].entries[slot - 1]);
    game.begin(); game.reveal(); game.answer(true); game.begin();
    assert.equal(game.entry, catalog.cards[1].entries[slot - 1]);
  }
});

test('random mode requires a roll and uses exactly the rolled numbered entry', () => {
  for (let value = 1; value <= 5; value++) {
    const game = makeGame({ mode: 'random' });
    game.begin(); assert.equal(game.entry, null);
    assert.equal(game.reveal(), false);
    assert.equal(game.roll(value), true);
    assert.equal(game.entry, catalog.cards[0].entries[value - 1]);
    assert.equal(game.roll(2), false);
    game.reveal(); game.answer(true);
    assert.equal(game.die, null);
    assert.equal(game.current, 1);
  }
});

test('a six skips the turn without discarding or rotating the card', () => {
  const game = makeGame({ mode: 'random' });
  const deck = [...game.deck];
  game.begin(); game.roll(6);
  assert.equal(game.entry, null);
  assert.equal(game.reveal(), false);
  assert.equal(game.skipDie(), true);
  assert.deepEqual(game.deck, deck);
  assert.equal(game.players[0].score, 0);
  assert.equal(game.current, 1);
  assert.equal(game.phase, 'handoff');
});

test('invalid rolls cannot change any mode', () => {
  const game = makeGame({ mode: 'random' }); game.begin();
  for (const value of [0, -1, 7, 2.5, NaN, '3']) assert.equal(game.roll(value), false);
  assert.equal(game.die, null);
  const classic = makeGame(); classic.begin(); assert.equal(classic.roll(1), false);
});

test('first-answer mode credits the selected winner, stays ready and cannot assign an unknown winner', () => {
  const game = makeGame({ mode: 'first' }); game.begin(); game.reveal();
  assert.equal(game.answer(true, 77), false);
  assert.equal(game.answer(true), false);
  assert.equal(game.deck.length, 10);
  assert.equal(game.answer(true, 1), true);
  assert.equal(game.players[1].score, 1);
  assert.equal(game.players[0].score, 0);
  assert.equal(game.phase, 'playing');
  game.reveal(); game.answer(false);
  assert.equal(game.deck.length, 9);
  assert.equal(game.phase, 'playing');
});

test('timed round is exactly 60 seconds, with skips and consecutive answers', () => {
  const game = makeGame({ mode: 'timed' }); game.begin(1000);
  assert.equal(game.timeLeft(1000), 60000);
  const first = game.deck[0];
  game.skip(2000); assert.equal(game.deck.at(-1), first);
  game.reveal(3000); game.answer(true, null, 4000);
  assert.equal(game.phase, 'playing');
  assert.equal(game.current, 0);
  assert.equal(game.deadline, 61000);
  assert.equal(game.tick(60999), false);
  assert.equal(game.tick(61000), true);
  assert.equal(game.phase, 'handoff');
  assert.equal(game.current, 1);
  assert.equal(game.completedTurns, 1);
});

test('no answer or skip is credited after the timed deadline, even if timer callback is late', () => {
  const game = makeGame({ mode: 'timed' }); game.begin(1000); game.reveal(2000);
  assert.equal(game.answer(true, null, 61001), false);
  assert.equal(game.players[0].score, 0);
  assert.equal(game.phase, 'handoff');
  game.begin(62000);
  assert.equal(game.skip(122000), false);
  assert.equal(game.phase, 'handoff');
});

test('timed mode continues minute-long turns around the table until the deck is won', () => {
  const game = makeGame({ mode: 'timed' });
  game.begin(0); game.tick(60000); game.begin(100000); game.tick(160000);
  assert.equal(game.phase, 'handoff');
  assert.equal(game.current, 0);
  assert.equal(game.completedTurns, 2);
  assert.equal(game.deck.length, 10);
  for (let i = 0; i < 6; i++) { game.begin(200000 + i * 60000); game.tick(260000 + i * 60000); }
  assert.equal(game.completedTurns, 8);
  assert.ok(Game.restore(game.snapshot(), catalog.cards));
});

test('timed mode can finish early when the shared deck runs out', () => {
  const game = makeGame({ mode: 'timed' }); game.begin(0);
  for (let i=0;i<10;i++) { game.reveal(i * 100); game.answer(true, null, i * 100); }
  assert.equal(game.phase, 'finished');
  assert.equal(game.players[0].score, 10);
});

test('pausing preserves exact remaining time and prevents actions', () => {
  const game = makeGame({ mode: 'timed' }); game.begin(1000); game.pause(11000);
  assert.equal(game.timeLeft(500000), 50000);
  assert.equal(game.reveal(500000), false);
  assert.equal(game.tick(500000), false);
  game.resume(600000);
  assert.equal(game.deadline, 650000);
  game.tick(649999); assert.equal(game.phase, 'playing');
  game.tick(650000); assert.equal(game.phase, 'handoff');
});

test('all modes survive save/restore, including face-up and rolled cards', () => {
  for (const mode of Object.keys({ classic:1, timed:1, first:1, random:1 })) {
    const game = makeGame({ mode }); game.begin(0);
    if (mode === 'random') game.roll(3, 1000);
    game.reveal(2000); game.pause(3000);
    const restored = Game.restore(JSON.parse(JSON.stringify(game.snapshot())), catalog.cards, 90000);
    assert.ok(restored);
    assert.equal(restored.phase, 'paused');
    assert.equal(restored.entry.id, game.entry.id);
    assert.equal(restored.revealed, true);
    assert.deepEqual(restored.snapshot(), game.snapshot());
  }
});

test('active game restores paused instead of silently continuing', () => {
  const game = makeGame({ mode: 'timed' }); game.begin(1000);
  const restored = Game.restore(game.snapshot(), catalog.cards, 11000);
  assert.equal(restored.phase, 'paused');
  assert.equal(restored.remaining, 50000);
});

test('corrupted snapshots are rejected instead of breaking the app', () => {
  const game = makeGame();
  const change = fn => { const state = game.snapshot(); fn(state); assert.equal(Game.restore(state, catalog.cards), null); };
  assert.equal(Game.restore(null, catalog.cards), null);
  change(s => s.version = 999);
  change(s => s.deck[0] = 999);
  change(s => s.deck[0] = s.deck[1]);
  change(s => s.current = -1);
  change(s => s.players[0].score = 100);
  change(s => s.players[0].name = '<script>');
  change(s => s.remaining = -1);
  change(s => s.phase = 'unknown');
  change(s => s.die = 6);
});

test('one-player games work in classic, timed and random mode', () => {
  for (const mode of ['classic','timed','random']) {
    const game = makeGame({ mode, names: ['Я'] }); game.begin(0);
    if (mode === 'random') game.roll(1, 1000);
    game.reveal(2000); game.answer(true, null, 3000);
    assert.equal(game.players[0].score, 1);
    assert.equal(game.current, 0);
  }
});
