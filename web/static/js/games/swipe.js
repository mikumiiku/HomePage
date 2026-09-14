/* 指尖旋律 · 划出方向：限时 30 秒，跟着箭头滑动，连击越长分越高 */
(function (M) {
  'use strict';
  var stage = M.stage('swipe');
  var G = M.savegame('swipe');

  var ROUND = 30; // 秒
  var ARROWS = {
    up: { glyph: '↑', color: '#7fa3b8' },
    down: { glyph: '↓', color: '#86a678' },
    left: { glyph: '←', color: '#8a76b8' },
    right: { glyph: '→', color: '#d98aa9' },
  };
  var DIR_NAMES = Object.keys(ARROWS);

  var tile = document.createElement('div');
  tile.className = 'swipe-tile';
  var arrow = document.createElement('div');
  arrow.className = 'swipe-arrow';
  var barTrack = document.createElement('div');
  barTrack.className = 'swipe-bar-track';
  var bar = document.createElement('div');
  bar.className = 'swipe-bar';
  barTrack.appendChild(bar);
  tile.appendChild(arrow);
  tile.appendChild(barTrack);
  stage.appendChild(tile);

  var meta = document.createElement('div');
  meta.className = 'swipe-meta';
  meta.innerHTML =
    '<span>连击 <b id="sw-combo">0</b></span>' +
    '<span>生命 <b id="sw-lives">❤❤❤</b></span>' +
    '<span>剩余 <b id="sw-time">30s</b></span>';
  stage.appendChild(meta);

  var score = 0, combo = 0, lives = 3, timeLeft = ROUND;
  var currentDir = null, deadline = 0, windowMs = 1800;
  var running = false, roundTimer = null;

  function setHud() {
    M.hud.score(score);
    document.getElementById('sw-combo').textContent = combo;
    document.getElementById('sw-lives').textContent = lives > 0 ? '❤'.repeat(lives) : '—';
    document.getElementById('sw-time').textContent = timeLeft + 's';
  }

  function nextArrow() {
    var dir = DIR_NAMES[Math.floor(Math.random() * DIR_NAMES.length)];
    currentDir = dir;
    windowMs = Math.max(700, 1800 - score * 8);
    deadline = Date.now() + windowMs;
    var a = ARROWS[dir];
    arrow.textContent = a.glyph;
    arrow.style.color = a.color;
    arrow.classList.remove('wrong');
    tile.style.setProperty('--tile-accent', a.color);
    bar.style.transition = 'none';
    bar.style.width = '100%';
    void bar.offsetWidth;
    bar.style.transition = 'width ' + windowMs + 'ms linear';
    bar.style.width = '0%';
  }

  function judge(dir) {
    if (!running) return;
    if (dir === currentDir) {
      score += 10 + combo * 2;
      combo += 1;
      tile.classList.add('hit');
      setTimeout(function () { tile.classList.remove('hit'); }, 110);
      setHud();
      nextArrow();
    } else {
      loseLife(true);
    }
  }

  function loseLife(wrongInput) {
    lives -= 1;
    combo = 0;
    if (wrongInput) {
      arrow.classList.add('wrong');
      setTimeout(function () { arrow.classList.remove('wrong'); }, 160);
    }
    setHud();
    if (lives <= 0) {
      end('三次失误');
      return;
    }
    nextArrow();
  }

  function tick() {
    timeLeft -= 0.1;
    if (timeLeft <= 0) {
      timeLeft = 0;
      setHud();
      end('30 秒时间到');
      return;
    }
    if (currentDir && Date.now() > deadline) {
      loseLife(false);
      return;
    }
    document.getElementById('sw-time').textContent = Math.ceil(timeLeft) + 's';
  }

  function start() {
    score = 0; combo = 0; lives = 3; timeLeft = ROUND;
    running = true;
    setHud();
    nextArrow();
    clearInterval(roundTimer);
    roundTimer = setInterval(tick, 100);
  }

  function end(reason) {
    running = false;
    clearInterval(roundTimer);
    bar.style.transition = 'none';
    bar.style.width = '0%';
    G.update(function (d) {
      d.stats.games += 1;
      d.stats.arrows += score >= 10 ? Math.floor(score / 10) : 0;
      if (score > (d.best.score || 0)) d.best.score = score;
      if (combo > (d.best.combo || 0)) d.best.combo = combo;
    });
    var best = G.load().data.best;
    M.hud.best(best.score || 0);
    M.overlay(stage, {
      title: '游戏结束',
      lines: [
        reason + '，得分 ' + score,
        best.score && score >= best.score ? '新纪录！最高连击 ' + best.combo : '最高纪录 ' + (best.score || 0) + ' 分',
      ],
      actions: [{ label: '再来一局', primary: true, onClick: start }],
    });
  }

  M.onSwipe(tile, judge);
  /* 电脑上也能用方向键试玩（游戏仍标注为手机版） */
  M.onDirectionKeys(judge);
  M.onRestart(start);

  var best0 = G.load().data.best;
  M.hud.best(best0.score || 0);
  setHud();
  arrow.textContent = '♪';
  arrow.style.color = '#7fa3b8';
  bar.style.width = '0%';
  M.overlay(stage, {
    title: '指尖快划',
    lines: [
      '看清箭头方向，立刻往那边滑动',
      '连击越长加分越多，三次失误或 30 秒到就结束',
      best0.score ? ('最高纪录 ' + best0.score + ' 分') : '还没有纪录',
    ],
    actions: [{ label: '开始游戏', primary: true, onClick: start }],
  });
})(window.App);
