/* Deterministic small-board calibration, not a rank/Elo certification.
 * Run: nice -n 15 node tests/go_ai_match.cjs [rounds=2]
 * Alternates colors. Stops at two passes; uses a fixed level-10 GNU Go adjudicator
 * to mark dead groups before Chinese area scoring. This is not independent
 * human adjudication; all SGF-style move records are retained for review.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const E = require('../web/static/js/games/go-engine.js');
const AI = require('../web/static/js/games/go-ai.js');
const create = require('../web/static/vendor/gnugo/gnugo.js');
(async () => {
  const engine = await create({ wasmBinary: fs.readFileSync(path.join(__dirname, '../web/static/vendor/gnugo/gnugo.wasm')) });
  const rounds = Number(process.argv[2] || 2), results = [];
  for (const pair of [['normal', 'easy'], ['hard', 'normal'], ['hard', 'easy']]) {
    for (let game = 0; game < rounds; game++) {
      const colors = game % 2 ? [pair[1], pair[0]] : pair;
      let state = E.initial(9), maxMs = 0;
      while (state.passes < 2 && state.moves.length < 240) {
        const level = colors[state.turn - 1];
        const answer = AI.choose(engine, { size: 9, moves: state.moves, level, seed: 1009 + game * 7919 + state.moves.length * 31 });
        maxMs = Math.max(maxMs, answer.elapsed);
        const played = answer.move === -1 ? {ok: true, state: E.pass(state)} : E.play(state, answer.move);
        assert(played.ok, `${level}: illegal move`);
        state = played.state;
      }
      AI.choose(engine, { size: 9, moves: state.moves, level: 'hard', seed: 999 });
      const dead = [...state.board.keys()].filter(point => engine._hp_dead(point));
      const score = E.score(state, dead, 7.5);
      const result = { colors, game, moves: state.moves.length, finished: state.passes === 2,
        winner: colors[score.winner - 1], margin: score.margin, maxMs: Math.round(maxMs), dead, record: state.moves };
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
  fs.writeFileSync('/tmp/go-ai-matches.json', JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
