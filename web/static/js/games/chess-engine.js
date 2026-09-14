/* Rules are supplied by the locally hosted chess.js; this adapter owns replay and results. */
(function (root) {
  'use strict';
  var ChessClass = typeof module === 'object' ? require('../../vendor/chess/chess.js').Chess : root.Chess;
  function result(game) {
    if (game.in_checkmate()) return { winner: game.turn() === 'w' ? 'b' : 'w', reason: '将死' };
    if (game.in_stalemate()) return { winner: null, reason: '逼和' };
    if (game.insufficient_material()) return { winner: null, reason: '子力不足' };
    if (game.in_threefold_repetition()) return { winner: null, reason: '三次重复局面' };
    if (game.in_draw()) return { winner: null, reason: '五十回合规则' };
    return null;
  }
  function replay(moves) {
    if (!Array.isArray(moves) || moves.length > 4000) throw new Error('棋谱无效');
    var game = new ChessClass();
    moves.forEach(function (move) {
      if (typeof move !== 'string' || result(game) || !game.move(move)) throw new Error('棋谱包含非法走法');
    });
    return game;
  }
  var api = { result: result, replay: replay };
  if (typeof module === 'object') module.exports = api; else root.ChessGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
