'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../web/static/js/games/go-engine.js');
const AI = require('../web/static/js/games/go-ai.js');
const create = require('../web/static/vendor/gnugo/gnugo.js');
const binary = fs.readFileSync(path.join(__dirname, '../web/static/vendor/gnugo/gnugo.wasm'));
(async () => {
  const engine = await create({ wasmBinary: binary });
  let count = 0;
  function legal(request) {
    const result = AI.choose(engine, request);
    assert.equal(result.engine, 'GNU Go 3.8');
    const board = E.replay(request.size, request.moves).board;
    for (let point = 0; point < board.length; point++) assert.equal(engine._hp_stone(point), board[point], 'WASM/JS board parity');
    assert(result.move === -1 || E.play(E.replay(request.size, request.moves), result.move).ok);
    assert(result.elapsed < AI.PROFILES[request.level].timeout);
    count++;
    return result;
  }
  for (const size of [9, 13, 19]) for (const level of ['easy', 'normal', 'hard']) {
    legal({ size, level, moves: [], seed: 17 });
    legal({ size, level, moves: [Math.floor(size * size / 2)], seed: 7 });
  }
  for (const moves of [[2, 1, 10, 9, 0], [9, 1, 10, 20, 2, 21, 0], [-1], [-1, -1], [1, 0]]) {
    for (const level of ['easy', 'normal', 'hard']) legal({ size: 9, level, moves, seed: 11 });
  }
  for (const [size, moves] of [
    [13, [42,48,120,126,43,49,107,113,55,61,94,100,67,69,81,83,80,84]],
    [19, [60,72,288,300,61,73,269,281,79,91,250,262,117,129,231,243,178,182,159,163]]
  ]) for (const level of ['easy', 'normal', 'hard']) legal({size, moves, level, seed: 17});
  assert.equal(engine._hp_init(20, 10, 1), 0);
  assert.equal(engine._hp_init(9, 11, 1), 0);
  assert.equal(engine._hp_init(9, 10, 1), 1);
  assert.equal(engine._hp_play(81, 1), 0);
  assert.equal(engine._hp_play(0, 3), 0);
  assert.equal(engine._hp_play(0, 1), 1);
  assert.equal(engine._hp_play(0, 2), 0);
  assert.throws(() => AI.choose(engine, { size: 9, moves: [0, 0], level: 'hard' }));
  // A shared instance must reset correctly on undo, size changes and replay.
  const request = { size: 13, moves: [84, 85, 71], level: 'easy', seed: 42 };
  const first = legal(request);
  legal({ size: 19, moves: [180], level: 'hard', seed: 15 });
  assert.equal(legal(request).move, first.move);
  // Unlike the retired greedy AI, GNU Go can leave already-dead stones
  // and take a larger point; do not mistake immediate captures for strength.
  legal({ size: 9, moves: [1, 0], level: 'hard', seed: 7 });
  console.log(`PASS ${count} real WASM searches: sizes, colors, passes, captures, ko, reset, determinism and input rejection`);
})().catch(error => { console.error(error); process.exitCode = 1; });
