/* 俄罗斯方块 · 印象拼图（键盘操作，电脑端游戏） */
(function (M) {
  'use strict';
  var stage = M.stage('tetris');
  var G = M.savegame('tetris');

  var COLS = 10, ROWS = 20, CELL = 24;
  var COLORS = {
    I: '#7fa3b8', J: '#5d8a86', L: '#c9a86a',
    O: '#e3c98f', S: '#86a678', T: '#8a76b8', Z: '#d98aa9',
  };
  var BASE = {
    I: [[1, 1, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    T: [[0, 1, 0], [1, 1, 1]],
    Z: [[1, 1, 0], [0, 1, 1]],
  };

  var wrap = document.createElement('div');
  wrap.className = 'tetris-wrap';
  var frame = document.createElement('div');
  frame.className = 'canvas-frame';
  var canvas = document.createElement('canvas');
  frame.appendChild(canvas);
  var side = document.createElement('div');
  side.className = 'tetris-side';
  var nextPanel = document.createElement('div');
  nextPanel.className = 'panel next';
  var nextCanvas = document.createElement('canvas');
  nextPanel.appendChild(nextCanvas);
  var levelPanel = document.createElement('div');
  levelPanel.className = 'panel';
  levelPanel.innerHTML = '等级 <b id="tet-level">1</b>';
  var linesPanel = document.createElement('div');
  linesPanel.className = 'panel';
  linesPanel.innerHTML = '行数 <b id="tet-lines">0</b>';
  side.appendChild(nextPanel); side.appendChild(levelPanel); side.appendChild(linesPanel);
  wrap.appendChild(frame); wrap.appendChild(side);
  stage.appendChild(wrap);

  var ctx = canvas.getContext('2d');
  var nctx = nextCanvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  canvas.width = COLS * CELL * dpr;
  canvas.height = ROWS * CELL * dpr;
  canvas.style.width = COLS * CELL + 'px';
  canvas.style.height = ROWS * CELL + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  nextCanvas.width = 4 * 22 * dpr;
  nextCanvas.height = 4 * 22 * dpr;
  nextCanvas.style.height = 'auto';
  nctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  var grid, cur, nextType, score, lines, level, timer = null, running = false, paused = false, dropMs;

  function rotate(m) {
    var rows = m.length, colsN = m[0].length;
    var out = [];
    for (var x = 0; x < colsN; x++) {
      var row = [];
      for (var y = rows - 1; y >= 0; y--) row.push(m[y][x]);
      out.push(row);
    }
    return out;
  }

  function randomType() {
    var keys = Object.keys(BASE);
    return keys[Math.floor(Math.random() * keys.length)];
  }

  function spawn(type) {
    var m = BASE[type].map(function (r) { return r.slice(); });
    return {
      type: type,
      m: m,
      x: Math.floor((COLS - m[0].length) / 2),
      y: 0,
    };
  }

  function collide(m, px, py) {
    for (var y = 0; y < m.length; y++) {
      for (var x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        var gx = px + x, gy = py + y;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
        if (gy >= 0 && grid[gy][gx]) return true;
      }
    }
    return false;
  }

  function tryRotate() {
    var rm = rotate(cur.m);
    var kicks = [0, -1, 1, -2, 2];
    for (var i = 0; i < kicks.length; i++) {
      if (!collide(rm, cur.x + kicks[i], cur.y)) {
        cur.m = rm;
        cur.x += kicks[i];
        draw();
        return;
      }
    }
  }

  function move(dx) {
    if (!collide(cur.m, cur.x + dx, cur.y)) {
      cur.x += dx;
      draw();
    }
  }

  function softDrop() {
    if (!collide(cur.m, cur.x, cur.y + 1)) {
      cur.y += 1;
      score += 1;
      M.hud.score(score);
      draw();
      schedule();
    } else {
      lock();
    }
  }

  function hardDrop() {
    var dist = 0;
    while (!collide(cur.m, cur.x, cur.y + 1)) { cur.y += 1; dist += 1; }
    score += dist * 2;
    M.hud.score(score);
    lock();
  }

  function lock() {
    clearTimeout(timer);
    cur.m.forEach(function (row, y) {
      row.forEach(function (v, x) {
        if (v && cur.y + y >= 0) grid[cur.y + y][cur.x + x] = COLORS[cur.type];
      });
    });
    /* 消行 */
    var kept = grid.filter(function (row) { return row.some(function (c) { return !c; }); });
    var cleared = ROWS - kept.length;
    while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(null));
    grid = kept;
    if (cleared > 0) {
      lines += cleared;
      score += [0, 100, 300, 500, 800][cleared] * level;
      level = 1 + Math.floor(lines / 10);
      dropMs = Math.max(120, 800 - (level - 1) * 70);
      document.getElementById('tet-lines').textContent = lines;
      document.getElementById('tet-level').textContent = level;
      M.hud.score(score);
    }
    cur = spawn(nextType);
    nextType = randomType();
    drawNext();
    draw();
    if (collide(cur.m, cur.x, cur.y)) {
      gameOver();
      return;
    }
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (!running || paused) return;
      if (M.gamePaused()) { schedule(); return; }
      softDrop();
    }, dropMs);
  }

  function draw() {
    var px = COLS * CELL, py = ROWS * CELL;
    var dark = M.theme.isDark();
    ctx.fillStyle = dark ? '#2a3238' : '#f3ede1';
    ctx.fillRect(0, 0, px, py);
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(143,181,213,0.12)';
    for (var gx = 0; gx < COLS; gx++) {
      for (var gy = 0; gy < ROWS; gy++) {
        if ((gx + gy) % 2 === 0) ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL);
      }
    }
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        if (grid[y][x]) block(ctx, x, y, grid[y][x]);
      }
    }
    if (cur) {
      cur.m.forEach(function (row, y) {
        row.forEach(function (v, x) {
          if (v && cur.y + y >= 0) block(ctx, cur.x + x, cur.y + y, COLORS[cur.type]);
        });
      });
    }
  }

  function block(c, x, y, color) {
    c.fillStyle = color;
    c.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, 4);
  }

  function drawNext() {
    var m = BASE[nextType];
    nctx.clearRect(0, 0, 88, 88);
    var cs = 22;
    var ox = (4 - m[0].length) / 2, oy = (4 - m.length) / 2;
    m.forEach(function (row, y) {
      row.forEach(function (v, x) {
        if (!v) return;
        nctx.fillStyle = COLORS[nextType];
        nctx.fillRect((ox + x) * cs + 2, (oy + y) * cs + 2, cs - 4, cs - 4);
      });
    });
  }

  function start() {
    grid = [];
    for (var y = 0; y < ROWS; y++) grid.push(new Array(COLS).fill(null));
    score = 0; lines = 0; level = 1; dropMs = 800;
    running = true; paused = false;
    pauseButton.disabled = false;
    pauseButton.setAttribute('aria-label', '暂停游戏'); pauseButton.title = '暂停游戏';
    var pauseIcon = pauseButton.querySelector('.ti');
    if (pauseIcon) pauseIcon.style.setProperty('--icon', 'url(/static/vendor/bootstrap-icons/pause.svg)');
    M.hud.score(0);
    document.getElementById('tet-lines').textContent = '0';
    document.getElementById('tet-level').textContent = '1';
    nextType = randomType();
    cur = spawn(nextType);
    nextType = randomType();
    drawNext();
    draw();
    schedule();
  }

  function gameOver() {
    running = false; pauseButton.disabled = true;
    clearTimeout(timer);
    G.update(function (d) {
      d.stats.games += 1;
      if (score > (d.best.score || 0)) d.best.score = score;
      if (lines > (d.best.lines || 0)) d.best.lines = lines;
    });
    var best = G.load().data.best;
    M.hud.best(best.score || 0);
    M.overlay(stage, {
      title: '游戏结束',
      lines: [
        '得分 ' + score + '，消除 ' + lines + ' 行',
        best.score && score >= best.score ? '新纪录！' : '最高纪录 ' + (best.score || 0) + ' 分',
      ],
      actions: [{ label: '再来一局', primary: true, onClick: start }],
    });
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    pauseButton.setAttribute('aria-label', paused ? '继续游戏' : '暂停游戏');
    pauseButton.title = paused ? '继续游戏' : '暂停游戏';
    var pauseIcon = pauseButton.querySelector('.ti');
    if (pauseIcon) pauseIcon.style.setProperty('--icon', 'url(/static/vendor/bootstrap-icons/' + (paused ? 'play' : 'pause') + '.svg)');
    if (paused) {
      clearTimeout(timer);
      M.overlay(stage, {
        title: '已暂停',
        lines: ['按 P 或点击按钮继续'],
        actions: [{ label: '继续', primary: true, onClick: togglePause }],
        // Esc 本来就是暂停键，暂停中再按 Esc 应当继续。
        onEscape: togglePause,
      });
    } else {
      M.clearOverlays(stage);
      schedule();
    }
  }

  window.addEventListener('keydown', function (e) {
    // 暂停时 gamePaused() 为真（暂停覆盖层存在），因此 P 必须先于该判断处理。
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
    if (M.gamePaused() || !running || paused) return;
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); move(-1); break;
      case 'ArrowRight': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); tryRotate(); break;
      case 'ArrowDown': e.preventDefault(); clearTimeout(timer); softDrop(); break;
      case ' ': e.preventDefault(); clearTimeout(timer); hardDrop(); break;
    }
  });

  var pauseButton = document.createElement('button');
  pauseButton.type = 'button'; pauseButton.className = 'btn'; pauseButton.id = 'tetris-pause'; pauseButton.textContent = '暂停游戏'; pauseButton.disabled = true;
  pauseButton.addEventListener('click', togglePause); M.hud.extra(pauseButton);
  M.onRestart(function () { start(); M.toast('已重新开始'); });

  var best0 = G.load().data.best;
  M.hud.best(best0.score || 0);
  M.overlay(stage, {
    intro: true,
      title: '俄罗斯方块',
    lines: [
      '← → 移动，↑ 旋转，↓ 加速',
      '空格直落，P 暂停',
      best0.score ? ('最高纪录 ' + best0.score + ' 分') : '铺满一行即可消除',
    ],
    actions: [{ label: '开始游戏', primary: true, onClick: start }],
  });
})(window.App);
