/* 站内通用工具：HUD、覆盖层、输入（键盘/滑动）、格式化。
 * 游戏脚本只依赖这里的接口，不直接碰 DOM 骨架。 */
(function (M) {
  'use strict';

  /* —— 设备粗判（仅用于文案展示；首页列表过滤以服务端 UA 检测为准） —— */
  var isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  M.platform = { isTouch: isTouch, name: isTouch ? 'mobile' : 'desktop' };

  /* —— 自动记录游玩足迹（首页「最近在玩」） —— */
  var stageEl = document.getElementById('stage');
  if (stageEl && stageEl.dataset.game) {
    try { M.store.recordActivity(stageEl.dataset.game); } catch (e) { /* 存储失败不阻塞游戏 */ }
  }

  /* —— HUD —— */
  var hud = {
    score: function (v) {
      var el = document.getElementById('hud-score');
      if (el && v !== undefined && v !== null) el.textContent = v;
    },
    best: function (v) {
      var el = document.getElementById('hud-best');
      if (el) el.textContent = v === undefined || v === null || v === '' ? '—' : v;
    },
    label: function (name, text) {
      var el = document.getElementById('hud-' + name + '-label');
      if (el) el.textContent = text;
    },
    /* extra 芯片：给游戏放第二指标或开关按钮（可多次调用追加），返回该芯片元素 */
    extra: function (el) {
      var chip = document.getElementById('hud-extra');
      if (!chip) return null;
      if (el) {
        chip.appendChild(el);
        chip.hidden = false;
      }
      return chip;
    },
    reset: function () {
      hud.score(0);
      hud.best('—');
      var chip = document.getElementById('hud-extra');
      if (chip) { chip.hidden = true; chip.innerHTML = ''; }
    },
  };
  M.hud = hud;
  M.gamePaused = function () { return !!document.querySelector('dialog[open]') || !!M.manualPause; };

  /* —— 顶栏「重新开始」按钮 —— */
  M.onRestart = function (fn) {
    var btn = document.getElementById('btn-restart');
    if (btn) btn.addEventListener('click', fn);
  };

  /* —— 舞台元素（并校验脚本与页面匹配） —— */
  M.stage = function (expectedGameId) {
    var el = document.getElementById('stage');
    if (!el) throw new Error('页面缺少 #stage');
    if (expectedGameId && el.dataset.game !== expectedGameId) {
      throw new Error('游戏脚本与页面不匹配: ' + expectedGameId);
    }
    return el;
  };

  /* —— 覆盖层（开始 / 结束 / 暂停）。
     舞台内容为空（如开局前）时覆盖层会塌陷，这里负责给舞台临时撑起最小高度 —— */
  M.overlay = function (stage, opts) {
    var hadMinHeight = !!stage.style.minHeight;
    if (!hadMinHeight) stage.style.minHeight = 'min(84vw, 430px)';
    if (opts.intro) {
      stage.dataset.instructions = (opts.lines || []).join('\n');
      opts = Object.assign({}, opts, { title: '', lines: [] });
    }
    var ov = document.createElement('div');
    ov.className = 'overlay';
    var card = document.createElement('div');
    card.className = 'overlay-card';
    if (opts.title) {
      var t = document.createElement('h2');
      t.className = 'overlay-title';
      t.textContent = opts.title;
      card.appendChild(t);
    }
    if (opts.lines && opts.lines.length) {
      var p = document.createElement('p');
      p.className = 'overlay-lines';
      p.textContent = opts.lines.join('\n');
      card.appendChild(p);
    }
    var choices = document.createElement('div');
    choices.className = 'choices';
    (opts.actions || [{ label: '开 始', primary: true }]).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (a.primary ? ' primary' : '');
      b.textContent = a.label;
      b.addEventListener('click', function () {
        ov.remove();
        if (!stage.querySelector('.overlay')) stage.style.minHeight = '';
        if (a.onClick) a.onClick();
      });
      choices.appendChild(b);
    });
    card.appendChild(choices);
    ov.appendChild(card);
    stage.appendChild(ov);
    return ov;
  };

  /* —— 轻提示 —— */
  var toastTimer = null;
  M.toast = function (msg) {
    var el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, 2200);
  };

  /* —— 键盘方向（含 WASD），触发时阻止页面滚动 —— */
  M.onDirectionKeys = function (handler) {
    var map = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down',
      A: 'left', D: 'right', W: 'up', S: 'down',
    };
    var fn = function (e) {
      if (M.gamePaused()) return;
      var dir = map[e.key];
      if (dir) {
        e.preventDefault();
        handler(dir);
      }
    };
    window.addEventListener('keydown', fn);
    return function () { window.removeEventListener('keydown', fn); };
  };

  /* —— 滑动手势（Pointer Events，触屏与鼠标拖拽通用） —— */
  M.onSwipe = function (el, handler) {
    if (!el) return function () {};
    var sx = 0, sy = 0, active = false, pid = null;
    var THRESHOLD = 24;
    el.addEventListener('pointerdown', function (e) {
      active = true; pid = e.pointerId; sx = e.clientX; sy = e.clientY;
    });
    el.addEventListener('pointermove', function (e) {
      if (!active || e.pointerId !== pid) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
      var dir;
      if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
      else dir = dy > 0 ? 'down' : 'up';
      active = false;
      handler(dir, e);
    });
    function end(e) { if (e.pointerId === pid) active = false; }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };

  /* —— 格式化 —— */
  M.fmt = {
    clock: function (s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
    seconds: function (s) {
      var m = Math.floor(s / 60);
      return m > 0 ? m + ' 分 ' + (s % 60) + ' 秒' : s + ' 秒';
    },
    ago: function (t) {
      var min = Math.floor(Math.max(0, Date.now() - t) / 60000);
      if (min < 1) return '刚刚';
      if (min < 60) return min + ' 分钟前';
      var h = Math.floor(min / 60);
      if (h < 24) return h + ' 小时前';
      return Math.floor(h / 24) + ' 天前';
    },
  };

  /* —— 绑定某游戏存档槽位的便捷句柄 —— */
  M.savegame = function (gameId, slotName) {
    var name = slotName || 'main';
    return {
      load: function () { return M.store.load(gameId, name); },
      save: function (d) { return M.store.save(gameId, name, d); },
      update: function (fn) { return M.store.update(gameId, name, fn); },
      recordBest: function (patch, better) { return M.store.recordBest(gameId, name, patch, better); },
    };
  };

  /* —— 亮暗主题（首屏值由 layout 内联脚本提前设置） —— */
  M.theme = {
    isDark: function () { return document.documentElement.dataset.theme === 'dark'; },
    set: function (t) {
      document.documentElement.dataset.theme = t;
      try { M.store.update('app', 'appearance', function (d) { d.theme = t; }); } catch (e) { /* 无存储也能切 */ }
      window.dispatchEvent(new Event('themechange'));
    },
  };
  // 整页快照只做透明度合成：渐变、纹理和 canvas 与文字一起换色。
  // 保持 set 同步，游戏和首屏初始化不依赖动画生命周期。
  var toggleBtn = document.getElementById('theme-toggle');
  var themeRoot = document.documentElement;
  var themeMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var desiredTheme = themeRoot.dataset.theme;
  var themeTransition = null;
  function settleTheme() {
    if (themeTransition || desiredTheme === themeRoot.dataset.theme) return;
    var target = desiredTheme;
    if (!document.startViewTransition || themeMotion.matches || document.hidden) {
      M.theme.set(target);
      return;
    }
    themeRoot.classList.add('theme-changing');
    try {
      themeTransition = document.startViewTransition(function () {
        M.theme.set(target);
      });
    } catch (e) {
      themeRoot.classList.remove('theme-changing');
      M.theme.set(target);
      return;
    }
    // 页面隐藏、导航或浏览器跳过快照时也必须完成清理，不能留下未处理拒绝。
    themeTransition.ready.catch(function () {});
    themeTransition.updateCallbackDone.catch(function () {});
    var finish = function () {
      themeTransition = null;
      themeRoot.classList.remove('theme-changing');
      settleTheme();
    };
    themeTransition.finished.then(finish, finish);
  }
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      if (!themeTransition) desiredTheme = themeRoot.dataset.theme;
      desiredTheme = desiredTheme === 'dark' ? 'light' : 'dark';
      settleTheme();
    });
  }
  themeMotion.addEventListener('change', function () {
    if (themeMotion.matches && themeTransition) themeTransition.skipTransition();
  });
})(window.App);
