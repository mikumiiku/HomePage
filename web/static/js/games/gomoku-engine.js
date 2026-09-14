/* Shared pure rules; used by the UI, worker and Node regression tests. */
(function (root) {
  'use strict';
  var N = 15, SIZE = N * N, dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  function valid(i) { return Number.isInteger(i) && i >= 0 && i < SIZE; }
  function empty() { return new Int8Array(SIZE); }
  function line(board, i) {
    if (!valid(i) || !board[i]) return [];
    var x = i % N, y = Math.floor(i / N), color = board[i];
    for (var d of dirs) {
      var cells = [i];
      for (var sign of [-1, 1]) {
        var xx = x + d[0] * sign, yy = y + d[1] * sign, side = [];
        while (xx >= 0 && xx < N && yy >= 0 && yy < N && board[yy * N + xx] === color) {
          side.push(yy * N + xx); xx += d[0] * sign; yy += d[1] * sign;
        }
        cells = sign < 0 ? side.reverse().concat(cells) : cells.concat(side);
      }
      if (cells.length >= 5) return cells;
    }
    return [];
  }
  function replay(moves) {
    if (!Array.isArray(moves) || moves.length > SIZE) throw new Error('棋谱格式不正确');
    var board = empty(), result = null, winning = [];
    moves.forEach(function (i, turn) {
      if (result !== null || !valid(i) || board[i]) throw new Error('棋谱含无效落子');
      board[i] = turn % 2 + 1;
      winning = line(board, i);
      if (winning.length) result = board[i];
      else if (turn === SIZE - 1) result = 0;
    });
    return { board: board, turn: moves.length % 2 + 1, result: result, line: winning };
  }
  function play(moves, i) {
    var state = replay(moves);
    if (state.result !== null || !valid(i) || state.board[i]) return null;
    return replay(moves.concat(i));
  }
  function coord(i) { return String.fromCharCode(65 + i % N) + (N - Math.floor(i / N)); }
  var api = { N: N, SIZE: SIZE, dirs: dirs, valid: valid, empty: empty, line: line, replay: replay, play: play, coord: coord };
  root.GomokuEngine = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
