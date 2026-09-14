/* 游戏页共用：控制分层、原生设置弹窗与按剩余视口测量的舞台。 */
(function () {
  'use strict';
  var stage = document.getElementById('stage');
  if (!stage) return;
  var game = stage.dataset.game, shell = stage.closest('.game-shell');
  var ver = new URL(document.currentScript.src).search;
  document.body.classList.add('is-game');
  stage.classList.add('unified-stage');
  function icon(button, name, label) {
    if (!button) return;
    label = label || button.textContent.trim();
    button.setAttribute('aria-label', label); button.title = label;
    button.classList.add('game-icon-button');
    button.innerHTML = '<span class="ti" aria-hidden="true" style="--icon:url(/static/vendor/bootstrap-icons/' + name + '.svg' + ver + ')"></span>';
  }
  function move(selector, target) {
    var node = document.querySelector(selector);
    if (node && target) target.appendChild(node);
    return node;
  }
  var dialog, content, trigger;
  var prefix = game === 'gomoku' ? 'gm' : game === 'go' ? 'go' : null;
  if (prefix) {
    dialog = document.getElementById(prefix + '-settings-dialog');
    content = dialog.querySelector('.' + prefix + '-settings-scroll > aside');
    trigger = document.getElementById(prefix + '-open-settings');
    var settings = move(prefix === 'gm' ? '.gm-controls .gm-settings' : '.go-new-settings', content);
    if (settings) content.prepend(settings);
    move('#' + prefix + '-review', content);
    move('#' + prefix + '-resign', content);
    icon(document.getElementById(prefix + '-undo'), 'arrow-counterclockwise');
    // 停一手、提示等没有通行图形含义，保留动作文字。
    // 开始新局后收起设置弹窗，与象棋和其余游戏的重新开始一致；需要确认换代时
    // 各游戏会自己弹出确认弹窗，那种情况下留到确认之后再收。
    [prefix + '-new', prefix + '-accept-new'].forEach(function (id) {
      var button = document.getElementById(id);
      if (!button) return;
      button.addEventListener('click', function () {
        var others = Array.prototype.some.call(document.querySelectorAll('dialog[open]'), function (open) { return open !== dialog; });
        if (!others) dialog.close();
      });
    });
  } else if (game !== 'sandstrike') {
    dialog = document.createElement('dialog');
    dialog.className = 'game-settings'; dialog.id = 'game-settings';
    dialog.setAttribute('aria-labelledby', 'game-settings-title');
    dialog.innerHTML = '<header><h2 id="game-settings-title">设置</h2><button type="button" class="btn" autofocus>完成</button></header><div class="game-settings-content"></div>';
    stage.appendChild(dialog); content = dialog.lastElementChild;
    trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'btn';
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-controls', dialog.id);
    icon(trigger, 'gear', '设置');
    trigger.addEventListener('click', function () { dialog.showModal(); });
    dialog.querySelector('header button').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('close', function () { trigger.focus({ preventScroll: true }); });
    if (game === 'chess') {
      var sidebar = stage.querySelector('.chess-sidebar');
      sidebar.appendChild(trigger);
      ['.chess-new-section', '.chess-history-section', '.chess-rules', '#chess-export', '#chess-resign', '.chess-help'].forEach(function (selector) { move(selector, content); });
      move('#chess-live', sidebar);
      stage.querySelector('#chess-history').addEventListener('click', function (event) { if (event.target.closest('button')) dialog.close(); });
      icon(document.getElementById('chess-undo'), 'arrow-counterclockwise');
      icon(document.getElementById('chess-flip'), 'arrow-down-up');
      document.getElementById('chess-new').addEventListener('click', function () { dialog.close(); });
      document.getElementById('chess-resign').addEventListener('click', function () { dialog.close(); });
    } else {
      document.getElementById('hud').appendChild(trigger);
      move('[data-hud="best"]', content);
      // 重新开始会打开难度/开局选项；保留原来的游戏事件处理器。
      move('#btn-restart', content);
      document.getElementById('btn-restart').addEventListener('click', function () { dialog.close(); });
    }
  }
  if (content) {
    var hint = move('.hint-line', content);
    if (hint) hint.classList.add('game-instructions');
    move('.game-shell > .notice', content);
    var footer = document.querySelector('body > .site-footer');
    if (footer) content.appendChild(footer);
  }
  icon(shell.querySelector('.back-link'), 'arrow-right', '全部游戏');
  var back = shell.querySelector('.back-link'); back.classList.add('game-back');
  document.querySelector('.site-header').insertBefore(back, document.querySelector('.header-actions'));
  shell.querySelectorAll('.gomoku-back-row, .go-back-row').forEach(function (row) { row.remove(); });

  if (game === 'sandstrike') {
    var fpsCredits = document.querySelector('body > .site-footer');
    var fpsObserver = new MutationObserver(function () {
      stage.querySelectorAll('[data-move]:not(.game-icon-button)').forEach(function (button) {
        var rotations = { KeyW: -90, KeyA: 180, KeyS: 90, KeyD: 0 };
        icon(button, 'arrow-right', button.getAttribute('aria-label'));
        button.firstElementChild.style.transform = 'rotate(' + rotations[button.dataset.move] + 'deg)';
      });
      var help = stage.querySelector('.fps-help');
      if (help && fpsCredits && !help.contains(fpsCredits)) help.appendChild(fpsCredits);
    });
    fpsObserver.observe(stage, { childList: true, subtree: true });
  }
  icon(document.getElementById('tetris-pause'), 'pause');
  if (game === 'snake' || game === 'swipe') {
    var pause = document.createElement('button'); pause.type = 'button'; pause.className = 'btn';
    icon(pause, 'pause', '暂停游戏');
    document.getElementById('hud').appendChild(pause);
    function syncPause() { pause.disabled = !!stage.querySelector('.overlay'); }
    new MutationObserver(syncPause).observe(stage, { childList: true }); syncPause();
    pause.addEventListener('click', function () {
      window.App.manualPause = !window.App.manualPause;
      pause.setAttribute('aria-pressed', String(window.App.manualPause));
      icon(pause, window.App.manualPause ? 'play' : 'pause', window.App.manualPause ? '继续游戏' : '暂停游戏');
    });
  }
  if (content && stage.dataset.instructions) {
    var instructions = document.createElement('p'); instructions.className = 'game-instructions';
    instructions.textContent = stage.dataset.instructions; content.appendChild(instructions);
  }
  // 原生弹窗中的按键不能同时驱动背景游戏。
  window.addEventListener('keydown', function (event) {
    if (document.querySelector('dialog[open]')) event.stopImmediatePropagation();
  }, true);
  var frame = stage.querySelector('.gm-board-frame, .go-board-frame, .chess-frame');
  var play = stage.querySelector('.gm-play, .go-play, .chess-play');
  var controls = stage.querySelector('.gm-controls, .go-controls, .chess-sidebar');
  var layout = stage.querySelector('.gm-layout, .go-layout, .chess-layout');
  var raf = 0;
  function fit() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      var rect = stage.getBoundingClientRect();
      if (frame) {
        var wide = window.innerWidth >= 700;
        stage.classList.toggle('game-side-controls', wide);
        // 对称预留操作栏空间，棋盘中心始终落在屏幕中轴。
        var width = Math.max(80, rect.width - (wide ? 208 : 0));
        var notice = stage.querySelector('.gm-notice, .go-notice, .chess-notice');
        var height = rect.height - (notice && !notice.hidden ? notice.offsetHeight + 8 : 0);
        if (!wide) height -= controls.offsetHeight + 8;
        var overhead = play.getBoundingClientRect().height - frame.getBoundingClientRect().height;
        var size = Math.floor(Math.max(80, Math.min(width, height - overhead - 4)));
        play.style.width = size + 'px';
        stage.style.setProperty('--gm-size', size + 'px'); stage.style.setProperty('--go-size', size + 'px');
        stage.classList.toggle('gm-compact', size < 340); stage.classList.toggle('go-compact', size < 340);
      } else if (game !== 'sandstrike') {
        var area = shell.getBoundingClientRect();
        var top = stage.getBoundingClientRect().top;
        var available = Math.max(80, area.bottom - top);
        var width = shell.clientWidth;
        if (game === 'tetris') {
          var tetrisWide = window.innerWidth >= 700;
          stage.classList.toggle('game-tetris-wide', tetrisWide);
          var boardWidth = Math.max(40, Math.min((available - 16 - (tetrisWide ? 0 : 80)) / 2, width - (tetrisWide ? 248 : 16)));
          stage.style.width = (boardWidth + 16) + 'px';
          stage.querySelector('.tetris-wrap > .canvas-frame canvas').style.setProperty('width', boardWidth + 'px');
          stage.querySelector('.tetris-wrap > .canvas-frame canvas').style.setProperty('height', boardWidth * 2 + 'px');
        } else {
          var extra = stage.querySelector('.swipe-meta');
          var size = Math.floor(Math.min(width, available - (extra ? extra.offsetHeight + 14 : 0)));
          stage.style.width = Math.max(80, size) + 'px';
        }
      }
    });
  }
  if (frame) {
    // 将即时控制移至同一布局层，避免它参与棋盘高度计算。
    layout.appendChild(controls);
    controls.classList.add('game-live-controls');
    var observer = new ResizeObserver(fit);
    [stage, play, controls].forEach(function (node) { observer.observe(node); });
  } else {
    new ResizeObserver(fit).observe(shell);
  }
  window.addEventListener('resize', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  fit();
})();
