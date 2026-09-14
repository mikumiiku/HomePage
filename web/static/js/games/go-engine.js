/* Pure Chinese-rules Go engine. Shared by the UI, Worker and Node tests. */
(function (root) {
  'use strict';

  var SIZES = [9, 13, 19];
  var LETTERS = 'ABCDEFGHJKLMNOPQRST';

  function validSize(size) { return SIZES.includes(size); }
  function validPoint(size, point) { return Number.isInteger(point) && point >= 0 && point < size * size; }
  function empty(size) {
    if (!validSize(size)) throw new Error('棋盘尺寸无效');
    return new Int8Array(size * size);
  }
  function neighbors(size, point) {
    var x = point % size, y = Math.floor(point / size), out = [];
    if (x > 0) out.push(point - 1);
    if (x + 1 < size) out.push(point + 1);
    if (y > 0) out.push(point - size);
    if (y + 1 < size) out.push(point + size);
    return out;
  }
  function boardKey(board) {
    var out = '';
    for (var i = 0; i < board.length; i++) out += board[i];
    return out;
  }
  function groupOn(board, size, point) {
    if (!validPoint(size, point) || !board[point]) return { color: 0, stones: [], liberties: [] };
    var color = board[point], stack = [point], seen = new Set([point]), liberties = new Set();
    while (stack.length) {
      var here = stack.pop();
      neighbors(size, here).forEach(function (next) {
        if (!board[next]) liberties.add(next);
        else if (board[next] === color && !seen.has(next)) { seen.add(next); stack.push(next); }
      });
    }
    return { color: color, stones: Array.from(seen), liberties: Array.from(liberties) };
  }
  function groupAt(state, point) { return groupOn(state.board, state.size, point); }
  function initial(size) {
    var board = empty(size);
    return {
      size: size,
      board: board,
      turn: 1,
      moves: [],
      captures: [0, 0, 0],
      passes: 0,
      history: [boardKey(board)]
    };
  }
  function illegal(reason) { return { ok: false, reason: reason }; }
  function play(state, point) {
    if (!state || !validSize(state.size) || !validPoint(state.size, point)) return illegal('invalid');
    if (state.board[point]) return illegal('occupied');
    var board = new Int8Array(state.board), color = state.turn, opponent = 3 - color, captured = [], checked = new Set();
    board[point] = color;
    neighbors(state.size, point).forEach(function (next) {
      if (board[next] !== opponent || checked.has(next)) return;
      var group = groupOn(board, state.size, next);
      group.stones.forEach(function (stone) { checked.add(stone); });
      if (!group.liberties.length) {
        group.stones.forEach(function (stone) { board[stone] = 0; captured.push(stone); });
      }
    });
    if (!groupOn(board, state.size, point).liberties.length) return illegal('suicide');
    var key = boardKey(board);
    if (state.history.includes(key)) return illegal('superko');
    var captures = state.captures.slice();
    captures[color] += captured.length;
    return {
      ok: true,
      captured: captured,
      state: {
        size: state.size,
        board: board,
        turn: opponent,
        moves: state.moves.concat(point),
        captures: captures,
        passes: 0,
        history: state.history.concat(key)
      }
    };
  }
  function pass(state) {
    if (!state || !validSize(state.size)) throw new Error('对局状态无效');
    return {
      size: state.size,
      board: new Int8Array(state.board),
      turn: 3 - state.turn,
      moves: state.moves.concat(-1),
      captures: state.captures.slice(),
      passes: state.passes + 1,
      history: state.history.concat(boardKey(state.board))
    };
  }
  function replay(size, moves) {
    if (!validSize(size) || !Array.isArray(moves) || moves.length > size * size * 4) throw new Error('棋谱格式不正确');
    var state = initial(size);
    moves.forEach(function (point) {
      if (point === -1) state = pass(state);
      else {
        var result = play(state, point);
        if (!result.ok) throw new Error('棋谱含无效落子：' + result.reason);
        state = result.state;
      }
    });
    return state;
  }
  function expandDead(state, dead) {
    var result = new Set(), requested = Array.isArray(dead) ? dead : [];
    requested.forEach(function (point) {
      if (!validPoint(state.size, point) || !state.board[point]) return;
      groupAt(state, point).stones.forEach(function (stone) { result.add(stone); });
    });
    return result;
  }
  function score(state, dead, komi) {
    if (!state || !validSize(state.size)) throw new Error('对局状态无效');
    komi = Number.isFinite(komi) ? komi : 7.5;
    var removed = expandDead(state, dead), board = new Int8Array(state.board);
    removed.forEach(function (point) { board[point] = 0; });
    var black = 0, white = komi, blackTerritory = [], whiteTerritory = [], neutral = [], visited = new Set();
    for (var i = 0; i < board.length; i++) {
      if (board[i] === 1) { black++; continue; }
      if (board[i] === 2) { white++; continue; }
      if (visited.has(i)) continue;
      var region = [], border = new Set(), stack = [i]; visited.add(i);
      while (stack.length) {
        var here = stack.pop(); region.push(here);
        neighbors(state.size, here).forEach(function (next) {
          if (board[next]) border.add(board[next]);
          else if (!visited.has(next)) { visited.add(next); stack.push(next); }
        });
      }
      if (border.size === 1 && border.has(1)) { black += region.length; blackTerritory.push.apply(blackTerritory, region); }
      else if (border.size === 1 && border.has(2)) { white += region.length; whiteTerritory.push.apply(whiteTerritory, region); }
      else neutral.push.apply(neutral, region);
    }
    var winner = black > white ? 1 : 2;
    return {
      black: black,
      white: white,
      winner: winner,
      margin: Math.abs(black - white),
      territory: { black: blackTerritory, white: whiteTerritory, neutral: neutral },
      dead: Array.from(removed).sort(function (a, b) { return a - b; })
    };
  }
  function coord(size, point) {
    if (!validSize(size) || !validPoint(size, point)) return '';
    return LETTERS[point % size] + (size - Math.floor(point / size));
  }
  function starPoints(size) {
    var low = size === 9 ? 2 : 3, high = size - low - 1, middle = Math.floor(size / 2), axes = [low, high];
    if (size !== 9) axes.splice(1, 0, middle);
    var out = [];
    axes.forEach(function (y) { axes.forEach(function (x) { out.push(y * size + x); }); });
    if (size === 9) out.push(middle * size + middle);
    return out;
  }
  function legalMoves(state) {
    var out = [];
    for (var i = 0; i < state.board.length; i++) if (!state.board[i] && play(state, i).ok) out.push(i);
    return out;
  }

  var api = {
    SIZES: SIZES,
    LETTERS: LETTERS,
    validSize: validSize,
    validPoint: validPoint,
    empty: empty,
    neighbors: neighbors,
    initial: initial,
    replay: replay,
    play: play,
    pass: pass,
    groupAt: groupAt,
    score: score,
    coord: coord,
    starPoints: starPoints,
    legalMoves: legalMoves,
    boardKey: boardKey
  };
  root.GoEngine = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
