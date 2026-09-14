/* 2048 */
(function (M) {
  'use strict';
  var stage = M.stage('2048');
  var G = M.savegame('2048');
  var SIZE = 4;

  var board, score, over, wonShown;
  var boardEl = document.createElement('div');
  boardEl.className = 'board2048';
  stage.appendChild(boardEl);
  var cells = [];
  for (var i = 0; i < SIZE * SIZE; i++) {
    var c = document.createElement('div');
    c.className = 'cell2048';
    boardEl.appendChild(c);
    cells.push(c);
  }

  function tileClass(v) {
    if (!v) return 'cell2048';
    if (v > 2048) return 'cell2048 tile tile-super';
    return 'cell2048 tile tile-' + v;
  }

  function render() {
    for (var i = 0; i < board.length; i++) {
      cells[i].className = tileClass(board[i]);
      cells[i].textContent = board[i] ? board[i] : '';
    }
    M.hud.score(score);
  }

  function emptyCells() {
    var r = [];
    board.forEach(function (v, i) { if (!v) r.push(i); });
    return r;
  }

  function addRandom() {
    var empty = emptyCells();
    if (!empty.length) return;
    board[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
  }

  /* 每条线的下标按「移动终点在前」排列 */
  function lineIndices(dir) {
    var lines = [];
    for (var i = 0; i < SIZE; i++) {
      var line = [];
      for (var j = 0; j < SIZE; j++) {
        if (dir === 'left') line.push(i * SIZE + j);
        else if (dir === 'right') line.push(i * SIZE + (SIZE - 1 - j));
        else if (dir === 'up') line.push(j * SIZE + i);
        else line.push((SIZE - 1 - j) * SIZE + i);
      }
      lines.push(line);
    }
    return lines;
  }

  function move(dir) {
    if (over) return;
    var moved = false, gained = 0, reached2048 = false;
    lineIndices(dir).forEach(function (line) {
      var vals = line.map(function (i) { return board[i]; }).filter(Boolean);
      var merged = [];
      for (var k = 0; k < vals.length; k++) {
        if (k + 1 < vals.length && vals[k] === vals[k + 1]) {
          var nv = vals[k] * 2;
          merged.push(nv);
          gained += nv;
          if (nv === 2048) reached2048 = true;
          k++;
        } else merged.push(vals[k]);
      }
      line.forEach(function (idx, pos) {
        var nv = merged[pos] || 0;
        if (board[idx] !== nv) moved = true;
        board[idx] = nv;
      });
    });
    if (!moved) return;
    score += gained;
    addRandom();
    if (reached2048) wonShown = true;
    render();
    persist();
    if (reached2048) { showEnd(true); return; }
    if (isDead()) {
      over = true;
      finishGame();
      showEnd(false);
    }
  }

  function isDead() {
    if (emptyCells().length) return false;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = board[r * SIZE + c];
        if (c + 1 < SIZE && board[r * SIZE + c + 1] === v) return false;
        if (r + 1 < SIZE && board[(r + 1) * SIZE + c] === v) return false;
      }
    }
    return true;
  }

  /* 每步存档：续玩棋局 + 实时刷新纪录 */
  function persist() {
    G.update(function (d) {
      d.session = { board: board.slice(), score: score, won: wonShown };
      if (score > (d.best.score || 0)) d.best.score = score;
      var maxTile = Math.max.apply(null, board.filter(Boolean));
      if (maxTile > (d.best.maxTile || 0)) d.best.maxTile = maxTile;
    });
    M.hud.best(G.load().data.best.score || 0);
  }

  function finishGame() {
    G.update(function (d) {
      d.stats.games += 1;
      d.stats.totalMoves = (d.stats.totalMoves || 0);
      d.session = null;
    });
  }

  function showEnd(win) {
    var best = G.load().data.best.score || 0;
    M.overlay(stage, {
      title: win ? '达成 2048！' : '游戏结束',
      lines: [
        '本局得分 ' + score + (gainedBestHint()),
        best ? '最高纪录 ' + best + ' 分' : '还没有纪录',
      ],
      actions: [
        { label: '再来一局', primary: true, onClick: newGame },
      ],
    });
  }

  function gainedBestHint() {
    return score > 0 && score >= (G.load().data.best.score || 0) ? '（新纪录！）' : '';
  }

  function newGame() {
    board = new Array(SIZE * SIZE).fill(0);
    score = 0; over = false; wonShown = false;
    addRandom(); addRandom();
    render();
    persist();
  }

  function resumeOrNew() {
    var st = G.load();
    M.hud.best((st.data.best && st.data.best.score) || 0);
    var s = st.data.session;
    if (s && Array.isArray(s.board) && s.board.length === SIZE * SIZE && s.board.some(Boolean)) {
      board = s.board.slice();
      score = s.score || 0;
      over = false;
      wonShown = !!s.won;
      render();
      M.toast('已恢复上次的进度');
      if (isDead()) {
        over = true;
        finishGame();
        showEnd(false);
      }
      return;
    }
    newGame();
  }

  M.onDirectionKeys(move);
  M.onSwipe(boardEl, move);
  M.onRestart(function () { newGame(); M.toast('已重新开始'); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'r' || e.key === 'R') { newGame(); M.toast('已重新开始'); }
  });

  resumeOrNew();
})(window.App);
