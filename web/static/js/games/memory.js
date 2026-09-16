/* 记忆翻牌 · 睡莲对对碰 */
(function (M) {
  'use strict';
  var stage = M.stage('memory');
  var G = M.savegame('memory');
  var ICONS = ['🌸', '🌷', '🌼', '🌻', '🪷', '🍀', '🌿', '🍁', '🌊', '☁️', '🌾', '🦆', '🕊️', '🐇', '🦋', '🐞', '🎨', '🖌️'];
  /* 与 ICONS 一一对应的中文名：读屏播报与 aria-label 用它，不用表情符号。 */
  var ICON_NAMES = ['樱花', '郁金香', '雏菊', '向日葵', '睡莲', '三叶草', '草叶', '枫叶', '水波', '云朵', '稻穗', '野鸭', '白鸽', '兔子', '蝴蝶', '瓢虫', '调色板', '画笔'];

  var grid = document.createElement('div');
  grid.className = 'mem-grid';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', '记忆翻牌牌面');
  stage.appendChild(grid);

  var timeText = document.createElement('b');
  timeText.textContent = '0:00';
  M.hud.extra(timeText);

  var DIFFS = {
    easy: { cols: 4, label: '简单 4×4' },
    hard: { cols: 6, label: '困难 6×6' },
  };

  var deck = [], first = null, lock = false, moves = 0, matched = 0, pairs = 0;
  var seconds = 0, timer = null, diff = 'easy', playing = false;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function startTimer() {
    if (timer) return;
    timer = setInterval(function () {
      if (M.gamePaused()) return;
      seconds += 1;
      timeText.textContent = M.fmt.clock(seconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timer);
    timer = null;
  }

  function setup(which) {
    diff = which;
    G.update(function (d) { d.settings.difficulty = which; }); // 记住难度偏好
    var cols = DIFFS[which].cols;
    pairs = (cols * cols) / 2;
    deck = [];
    var chosen = shuffle(ICONS.slice()).slice(0, pairs);
    chosen.forEach(function (icon) { deck.push(icon, icon); });
    shuffle(deck);

    first = null; lock = false; moves = 0; matched = 0; seconds = 0; playing = false;
    stopTimer();
    timeText.textContent = '0:00';
    M.hud.label('score', '步数');
    M.hud.score(0);
    var prevBest = G.load().data.best[which];
    M.hud.best(prevBest && prevBest.moves > 0 ? prevBest.moves + ' 步' : '—');

    grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    grid.innerHTML = '';
    deck.forEach(function (icon, index) {
      // 卡片是真正的按钮：键盘可聚焦、Enter/Space 可翻牌，读屏能播报位置与状态。
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'mem-card';
      card.innerHTML =
        '<div class="mem-inner">' +
        '  <div class="mem-face mem-front" aria-hidden="true"></div>' +
        '  <div class="mem-face mem-back" aria-hidden="true"></div>' +
        '</div>';
      card.querySelector('.mem-back').textContent = icon;
      card.dataset.iconName = ICON_NAMES[ICONS.indexOf(icon)] || '花';
      cardLabel(card, index, cols);
      card.addEventListener('click', function () { flip(card, icon); });
      grid.appendChild(card);
    });
  }

  /* 位置 + 状态写进 aria-label；牌面本身 aria-hidden，避免读屏念表情符号。 */
  function cardLabel(card, index, cols) {
    var base = '第 ' + (Math.floor(index / cols) + 1) + ' 行第 ' + (index % cols + 1) + ' 列';
    var name = card.dataset.iconName;
    if (card.classList.contains('done')) card.setAttribute('aria-label', base + '，已配对，' + name);
    else if (card.classList.contains('open')) card.setAttribute('aria-label', base + '，已翻开，' + name);
    else card.setAttribute('aria-label', base + '，未翻开');
  }

  function refreshLabels() {
    var cols = DIFFS[diff].cols;
    Array.prototype.forEach.call(grid.children, function (card, index) { cardLabel(card, index, cols); });
  }

  function flip(card, icon) {
    if (lock || !card || card.classList.contains('open') || card.classList.contains('done')) return;
    startTimer();
    playing = true;
    card.classList.add('open');
    cardLabel(card, Array.prototype.indexOf.call(grid.children, card), DIFFS[diff].cols);
    if (!first) {
      first = { card: card, icon: icon };
      return;
    }
    moves += 1;
    M.hud.score(moves);
    if (first.icon === icon) {
      first.card.classList.add('done');
      card.classList.add('done');
      first = null;
      matched += 1;
      refreshLabels();
      M.announce('配对成功：' + (card.dataset.iconName || '花'), true);
      if (matched === pairs) win();
    } else {
      lock = true;
      var a = first.card, b = card;
      first = null;
      M.announce('不配对，' + (a.dataset.iconName || '花') + ' 与 ' + (b.dataset.iconName || '花'), true);
      setTimeout(function () {
        a.classList.remove('open');
        b.classList.remove('open');
        lock = false;
        refreshLabels();
      }, 650);
    }
  }

  function win() {
    stopTimer();
    playing = false;
    var prev = G.load().data.best[diff] || { moves: 0, seconds: 0 };
    var newMoves = prev.moves === 0 || moves < prev.moves;
    var newTime = prev.seconds === 0 || seconds < prev.seconds;
    G.update(function (d) {
      d.stats.games += 1;
      d.settings.difficulty = diff;
      if (!d.best[diff]) d.best[diff] = { moves: 0, seconds: 0 };
      if (d.best[diff].moves === 0 || moves < d.best[diff].moves) d.best[diff].moves = moves;
      if (d.best[diff].seconds === 0 || seconds < d.best[diff].seconds) d.best[diff].seconds = seconds;
    });
    M.hud.best(G.load().data.best[diff].moves > 0 ? G.load().data.best[diff].moves + ' 步' : '—');
    M.overlay(stage, {
      title: '全部配对！',
      lines: [
        DIFFS[diff].label + '：' + moves + ' 步，用时 ' + M.fmt.seconds(seconds),
        (newMoves || newTime) ? '新纪录！' : '最好成绩 ' + G.load().data.best[diff].moves + ' 步',
      ],
      actions: [
        { label: '再来一次', primary: true, onClick: function () { setup(diff); } },
        { label: '换个难度', onClick: showStart },
      ],
    });
  }

  function showStart() {
    var bestEasy = G.load().data.best.easy || {};
    var bestHard = G.load().data.best.hard || {};
    M.hud.reset();
    M.hud.label('score', '步数'); // 首屏就用对标签，不留「得分」到选完难度才改
    M.hud.extra(timeText);
    M.overlay(stage, {
      intro: true,
      label: '选择难度',
      title: '记忆翻牌',
      lines: [
        '点击卡片翻牌，找出所有成对的花',
        bestEasy.moves ? ('简单 4×4 纪录：' + bestEasy.moves + ' 步') : '简单 4×4：还没有纪录',
        bestHard.moves ? ('困难 6×6 纪录：' + bestHard.moves + ' 步') : '困难 6×6：还没有纪录',
      ],
      actions: [
        { label: '简单 4×4', primary: true, onClick: function () { setup('easy'); } },
        { label: '困难 6×6', primary: true, onClick: function () { setup('hard'); } },
      ],
    });
  }

  M.onRestart(showStart);
  showStart();
})(window.App);
