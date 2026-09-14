/* Lightweight offline Go opponent: tactical ranking plus bounded reply search. */
(function (root) {
  'use strict';
  var E = root.GoEngine;
  if (!E && typeof require === 'function') E = require('./go-engine.js');

  var BUDGETS = { easy: 200, normal: 800, hard: 2200 };
  function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
  function seeded(seed) {
    var a = (Number(seed) || 1) >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function uniqueAdjacentGroups(state, point, color) {
    var seen = new Set(), groups = [];
    E.neighbors(state.size, point).forEach(function (next) {
      if (state.board[next] !== color || seen.has(next)) return;
      var group = E.groupAt(state, next); groups.push(group);
      group.stones.forEach(function (stone) { seen.add(stone); });
    });
    return groups;
  }
  function emptyRegionOwner(state, point) {
    if (state.board[point]) return 0;
    var seen = new Set([point]), stack = [point], borders = new Set();
    while (stack.length) {
      var here = stack.pop();
      E.neighbors(state.size, here).forEach(function (next) {
        if (state.board[next]) borders.add(state.board[next]);
        else if (!seen.has(next)) { seen.add(next); stack.push(next); }
      });
    }
    return borders.size === 1 ? Array.from(borders)[0] : 0;
  }
  function localPressure(state, point, color) {
    var x = point % state.size, y = Math.floor(point / state.size), score = 0;
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      var xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= state.size || yy < 0 || yy >= state.size) continue;
      var value = state.board[yy * state.size + xx], distance = Math.abs(dx) + Math.abs(dy);
      if (value === color) score += distance <= 2 ? 24 : 8;
      else if (value) score += distance <= 2 ? 31 : 10;
    }
    return score;
  }
  function shapeValue(state, point) {
    var color = state.turn, enemy = 3 - color;
    var ownBefore = uniqueAdjacentGroups(state, point, color), enemyBefore = uniqueAdjacentGroups(state, point, enemy);
    var result = E.play(state, point);
    if (!result.ok) return null;
    var next = result.state, own = E.groupAt(next, point), value = result.captured.length * 5200;
    ownBefore.forEach(function (group) {
      if (group.liberties.length === 1 && group.liberties[0] === point) value += 1500 + group.stones.length * 85;
    });
    enemyBefore.forEach(function (group) {
      if (group.liberties.length === 2 && group.liberties.includes(point)) value += 520 + group.stones.length * 35;
    });
    if (own.liberties.length === 1 && !result.captured.length) value -= 4200 + own.stones.length * 80;
    value += Math.max(0, own.liberties.length - 1) * 38;
    value += Math.max(0, ownBefore.length - 1) * 170;
    value += localPressure(state, point, color);
    var edge = Math.min(point % state.size, Math.floor(point / state.size), state.size - 1 - point % state.size, state.size - 1 - Math.floor(point / state.size));
    var progress = state.moves.filter(function (move) { return move >= 0; }).length / (state.size * state.size);
    if (progress < .18) {
      var ideal = state.size === 9 ? 2 : 3;
      value += Math.max(0, 150 - Math.abs(edge - ideal) * 45);
    } else if (edge === 0) value -= 55;
    if (emptyRegionOwner(state, point) === color && !result.captured.length) value -= 2600;
    return { move: point, value: value, state: next, captured: result.captured.length, liberties: own.liberties.length };
  }
  function candidatePoints(state) {
    var occupied = 0;
    for (var i = 0; i < state.board.length; i++) if (state.board[i]) occupied++;
    if (!occupied) return E.starPoints(state.size);
    var result = [];
    for (var point = 0; point < state.board.length; point++) if (!state.board[point]) result.push(point);
    return result;
  }
  function rank(state, deadline) {
    var ranked = [], points = candidatePoints(state);
    for (var n = 0; n < points.length; n++) {
      if (deadline && now() >= deadline) break;
      var value = shapeValue(state, points[n]);
      if (value) ranked.push(value);
    }
    ranked.sort(function (a, b) { return b.value - a.value || a.move - b.move; });
    return ranked;
  }
  function replyPenalty(state, deadline, width) {
    var replies = rank(state, deadline).slice(0, width), best = 0;
    for (var i = 0; i < replies.length && now() < deadline; i++) best = Math.max(best, replies[i].value);
    return best;
  }
  function shouldPass(state, best) {
    if (!best) return true;
    var stones = 0;
    for (var i = 0; i < state.board.length; i++) if (state.board[i]) stones++;
    if (stones < state.size * state.size * .28) return false;
    if (state.passes > 0 && best.value < 80) return true;
    return stones > state.size * state.size * .72 && best.value < -120;
  }
  function choose(request) {
    request = request || {};
    var state = E.replay(Number(request.size), request.moves || []), level = BUDGETS[request.level] ? request.level : 'normal';
    var started = now(), budget = Number.isFinite(request.budget) ? Math.max(1, request.budget) : BUDGETS[level];
    var deadline = started + budget, random = request.random || seeded(request.seed === undefined ? Date.now() : request.seed);
    var ranked = rank(state, deadline);
    if (!ranked.length) return { move: -1, elapsed: now() - started, nodes: 0 };
    var best = ranked[0], nodes = ranked.length;
    if (level === 'easy') {
      var easyPool = ranked.slice(0, Math.min(5, ranked.length));
      best = easyPool[Math.floor(random() * easyPool.length)];
    } else {
      var width = level === 'hard' ? 18 : 8, roots = ranked.slice(0, width), scored = [];
      for (var i = 0; i < roots.length && now() < deadline; i++) {
        var penalty = replyPenalty(roots[i].state, deadline, level === 'hard' ? 10 : 4);
        nodes++;
        scored.push({ candidate: roots[i], value: roots[i].value - penalty * (level === 'hard' ? .72 : .56) });
      }
      scored.sort(function (a, b) { return b.value - a.value || a.candidate.move - b.candidate.move; });
      if (scored.length) best = scored[0].candidate;
      if (level === 'normal' && scored.length > 1 && scored[1].value >= scored[0].value * .94 && random() < .2) best = scored[1].candidate;
    }
    return { move: shouldPass(state, best) ? -1 : best.move, elapsed: now() - started, nodes: nodes };
  }
  function fallback(request, callback) {
    request = request || {};
    var state = E.replay(Number(request.size), request.moves || []), points = candidatePoints(state);
    var ranked = [], offset = 0, cancelled = false;
    function chunk() {
      if (cancelled) return;
      var started = now();
      while (offset < points.length && now() - started < 12) {
        var item = shapeValue(state, points[offset++]);
        if (item) ranked.push(item);
      }
      if (offset < points.length) setTimeout(chunk, 0);
      else {
        ranked.sort(function (a, b) { return b.value - a.value || a.move - b.move; });
        callback(shouldPass(state, ranked[0]) ? -1 : ranked[0].move);
      }
    }
    setTimeout(chunk, 0);
    return function () { cancelled = true; };
  }

  var api = { BUDGETS: BUDGETS, choose: choose, fallback: fallback, rank: rank, shapeValue: shapeValue };
  root.GoAI = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
