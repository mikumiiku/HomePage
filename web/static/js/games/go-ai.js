/* GNU Go 3.8 difficulty adapter. GPL-3.0-or-later; see vendor/gnugo/COPYING.
 * This file does not run search on the page. The Worker owns the WASM engine.
 */
(function (root) {
  'use strict';
  var E = root.GoEngine;
  if (!E && typeof require === 'function') E = require('./go-engine.js');
  var PROFILES = Object.freeze({
    easy: Object.freeze({ strength: 0, variety: .85, width: 12, loss: 12, timeout: 20000 }),
    normal: Object.freeze({ strength: 3, variety: .55, width: 5, loss: 5, timeout: 30000 }),
    hard: Object.freeze({ strength: 10, variety: 0, width: 1, loss: 0, timeout: 45000 })
  });
  function seeded(seed) {
    var a = (Number(seed) || 1) >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function choose(engine, request) {
    var profile = PROFILES[request.level];
    if (!profile) throw new Error('未知难度');
    var state = E.replay(request.size, request.moves), started = performance.now();
    if (!engine._hp_init(request.size, profile.strength, request.seed >>> 0)) throw new Error('引擎初始化失败');
    request.moves.forEach(function (move, index) {
      if (!engine._hp_play(move, index % 2 + 1)) throw new Error('引擎无法重放棋谱');
    });
    var best = engine._hp_generate(state.turn);
    if (!Number.isInteger(best) || best < -1 || best >= state.board.length) throw new Error('引擎落点无效');
    if (best === -1) return { move: -1, elapsed: performance.now() - started, engine: 'GNU Go 3.8' };
    var candidates = [];
    for (var point = 0; point < state.board.length; point++) {
      if (state.board[point]) continue;
      var value = engine._hp_value(point);
      if ((value > 0 || point === best) && E.play(state, point).ok) candidates.push({ move: point, value: value });
    }
    candidates.sort(function (a, b) { return b.value - a.value || a.move - b.move; });
    // JS remains the rule authority, including full positional superko history.
    if (!E.play(state, best).ok) {
      if (!candidates.length) throw new Error('引擎未提供合法落点');
      best = candidates[0].move;
    }
    var random = seeded(request.seed), chosen = best, bestValue = engine._hp_value(best);
    if (profile.variety && random() < profile.variety) {
      var alternatives = candidates.filter(function (item) {
        return item.move !== best && item.value >= bestValue - profile.loss;
      }).slice(0, profile.width);
      if (alternatives.length) chosen = alternatives[Math.floor(random() * alternatives.length)].move;
    }
    return { move: chosen, elapsed: performance.now() - started, engine: 'GNU Go 3.8', strength: profile.strength };
  }
  var api = { PROFILES: PROFILES, LOAD_TIMEOUT: 60000, choose: choose };
  root.GoAI = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
