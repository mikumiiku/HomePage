/* 贪吃蛇 · 塞纳河晨游：穿越边界从对岸出现，撞到自己则结束 */
(function (M) {
  'use strict';
  var stage = M.stage('snake');
  var G = M.savegame('snake');
  var N = 21; // 棋盘格数（N×N，环形边界）

  var frame = document.createElement('div');
  frame.className = 'canvas-frame';
  var canvas = document.createElement('canvas');
  frame.appendChild(canvas);
  stage.appendChild(frame);
  var ctx = null, cell = 20;

  var snake, dir, pendingDirs, food, score, speedMs, timer = null, running = false;

  var DIRS = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };

  function resize() {
    var w = Math.max(21, stage.clientWidth - 20 || 400);
    cell = Math.floor(w / N);
    var px = cell * N;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = px * dpr;
    canvas.height = px * dpr;
    canvas.style.width = px + 'px';
    canvas.style.height = px + 'px';
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (snake) draw(false);
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(stage);
  window.addEventListener('themechange', function () { if (snake) draw(false); });

  function placeFood() {
    var taken = {};
    snake.forEach(function (s) { taken[s.x + ',' + s.y] = true; });
    var spots = [];
    for (var x = 0; x < N; x++) {
      for (var y = 0; y < N; y++) {
        if (!taken[x + ',' + y]) spots.push({ x: x, y: y });
      }
    }
    food = spots[Math.floor(Math.random() * spots.length)];
  }

  function start() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir = DIRS.right;
    pendingDirs = [];
    score = 0;
    speedMs = 160;
    running = true;
    M.hud.score(0);
    placeFood();
    resize();
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(step, speedMs);
  }

  function step() {
    if (M.gamePaused()) { schedule(); return; }
    if (!running) return;
    if (pendingDirs.length) {
      var nd = pendingDirs.shift();
      if (!(nd.x === -dir.x && nd.y === -dir.y)) dir = nd;
    }
    var head = {
      x: (snake[0].x + dir.x + N) % N,
      y: (snake[0].y + dir.y + N) % N,
    };
    var eats = head.x === food.x && head.y === food.y;
    /* 吃到食物时蛇尾不动，因此碰撞检测排除尾节仅在不吃时成立 */
    var body = eats ? snake : snake.slice(0, -1);
    if (body.some(function (s) { return s.x === head.x && s.y === head.y; })) {
      die();
      return;
    }
    snake.unshift(head);
    if (eats) {
      score += 1;
      M.hud.score(score);
      speedMs = Math.max(70, speedMs - 3);
      placeFood();
    } else {
      snake.pop();
    }
    draw(false);
    schedule();
  }

  function die() {
    running = false;
    clearTimeout(timer);
    G.update(function (d) {
      d.stats.games += 1;
      d.stats.foodEaten = (d.stats.foodEaten || 0) + score;
      if (score > (d.best.score || 0)) d.best.score = score;
    });
    var best = G.load().data.best.score || 0;
    M.hud.best(best);
    draw(true);
    M.overlay(stage, {
      title: '游戏结束',
      lines: [
        '本局得分 ' + score + '，身长 ' + (score + 3) + ' 节',
        best && score >= best ? '新纪录！' : (best ? '最高纪录 ' + best + ' 分' : '第一次玩，纪录已保存'),
      ],
      actions: [{ label: '再来一局', primary: true, onClick: start }],
    });
  }

  function draw(dead) {
    if (!ctx) return;
    var px = cell * N;
    var dark = M.theme.isDark();
    ctx.fillStyle = dark ? '#2a3238' : '#f3ede1';
    ctx.fillRect(0, 0, px, px);

    /* 水纹格点 */
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(143,181,213,0.18)';
    for (var gx = 0; gx < N; gx++) {
      for (var gy = 0; gy < N; gy++) {
        if ((gx + gy) % 2 === 0) ctx.fillRect(gx * cell, gy * cell, cell, cell);
      }
    }

    /* 食物：小花苞 */
    if (food) {
      ctx.fillStyle = '#d98aa9';
      ctx.font = Math.floor(cell * 0.85) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✿', food.x * cell + cell / 2, food.y * cell + cell / 2 + 1);
    }

    /* 蛇身：垂柳绿渐入池水 */
    for (var i = snake.length - 1; i >= 0; i--) {
      var t = i / Math.max(1, snake.length - 1);
      var s = snake[i];
      var r = Math.round(134 + (63 - 134) * t);
      var g = Math.round(166 + (115 - 166) * t);
      var b = Math.round(120 + (112 - 120) * t);
      ctx.fillStyle = dead && i === 0 ? '#d98aa9' : 'rgb(' + r + ',' + g + ',' + b + ')';
      roundRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2, cell * 0.28);
      ctx.fill();
      if (i === 0) {
        ctx.fillStyle = '#fffdf8';
        var ex = cell * 0.22, ey = cell * 0.2;
        if (dir.x !== 0) {
          ctx.fillRect(s.x * cell + cell / 2 - ex / 2 + dir.x * cell * 0.18, s.y * cell + ey, ex, ex);
          ctx.fillRect(s.x * cell + cell / 2 - ex / 2 + dir.x * cell * 0.18, s.y * cell + cell - ey - ex, ex, ex);
        } else {
          ctx.fillRect(s.x * cell + ey, s.y * cell + cell / 2 - ex / 2 + dir.y * cell * 0.18, ex, ex);
          ctx.fillRect(s.x * cell + cell - ey - ex, s.y * cell + cell / 2 - ex / 2 + dir.y * cell * 0.18, ex, ex);
        }
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function queue(name) {
    var d = DIRS[name];
    if (!d || !running) return;
    if (pendingDirs.length < 3) pendingDirs.push(d);
  }

  M.onDirectionKeys(queue);
  M.onSwipe(frame, queue);
  M.onRestart(function () { start(); M.toast('已重新开始'); });

  resize();
  var saved = G.load().data;
  M.hud.best((saved.best && saved.best.score) || 0);
  M.overlay(stage, {
    intro: true,
      title: '贪吃蛇',
    lines: ['吃食物变长', '可以穿过边界从对岸出现，别咬到自己'],
    actions: [{ label: '开始游戏', primary: true, onClick: start }],
  });
})(window.App);
