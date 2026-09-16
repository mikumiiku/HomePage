/* Offline Go opponent: shape ranking, reply search and Monte Carlo playouts.
 *
 * The three levels use genuinely different algorithms, not just different clocks:
 *   easy   - shape ranking only, deliberately noisy (picks a weaker candidate)
 *   normal - shape ranking plus one verified reply (two ply tactics)
 *   hard   - shape ranking as priors feeding a UCT search over playouts
 * Everything runs inside the page Worker, so the server is never involved.
 */
(function (root) {
  'use strict';
  var E = root.GoEngine;
  if (!E && typeof require === 'function') E = require('./go-engine.js');

  var BUDGETS = { easy: 160, normal: 700, hard: 2400 };
  var KOMI = 7.5;
  var FAIL = -2;

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

  /* ------------------------------------------------------------------ *
   * Shape evaluation: ranks single moves. Used directly by easy/normal    *
   * and as priors for the playout search.                                *
   * ------------------------------------------------------------------ */

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
  function lastMove(state) {
    for (var i = state.moves.length - 1; i >= 0; i--) if (state.moves[i] >= 0) return state.moves[i];
    return -1;
  }
  function nearStone(state, point) {
    var size = state.size, x = point % size, y = Math.floor(point / size);
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      var xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= size || yy < 0 || yy >= size) continue;
      if (state.board[yy * size + xx]) return true;
    }
    return false;
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
    if (own.liberties.length === 1) {
      /* Still in atari after playing: only worth it when it captured something. */
      if (!result.captured.length) value -= 4200 + own.stones.length * 80;
      else value -= 900;
    }
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
    var previous = lastMove(state);
    if (previous >= 0) {
      var dx = Math.abs(previous % state.size - point % state.size);
      var dy = Math.abs(Math.floor(previous / state.size) - Math.floor(point / state.size));
      if (dx + dy <= 2) value += 140;
    }
    return { move: point, value: value, state: next, captured: result.captured.length, liberties: own.liberties.length };
  }
  function candidatePoints(state) {
    var occupied = 0;
    for (var i = 0; i < state.board.length; i++) if (state.board[i]) occupied++;
    if (!occupied) return E.starPoints(state.size);
    var result = [], point;
    for (point = 0; point < state.board.length; point++) {
      if (state.board[point] || !nearStone(state, point)) continue;
      result.push(point);
    }
    if (result.length) return result;
    for (point = 0; point < state.board.length; point++) if (!state.board[point]) result.push(point);
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

  /* ------------------------------------------------------------------ *
   * Fast playout board: works on a scratch Int8Array reused between      *
   * playouts, with preallocated flood-fill buffers so a playout allocates *
   * nothing.                                                             *
   * ------------------------------------------------------------------ */

  var stack = null, markStone = null, fillGen = 0;
  var fill = { stones: null, lib: null, count: 0, libCount: 0 };
  var removed = null, nbBuf = new Int32Array(4), nbSave = new Int32Array(4);

  function ensureScratch(size) {
    var n = size * size;
    if (stack && stack.length >= n) return;
    stack = new Int32Array(n);
    markStone = new Int32Array(n);
    fill.stones = new Int32Array(n);
    fill.lib = new Int32Array(n);
    removed = new Int32Array(n);
    fillGen = 0;
  }
  /* Collects the group at point into fill.stones / fill.lib; returns its liberty count. */
  function groupFill(board, size, point) {
    var color = board[point], g = ++fillGen, sp = 0, n = 0, ln = 0;
    stack[sp++] = point; markStone[point] = g;
    while (sp) {
      var p = stack[--sp];
      fill.stones[n++] = p;
      var x = p % size, y = (p - x) / size, q, v;
      if (x > 0) {
        q = p - 1; v = board[q];
        if (v === 0) { if (markStone[q] !== -g) { markStone[q] = -g; fill.lib[ln++] = q; } }
        else if (v === color && markStone[q] !== g) { markStone[q] = g; stack[sp++] = q; }
      }
      if (x + 1 < size) {
        q = p + 1; v = board[q];
        if (v === 0) { if (markStone[q] !== -g) { markStone[q] = -g; fill.lib[ln++] = q; } }
        else if (v === color && markStone[q] !== g) { markStone[q] = g; stack[sp++] = q; }
      }
      if (y > 0) {
        q = p - size; v = board[q];
        if (v === 0) { if (markStone[q] !== -g) { markStone[q] = -g; fill.lib[ln++] = q; } }
        else if (v === color && markStone[q] !== g) { markStone[q] = g; stack[sp++] = q; }
      }
      if (y + 1 < size) {
        q = p + size; v = board[q];
        if (v === 0) { if (markStone[q] !== -g) { markStone[q] = -g; fill.lib[ln++] = q; } }
        else if (v === color && markStone[q] !== g) { markStone[q] = g; stack[sp++] = q; }
      }
    }
    fill.count = n; fill.libCount = ln;
    return ln;
  }
  function neighborsOf(size, p) {
    var x = p % size, y = (p - x) / size, n = 0;
    if (x > 0) nbBuf[n++] = p - 1;
    if (x + 1 < size) nbBuf[n++] = p + 1;
    if (y > 0) nbBuf[n++] = p - size;
    if (y + 1 < size) nbBuf[n++] = p + size;
    return n;
  }
  /* Same list in a buffer the callees below never touch. */
  function saveNeighbors(size, p) {
    var n = neighborsOf(size, p), i;
    for (i = 0; i < n; i++) nbSave[i] = nbBuf[i];
    return n;
  }
  /* Plays a stone in place. Returns the simple-ko point it created (-1 if none), FAIL when illegal. */
  function playFast(board, size, point, color, koPoint) {
    if (board[point] || point === koPoint) return FAIL;
    var enemy = 3 - color, i, q;
    board[point] = color;
    var nc = neighborsOf(size, point), taken = 0, single = -1;
    for (i = 0; i < nc; i++) {
      q = nbBuf[i];
      if (board[q] !== enemy) continue;
      if (groupFill(board, size, q) === 0) {
        for (var s = 0; s < fill.count; s++) { board[fill.stones[s]] = 0; removed[taken++] = fill.stones[s]; }
        if (fill.count === 1) single = fill.stones[0];
      }
    }
    var ownLibs = groupFill(board, size, point), ownStones = fill.count;
    if (ownLibs === 0) {
      board[point] = 0;
      for (i = 0; i < taken; i++) board[removed[i]] = enemy;
      return FAIL;
    }
    if (taken === 1 && ownStones === 1) return single;
    return -1;
  }
  /* Real-eye test, used to stop playouts from filling their own eyes. */
  function isOwnEye(board, size, p, color) {
    var x = p % size, y = (p - x) / size, enemy = 3 - color;
    var edge = (x === 0 || y === 0 || x === size - 1 || y === size - 1) ? 1 : 0, q;
    q = x > 0 ? p - 1 : -1; if (q >= 0 && board[q] !== color) return 0;
    q = x + 1 < size ? p + 1 : -1; if (q >= 0 && board[q] !== color) return 0;
    q = y > 0 ? p - size : -1; if (q >= 0 && board[q] !== color) return 0;
    q = y + 1 < size ? p + size : -1; if (q >= 0 && board[q] !== color) return 0;
    var bad = 0;
    if (x > 0 && y > 0 && board[p - size - 1] === enemy) bad++;
    if (x + 1 < size && y > 0 && board[p - size + 1] === enemy) bad++;
    if (x > 0 && y + 1 < size && board[p + size - 1] === enemy) bad++;
    if (x + 1 < size && y + 1 < size && board[p + size + 1] === enemy) bad++;
    return bad + edge < 2 ? 1 : 0;
  }
  function hasNeighbourStone(board, size, p) {
    var x = p % size, y = (p - x) / size;
    if (x > 0 && board[p - 1]) return 1;
    if (x + 1 < size && board[p + 1]) return 1;
    if (y > 0 && board[p - size]) return 1;
    if (y + 1 < size && board[p + size]) return 1;
    return 0;
  }
  /* A move is playable when it keeps two liberties or captures something. */
  function playable(board, size, p, color) {
    if (board[p] || isOwnEye(board, size, p, color)) return 0;
    var enemy = 3 - color, i, q;
    board[p] = color;
    var ok = groupFill(board, size, p) >= 2 ? 1 : 0;
    if (!ok) {
      var nc = neighborsOf(size, p);
      for (i = 0; i < nc; i++) {
        q = nbBuf[i];
        if (board[q] !== enemy) continue;
        if (groupFill(board, size, q) === 0) { ok = 1; break; }
      }
    }
    board[p] = 0;
    return ok;
  }
  function capturesAt(board, size, p, color) {
    var enemy = 3 - color, nc = neighborsOf(size, p), i, q;
    for (i = 0; i < nc; i++) {
      q = nbBuf[i];
      if (board[q] !== enemy) continue;
      board[p] = color;
      var libs = groupFill(board, size, q);
      board[p] = 0;
      if (libs === 0) return 1;
    }
    return 0;
  }
  /* Mogo-style policy: local answers around the last move, otherwise a
   * filtered random point. Short playouts, but they still resolve atari. */
  function policyMove(board, size, color, rng, last, koPoint) {
    var enemy = 3 - color, i, j, q, at, nc;
    if (last >= 0) {
      if (rng() < .95) {
        nc = saveNeighbors(size, last);
        for (i = 0; i < nc; i++) {
          q = nbSave[i];
          if (board[q] !== enemy) continue;
          if (groupFill(board, size, q) === 1) {
            at = fill.lib[0];
            if (at !== koPoint && playable(board, size, at, color)) return at;
          }
        }
      }
      nc = saveNeighbors(size, last);
      for (i = 0; i < nc; i++) {
        q = nbSave[i];
        if (board[q] !== color) continue;
        if (groupFill(board, size, q) !== 1) continue;
        var libs = fill.libCount, points = [];
        for (j = 0; j < libs; j++) points.push(fill.lib[j]);
        for (j = 0; j < libs; j++) {
          at = points[j];
          if (at !== koPoint && capturesAt(board, size, at, color)) return at;
        }
        for (j = 0; j < libs; j++) {
          at = points[j];
          if (at !== koPoint && playable(board, size, at, color)) return at;
        }
      }
      if (rng() < .4) {
        nc = saveNeighbors(size, last);
        for (i = 0; i < nc; i++) {
          q = nbSave[i];
          if (board[q] !== enemy) continue;
          if (groupFill(board, size, q) === 2) {
            at = fill.lib[rng() < .5 ? 0 : 1];
            if (at !== koPoint && playable(board, size, at, color)) return at;
          }
        }
      }
    }
    var total = size * size;
    for (var t = 0; t < 10; t++) {
      var p;
      if (last >= 0 && t < 6) {
        /* Keep the fight local: sample around the last stone first. */
        var lx = last % size, ly = (last - (last % size)) / size;
        var nx = lx + ((rng() * 7) | 0) - 3, ny = ly + ((rng() * 7) | 0) - 3;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        p = ny * size + nx;
      } else {
        p = (rng() * total) | 0;
      }
      if (board[p] || p === koPoint) continue;
      if (isOwnEye(board, size, p, color)) continue;
      if (t < 8 && !hasNeighbourStone(board, size, p)) continue;
      if (playable(board, size, p, color)) return p;
    }
    return -1;
  }
  /* Chinese area score of a finished playout. */
  function areaWinner(board, size, komi) {
    var black = 0, white = komi, i, p, q;
    for (i = 0; i < board.length; i++) {
      if (board[i] === 1) black++;
      else if (board[i] === 2) white++;
    }
    var g = ++fillGen, sp;
    for (i = 0; i < board.length; i++) {
      if (board[i] || markStone[i] === g) continue;
      var count = 0, touchB = 0, touchW = 0;
      sp = 0; stack[sp++] = i; markStone[i] = g;
      while (sp) {
        p = stack[--sp]; count++;
        var nc = neighborsOf(size, p);
        for (var k = 0; k < nc; k++) {
          q = nbBuf[k];
          var v = board[q];
          if (v === 0) { if (markStone[q] !== g) { markStone[q] = g; stack[sp++] = q; } }
          else if (v === 1) touchB = 1;
          else touchW = 1;
        }
      }
      if (touchB && !touchW) black += count;
      else if (touchW && !touchB) white += count;
    }
    return black > white ? 1 : 2;
  }
  function playout(board, size, turn, rng, startKo, last, maxPly) {
    var color = turn, passes = 0, ply = 0, ko = startKo;
    while (ply < maxPly && passes < 2) {
      var move = policyMove(board, size, color, rng, last, ko);
      if (move < 0) { passes++; last = -1; ko = -1; }
      else {
        var made = playFast(board, size, move, color, ko);
        if (made === FAIL) { passes++; last = -1; ko = -1; }
        else { passes = 0; ko = made; last = move; ply++; }
      }
      color = 3 - color;
    }
    return areaWinner(board, size, KOMI);
  }

  /* ------------------------------------------------------------------ *
   * Root UCT over the best shape-ranked candidates.                      *
   * ------------------------------------------------------------------ */

  function monteCarlo(state, candidates, deadline, rng) {
    var size = state.size, total = size * size, count = candidates.length, i;
    var visits = new Float64Array(count), wins = new Float64Array(count), priors = new Float64Array(count);
    for (i = 0; i < count; i++) priors[i] = Math.pow(.82, i);
    var root = state.board.slice(), board = new Int8Array(total);
    var color = state.turn, playouts = 0, guard = 0;
    var maxPly = Math.round(total * 1.4);
    ensureScratch(size);
    while (true) {
      if ((guard++ & 7) === 0 && now() >= deadline) break;
      var pick = -1, bestScore = -Infinity;
      for (i = 0; i < count; i++) {
        var score;
        if (!visits[i]) score = 1e6 + priors[i];
        else score = wins[i] / visits[i] + .85 * Math.sqrt(Math.log(playouts + 1) / visits[i]) + priors[i] * 30 / (visits[i] + 1);
        if (score > bestScore) { bestScore = score; pick = i; }
      }
      board.set(root);
      var ko = playFast(board, size, candidates[pick].move, color, -1);
      if (ko === FAIL) { visits[pick] = 1e9; continue; }
      if (playout(board, size, 3 - color, rng, ko, candidates[pick].move, maxPly) === color) wins[pick]++;
      visits[pick]++; playouts++;
      if (playouts >= 60000) break;
    }
    if (!playouts) return null;
    var top = -1;
    for (i = 0; i < count; i++) if (visits[i] < 1e8 && (top < 0 || visits[i] > visits[top])) top = i;
    return top < 0 ? null : { index: top, playouts: playouts };
  }

  /* ------------------------------------------------------------------ *
   * Entry points                                                        *
   * ------------------------------------------------------------------ */

  function choose(request) {
    request = request || {};
    var state = E.replay(Number(request.size), request.moves || []), level = BUDGETS[request.level] ? request.level : 'normal';
    var started = now(), budget = Number.isFinite(request.budget) ? Math.max(1, request.budget) : BUDGETS[level];
    var deadline = started + budget, random = request.random || seeded(request.seed === undefined ? Date.now() : request.seed);
    var ranked = rank(state, level === 'hard' ? started + budget * .35 : deadline);
    if (!ranked.length) return { move: -1, elapsed: now() - started, nodes: 0 };
    var best = ranked[0], nodes = ranked.length, i;
    if (level === 'easy') {
      /* Picks from a shallow pool and sometimes drifts further down the list,
       * so it plays plausible shapes without tactical follow-through. */
      best = ranked[Math.floor(random() * Math.min(6, ranked.length))];
      if (random() < .14) best = ranked[Math.floor(random() * Math.min(24, ranked.length))];
    } else {
      /* normal and hard both search; hard simply gets more playouts and a
       * wider root, which is what actually separates their judgement. */
      var roots = ranked.slice(0, Math.min(level === 'hard' ? 16 : 10, ranked.length));
      var mc = monteCarlo(state, roots, deadline, random);
      if (mc) { best = roots[mc.index]; nodes += mc.playouts; }
      else {
        var scored = [];
        for (i = 0; i < roots.length && now() < deadline; i++) {
          var penalty = replyPenalty(roots[i].state, deadline, 5);
          nodes++;
          scored.push({ candidate: roots[i], value: roots[i].value - penalty * .6 });
        }
        scored.sort(function (a, b) { return b.value - a.value || a.candidate.move - b.candidate.move; });
        if (scored.length) best = scored[0].candidate;
      }
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
