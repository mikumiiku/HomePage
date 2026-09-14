'use strict';
importScripts('../../vendor/chess/chess.js' + self.location.search);
var values = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
self.onmessage = function (event) {
  var input = event.data, game = new Chess(), deadline = Date.now() + ({easy: 180, normal: 650, hard: 1500}[input.level] || 650);
  input.moves.forEach(function (move) { game.move(move); });
  function evaluate() {
    var score = 0;
    game.board().forEach(function (row, r) { row.forEach(function (p, c) {
      if (!p) return;
      var center = 7 - Math.abs(3.5 - r) - Math.abs(3.5 - c);
      var bonus = p.type === 'p' ? ((p.color === 'w' ? 6-r : r-1) * 9 + center * 2) : p.type === 'k' ? -center * 4 : center * 7;
      score += (values[p.type] + bonus) * (p.color === game.turn() ? 1 : -1);
    }); });
    return score;
  }
  function ordered() { return game.moves({verbose:true}).sort(function(a,b) { return priority(b)-priority(a); }); }
  function priority(m) { return (m.captured ? values[m.captured]*10-values[m.piece] : 0)+(m.promotion ? values[m.promotion] : 0)+(m.san.includes('+')?40:0); }
  function search(depth, alpha, beta, ply) {
    if (Date.now() > deadline) throw new Error('budget');
    var moves = ordered();
    if (!moves.length) return game.in_check() ? -100000+ply : 0;
    if (game.in_draw() || game.in_threefold_repetition()) return 0;
    if (!depth) return evaluate();
    var best = -Infinity;
    for (var m of moves) {
      game.move(m); var score;
      try { score = -search(depth-1,-beta,-alpha,ply+1); } finally { game.undo(); }
      best = Math.max(best,score); alpha = Math.max(alpha,score);
      if (alpha >= beta) break;
    }
    return best;
  }
  var moves = ordered(), chosen = moves[0], maxDepth = {easy:1,normal:3,hard:4}[input.level] || 3;
  for (var depth=1; depth<=maxDepth; depth++) {
    var best = -Infinity, next = chosen;
    try {
      for (var move of moves) {
        game.move(move); var score;
        try { score = -search(depth-1,-Infinity,-best,1); } finally { game.undo(); }
        if (score > best) { best=score; next=move; }
      }
      chosen=next;
      moves.sort(function(a,b) { return (b.san===chosen.san?1:0)-(a.san===chosen.san?1:0); });
    } catch (error) { break; }
  }
  self.postMessage({id:input.id, move:chosen ? chosen.san : null});
};
