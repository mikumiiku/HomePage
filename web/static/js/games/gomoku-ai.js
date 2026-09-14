/* Bounded iterative deepening. No UI, network or persistence dependencies. */
(function (root) {
  'use strict';
  var E = root.GomokuEngine;
  if (!E && typeof require === 'function') E = require('./gomoku-engine.js');
  var WIN = 10000000;
  function candidates(board) {
    var points = new Set(), used = false;
    for (var i = 0; i < 225; i++) if (board[i]) {
      used = true;
      var x = i % 15, y = Math.floor(i / 15);
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        var xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < 15 && yy >= 0 && yy < 15 && !board[yy * 15 + xx]) points.add(yy * 15 + xx);
      }
    }
    return used ? Array.from(points) : [112];
  }
  // Scores five-cell windows and open lines through a hypothetical stone.
  // Broken threes/fours are included, not just contiguous runs.
  function shape(board, i, color) {
    var old = board[i], x = i % 15, y = Math.floor(i / 15), score = 0;
    board[i] = color;
    for (var d of E.dirs) {
      var s = '';
      for (var k = -5; k <= 5; k++) {
        var xx = x + k * d[0], yy = y + k * d[1];
        s += xx < 0 || xx >= 15 || yy < 0 || yy >= 15 ? '2' : board[yy * 15 + xx] === color ? '1' : board[yy * 15 + xx] ? '2' : '0';
      }
      if (s.includes('11111')) { score += WIN; continue; }
      if (s.includes('011110')) score += 250000;
      if (/01110|010110|011010/.test(s)) score += 16000;
      if (/001100|0010100/.test(s)) score += 800;
      for (var start = 1; start <= 5; start++) {
        var segment = s.slice(start, start + 5);
        if (segment.includes('2')) continue;
        var count = segment.split('1').length - 1;
        score += [0, 2, 25, 350, 18000, WIN][count];
      }
    }
    board[i] = old;
    return score;
  }
  function rank(board, color) {
    return candidates(board).map(function (i) {
      var attack = shape(board, i, color), defend = shape(board, i, 3 - color);
      return { i: i, attack: attack, defend: defend, score: attack + defend * 1.08 };
    }).sort(function (a, b) { return b.score - a.score || a.i - b.i; });
  }
  function choose(moves, level, options) {
    options = options || {};
    var st = E.replay(moves);
    if (st.result !== null) return { move: null, depth: 0 };
    if (!moves.length) return { move: 112, depth: 0 };
    var board = st.board, color = st.turn, started = performance.now();
    var budget = options.budget === undefined ? ({ easy: 150, normal: 600, hard: 2000 }[level] || 600) : options.budget;
    var deadline = started + budget, nodes = 0, depthDone = 0, timeout = {};
    function check() { if (performance.now() >= deadline) throw timeout; }
    var ordered = rank(board, color);
    var wins = ordered.filter(function (p) { return p.attack >= WIN; });
    var blocks = ordered.filter(function (p) { return p.defend >= WIN; });
    if (wins.length || blocks.length) return { move: (wins[0] || blocks[0]).i, depth: 0, tactical: true };
    if (!ordered.length) return { move: null, depth: 0 };
    var best = ordered[0].i, width = level === 'hard' ? 12 : level === 'easy' ? 5 : 8;
    if (level === 'easy') {
      var near = ordered.filter(function (p) { return p.score >= ordered[0].score * .9; }).slice(0, 3);
      best = near[Math.floor((options.random || Math.random)() * near.length)].i;
    }
    function search(turn, depth, alpha, beta, last, ply) {
      check(); nodes++;
      if (last !== null && E.line(board, last).length) return -WIN + ply;
      var choices = rank(board, turn);
      check();
      if (!choices.length) return 0;
      if (choices.some(function (p) { return p.attack >= WIN; })) return WIN - ply - 1;
      var threats = choices.filter(function (p) { return p.defend >= WIN; });
      if (threats.length > 1) return -WIN + ply + 2;
      // Resolve forced replies before static evaluation. Heuristics must never
      // outrank a proven win, even when a blocked threat has a large score.
      if (depth <= 0 && !threats.length) {
        var own = Math.max.apply(null, choices.map(function (p) { return p.attack; }));
        var opp = Math.max.apply(null, choices.map(function (p) { return p.defend; }));
        return Math.max(-WIN / 4, Math.min(WIN / 4, own - opp * 1.12));
      }
      choices = threats.length ? threats : choices.slice(0, width);
      var value = -Infinity;
      for (var p of choices) {
        board[p.i] = turn;
        var v;
        try { v = -search(3 - turn, Math.max(0, depth - 1), -beta, -alpha, p.i, ply + 1); }
        finally { board[p.i] = 0; }
        value = Math.max(value, v); alpha = Math.max(alpha, v);
        if (alpha >= beta) break;
      }
      return value;
    }
    var maxDepth = level === 'easy' ? 1 : level === 'hard' ? 8 : 5;
    for (var depth = 1; depth <= maxDepth; depth++) {
      var iterationBest = best, value = -Infinity;
      try {
        var roots = ordered.slice(0, width);
        roots.sort(function (a, b) { return (b.i === best ? 1 : 0) - (a.i === best ? 1 : 0); });
        for (var p of roots) {
          check(); board[p.i] = color;
          var v;
          try { v = -search(3 - color, depth - 1, -Infinity, -value, p.i, 1); }
          finally { board[p.i] = 0; }
          if (v > value) { value = v; iterationBest = p.i; }
        }
        // Easy retains small opening variety when candidate evaluations tie.
        best = iterationBest; depthDone = depth;
        if (value >= WIN - 225) break;
      } catch (e) { if (e !== timeout) throw e; break; }
    }
    return { move: best, depth: depthDone, nodes: nodes, elapsed: performance.now() - started };
  }
  // Worker failure fallback: evaluate a few points per task so input can run.
  function fallback(moves, callback) {
    var state = E.replay(moves), list = candidates(state.board), ranked = [], cancelled = false, offset = 0;
    function chunk() {
      if (cancelled) return;
      var end = Math.min(offset + 6, list.length);
      while (offset < end) {
        var i = list[offset++], a = shape(state.board, i, state.turn), d = shape(state.board, i, 3 - state.turn);
        ranked.push({ i: i, score: a >= WIN ? WIN * 4 + a : d >= WIN ? WIN * 2 + d : a + 1.08 * d });
      }
      if (offset < list.length) setTimeout(chunk, 0);
      else { ranked.sort(function (a, b) { return b.score - a.score || a.i - b.i; }); callback(ranked.length ? ranked[0].i : null); }
    }
    setTimeout(chunk, 0);
    return function () { cancelled = true; };
  }
  var api = { choose: choose, fallback: fallback, rank: rank };
  root.GomokuAI = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
