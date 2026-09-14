/* 扫雷 · 晨雾花园：左键/轻触翻开，右键/长按插旗，数字可和弦快开 */
(function (M) {
  'use strict';
  var stage = M.stage('minesweeper');
  var G = M.savegame('minesweeper');

  var DIFFS = {
    easy: { cols: 9, rows: 9, mines: 10, label: '简单 9×9' },
    hard: { cols: 16, rows: 16, mines: 40, label: '困难 16×16' },
  };

  var gridEl = document.createElement('div');
  gridEl.className = 'mine-grid';
  stage.appendChild(gridEl);

  /* 旗子模式开关（手机上单手更顺手） */
  var flagBtn = document.createElement('button');
  flagBtn.type = 'button';
  flagBtn.className = 'btn';
  flagBtn.textContent = '🚩 旗子模式';
  flagBtn.addEventListener('click', function () {
    flagMode = !flagMode;
    flagBtn.style.background = flagMode ? 'var(--sand)' : '';
    flagBtn.style.borderColor = flagMode ? 'var(--amber)' : '';
    M.toast(flagMode ? '旗子模式：轻触插旗' : '旗子模式已关闭');
  });
  M.hud.extra(flagBtn);

  var cells = [], minesMap = null, cols = 9, rows = 9, mines = 10, diff = 'easy';
  var started = false, over = false, flagMode = false, flags = 0, revealed = 0;
  var seconds = 0, timer = null;

  function idx(x, y) { return y * cols + x; }
  function neighbors(x, y) {
    var out = [];
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        var nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) out.push({ x: nx, y: ny });
      }
    }
    return out;
  }

  function startTimer() {
    if (timer) return;
    timer = setInterval(function () {
      seconds += 1;
      timeText.textContent = M.fmt.clock(seconds);
    }, 1000);
  }
  function stopTimer() { clearInterval(timer); timer = null; }

  var timeText = document.createElement('b');
  timeText.textContent = '0:00';
  var timeWrap = document.createElement('span');
  timeWrap.appendChild(document.createTextNode('⏱ '));
  timeWrap.appendChild(timeText);

  function setMineHud() {
    M.hud.label('score', '剩余雷数');
    M.hud.score(Math.max(0, mines - flags));
  }

  function setup(which) {
    diff = which;
    var d = DIFFS[which];
    cols = d.cols; rows = d.rows; mines = d.mines;
    cells = [];
    minesMap = null;
    started = false; over = false; flags = 0; revealed = 0; seconds = 0;
    stopTimer();
    timeText.textContent = '0:00';
    setMineHud();

    gridEl.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    gridEl.innerHTML = '';
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mine-cell';
        btn.setAttribute('aria-label', (x + 1) + ',' + (y + 1));
        bindCell(btn, x, y);
        gridEl.appendChild(btn);
        cells.push({ el: btn, mine: false, adj: 0, state: 'hidden' }); // 下标 = idx(x,y)
      }
    }
  }

  /* 首次翻开时布雷，保证第一格及其邻域安全 */
  function placeMines(safeX, safeY) {
    var forbidden = {};
    forbidden[idx(safeX, safeY)] = true;
    neighbors(safeX, safeY).forEach(function (n) { forbidden[idx(n.x, n.y)] = true; });
    var spots = [];
    for (var i = 0; i < cols * rows; i++) if (!forbidden[i]) spots.push(i);
    for (var m = 0; m < mines; m++) {
      var j = m + Math.floor(Math.random() * (spots.length - m));
      var t = spots[m]; spots[m] = spots[j]; spots[j] = t;
      cells[spots[m]].mine = true;
    }
    for (var y2 = 0; y2 < rows; y2++) {
      for (var x2 = 0; x2 < cols; x2++) {
        var c = cells[idx(x2, y2)];
        if (!c.mine) {
          c.adj = neighbors(x2, y2).filter(function (n) { return cells[idx(n.x, n.y)].mine; }).length;
        }
      }
    }
  }

  function revealAt(x, y) {
    var stack = [{ x: x, y: y }];
    while (stack.length) {
      var p = stack.pop();
      var c = cells[idx(p.x, p.y)];
      if (c.state !== 'hidden') continue;
      c.state = 'revealed';
      revealed += 1;
      paint(c);
      if (c.adj === 0 && !c.mine) {
        neighbors(p.x, p.y).forEach(function (n) {
          if (cells[idx(n.x, n.y)].state === 'hidden') stack.push(n);
        });
      }
    }
  }

  function paint(c) {
    var el = c.el;
    el.classList.remove('flagged');
    if (c.state === 'revealed') {
      el.classList.add('revealed');
      if (c.mine) { el.classList.add('boom'); el.textContent = '💥'; }
      else if (c.adj > 0) {
        el.textContent = c.adj;
        el.classList.add('n' + Math.min(c.adj, 8));
      } else el.textContent = '';
    } else if (c.state === 'flagged') {
      el.classList.add('flagged');
      el.textContent = '🚩';
    } else {
      el.textContent = '';
    }
  }

  function toggleFlag(x, y) {
    if (over) return;
    var c = cells[idx(x, y)];
    if (c.state === 'revealed') return;
    if (!started) { /* 未开局也允许先插旗，但布雷仍等首次翻开 */ }
    c.state = c.state === 'flagged' ? 'hidden' : 'flagged';
    flags += c.state === 'flagged' ? 1 : -1;
    paint(c);
    setMineHud();
  }

  function hitMine(c) {
    over = true;
    stopTimer();
    G.update(function (d) { d.stats.games += 1; });
    cells.forEach(function (cc) {
      if (cc.mine && cc.state === 'hidden') { cc.state = 'revealed'; paint(cc); }
    });
    c.el.classList.add('boom');
    M.overlay(stage, {
      title: '踩到雷了',
      lines: ['用时 ' + M.fmt.seconds(seconds) + '。'],
      actions: [
        { label: '再来一局', primary: true, onClick: function () { setup(diff); } },
        { label: '换个难度', onClick: showStart },
      ],
    });
  }

  function checkWin() {
    if (revealed !== cols * rows - mines) return;
    over = true;
    stopTimer();
    cells.forEach(function (c) {
      if (c.mine && c.state !== 'flagged') { c.state = 'flagged'; paint(c); }
    });
    setMineHud();
    var newRecord = false;
    G.update(function (d) {
      d.stats.games += 1;
      d.stats.wins += 1;
      d.settings.difficulty = diff;
      if (!d.best[diff]) d.best[diff] = { seconds: 0 };
      if (d.best[diff].seconds === 0 || seconds < d.best[diff].seconds) {
        d.best[diff].seconds = seconds;
        newRecord = true;
      }
    });
    M.hud.best(G.load().data.best[diff].seconds > 0 ? G.load().data.best[diff].seconds + 's' : '—');
    M.overlay(stage, {
      title: '扫雷成功！',
      lines: [
        DIFFS[diff].label + '，用时 ' + M.fmt.seconds(seconds),
        newRecord ? '新纪录！' : '最快纪录 ' + M.fmt.seconds(G.load().data.best[diff].seconds),
      ],
      actions: [
        { label: '再来一局', primary: true, onClick: function () { setup(diff); } },
        { label: '换个难度', onClick: showStart },
      ],
    });
  }

  function bindCell(el, x, y) {
    var pressTimer = null, longPressed = false, startXY = null;

    el.addEventListener('click', function () {
      if (longPressed) { longPressed = false; return; }
      if (over) return;
      var c = cells[idx(x, y)];
      if (flagMode) { toggleFlag(x, y); return; }
      if (c.state === 'flagged') return;
      if (c.state === 'revealed') { chord(x, y); return; }
      if (!minesMap) {
        placeMines(x, y);
        minesMap = true;
        started = true;
        startTimer();
      }
      if (c.mine) { c.state = 'revealed'; paint(c); hitMine(c); return; }
      revealAt(x, y);
      checkWin();
    });

    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      /* 安卓长按会同时触发 contextmenu：若旗子刚由长按逻辑处理过就跳过，避免状态反转 */
      if (longPressed) { longPressed = false; return; }
      toggleFlag(x, y);
    });

    /* 长按插旗（触屏） */
    el.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      longPressed = false;
      startXY = { x: e.clientX, y: e.clientY };
      pressTimer = setTimeout(function () {
        longPressed = true;
        toggleFlag(x, y);
        if (navigator.vibrate) navigator.vibrate(30);
      }, 420);
    });
    el.addEventListener('pointermove', function (e) {
      if (!pressTimer || !startXY) return;
      if (Math.abs(e.clientX - startXY.x) > 10 || Math.abs(e.clientY - startXY.y) > 10) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      el.addEventListener(ev, function () {
        clearTimeout(pressTimer);
        pressTimer = null;
      });
    });
  }

  /* 和弦：点开的数字周围旗数正好等于数字时，快开其余邻格 */
  function chord(x, y) {
    var c = cells[idx(x, y)];
    if (!c.adj) return;
    var ns = neighbors(x, y);
    var flagCount = ns.filter(function (n) { return cells[idx(n.x, n.y)].state === 'flagged'; }).length;
    if (flagCount !== c.adj) return;
    var boom = null;
    ns.forEach(function (n) {
      var nc = cells[idx(n.x, n.y)];
      if (nc.state === 'hidden' && !nc.mine) revealAt(n.x, n.y);
      else if (nc.state === 'hidden' && nc.mine) boom = nc;
    });
    if (boom) { boom.state = 'revealed'; paint(boom); hitMine(boom); return; }
    checkWin();
  }

  function showStart() {
    var st = G.load().data;
    M.hud.reset();
    M.hud.extra(flagBtn);
    M.hud.extra(timeWrap);
    M.overlay(stage, {
      title: '扫雷',
      lines: [
        st.best.easy.seconds ? ('简单最快 ' + M.fmt.seconds(st.best.easy.seconds)) : '简单 9×9，10 颗雷',
        st.best.hard.seconds ? ('困难最快 ' + M.fmt.seconds(st.best.hard.seconds)) : '困难 16×16，40 颗雷',
        M.platform.isTouch ? '轻触翻开，长按插旗' : '左键翻开，右键插旗',
      ],
      actions: [
        { label: '简单 9×9', primary: true, onClick: function () { setup('easy'); } },
        { label: '困难 16×16', primary: true, onClick: function () { setup('hard'); } },
      ],
    });
  }

  M.onRestart(showStart);
  showStart();
})(window.App);
