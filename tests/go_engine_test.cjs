'use strict';
const assert = require('node:assert/strict');
const E = require('../web/static/js/games/go-engine.js');

let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }

test('supported sizes, coordinates and star points', () => {
  for (const size of [9, 13, 19]) {
    const state = E.replay(size, []);
    assert.equal(state.board.length, size * size);
    assert.equal(E.coord(size, 0), `A${size}`);
    assert.equal(E.coord(size, size - 1), `${E.LETTERS[size - 1]}${size}`);
    assert(E.starPoints(size).every(point => E.validPoint(size, point)));
  }
  assert.equal(E.coord(19, 8), 'J19');
});

test('capture a surrounded group and track prisoners', () => {
  const before = E.replay(9, [9, 1, 10, 20, 2, 21]);
  const result = E.play(before, 0);
  assert(result.ok);
  assert.deepEqual(result.captured, [1]);
  assert.equal(result.state.board[1], 0);
  assert.equal(result.state.captures[1], 1);
});

test('connected groups share liberties', () => {
  const state = E.replay(9, [0, 80, 1]);
  const group = E.groupAt(state, 0);
  assert.deepEqual(group.stones.sort((a, b) => a - b), [0, 1]);
  assert.deepEqual(group.liberties.sort((a, b) => a - b), [2, 9, 10]);
});

test('suicide is rejected without mutating state', () => {
  const state = E.replay(9, [0, 1, 2, 9, 18, 11, 20, 19]);
  const before = E.boardKey(state.board);
  assert.deepEqual(E.play(state, 10), { ok: false, reason: 'suicide' });
  assert.equal(E.boardKey(state.board), before);
});

test('positional superko rejects immediate recapture', () => {
  const state = E.replay(9, [2, 1, 10, 9, 0]);
  assert.deepEqual(E.play(state, 1), { ok: false, reason: 'superko' });
});

test('passes are legal and two consecutive passes are observable', () => {
  const state = E.replay(13, [-1, -1]);
  assert.equal(state.passes, 2);
  assert.equal(state.turn, 1);
  const continued = E.play(state, 84);
  assert(continued.ok);
  assert.equal(continued.state.passes, 0);
});

test('Chinese area score expands whole dead groups and applies komi', () => {
  const state = E.initial(9);
  [1, 9, 11, 19].forEach(point => { state.board[point] = 1; });
  state.board[10] = 2;
  const counted = E.score(state, [10], 7.5);
  assert.deepEqual(counted.dead, [10]);
  assert.equal(counted.black, 81);
  assert.equal(counted.white, 7.5);
  assert.equal(counted.winner, 1);
  assert.equal(counted.margin, 73.5);
});

test('mixed borders are neutral', () => {
  const state = E.initial(9);
  state.board[0] = 1;
  state.board[80] = 2;
  const counted = E.score(state, [], 7.5);
  assert.equal(counted.black, 1);
  assert.equal(counted.white, 8.5);
  assert.equal(counted.territory.neutral.length, 79);
});

test('replay rejects invalid size, duplicate and out-of-range moves', () => {
  assert.throws(() => E.replay(11, []));
  assert.throws(() => E.replay(9, [0, 0]));
  assert.throws(() => E.replay(9, [81]));
  assert.throws(() => E.replay(9, ['pass']));
});

console.log(`${count} total Go rule tests passed`);
