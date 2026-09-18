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

  /* —— 读屏播报 ——
     离散事件（失误、暂停、重开）用 M.announce(text, true) 立即播报；
     分数/最佳这类高频变化不逐次播报，按 5 秒节流合并成一句，避免持续打断。
     #hud 本身是带 aria-label 的 group，辅助技术可以随时主动读取当前值。 —— */
  var liveEl = null, hudTimer = null, hudAnnouncedAt = 0, hudLastText = '';
  function live() {
    if (!liveEl) {
      liveEl = document.createElement('p');
      liveEl.className = 'sr-only';
      liveEl.setAttribute('role', 'status');
      liveEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(liveEl);
    }
    return liveEl;
  }
  function hudText() {
    var parts = [];
    var label = document.getElementById('hud-score-label'), score = document.getElementById('hud-score');
    if (score) parts.push((label ? label.textContent : '得分') + ' ' + score.textContent);
    var best = document.getElementById('hud-best');
    if (best) parts.push('最佳 ' + best.textContent);
    return parts.join('，');
  }
  function scheduleHudAnnounce() {
    if (hudTimer) return;
    hudTimer = setTimeout(function () {
      hudTimer = null;
      var text = hudText();
      if (!text || text === hudLastText) return;
      hudAnnouncedAt = Date.now(); hudLastText = text;
      live().textContent = text;
    }, Math.max(0, 5000 - (Date.now() - hudAnnouncedAt)));
  }
  M.announce = function (text, immediate) {
    if (!text) return;
    if (immediate) {
      clearTimeout(hudTimer); hudTimer = null;
      hudLastText = '';
      live().textContent = text;
      return;
    }
    scheduleHudAnnounce();
  };

  /* —— HUD —— */
  var hud = {
    score: function (v) {
      var el = document.getElementById('hud-score');
      if (el && v !== undefined && v !== null) el.textContent = v;
      scheduleHudAnnounce();
    },
    best: function (v) {
      var el = document.getElementById('hud-best');
      if (el) el.textContent = v === undefined || v === null || v === '' ? '—' : v;
      scheduleHudAnnounce();
    },
    label: function (name, text) {
      var el = document.getElementById('hud-' + name + '-label');
      if (el) el.textContent = text;
      scheduleHudAnnounce();
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
  /* 覆盖层也是「非游玩中」状态：它的按键不应该驱动背景游戏。 */
  M.gamePaused = function () {
    return !!document.querySelector('dialog[open]') || !!document.querySelector('.overlay') || !!M.manualPause;
  };

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

  /* —— 覆盖层（开始 / 结束 / 暂停）——
     同一舞台同时只保留一个覆盖层，新覆盖层出现时旧的先移除，
     避免结算卡叠在新一局之上。覆盖层是 role="dialog"：出现时接管焦点、
     Tab 在内部循环、关闭后把焦点还给原来的位置。 —— */
  M.clearOverlays = function (stage) {
    var host = stage || document.getElementById('stage');
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('.overlay'), function (node) { node.remove(); });
    host.style.minHeight = '';
  };

  var overlaySeq = 0;
  M.overlay = function (stage, opts) {
    opts = opts || {};
    var host = stage;
    M.clearOverlays(host);
    var previous = document.activeElement;
    if (!host.style.minHeight) host.style.minHeight = 'min(84vw, 430px)';
    if (!host.hasAttribute('tabindex')) host.setAttribute('tabindex', '-1');
    if (opts.intro) {
      host.dataset.instructions = (opts.lines || []).join('\n');
      opts = Object.assign({}, opts, { title: '', lines: [] });
    }
    var actions = opts.actions && opts.actions.length ? opts.actions : [{ label: '开 始', primary: true }];
    var seq = ++overlaySeq;
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    var card = document.createElement('div');
    card.className = 'overlay-card';
    if (opts.title) {
      var t = document.createElement('h2');
      t.className = 'overlay-title'; t.id = 'overlay-title-' + seq;
      t.textContent = opts.title;
      card.appendChild(t);
      ov.setAttribute('aria-labelledby', t.id);
    } else {
      // 无标题时用动作名兜底，读屏也能知道这个覆盖层在问什么。
      ov.setAttribute('aria-label', opts.label || actions[0].label);
    }
    if (opts.lines && opts.lines.length) {
      var p = document.createElement('p');
      p.className = 'overlay-lines'; p.id = 'overlay-lines-' + seq;
      p.textContent = opts.lines.join('\n');
      card.appendChild(p);
      ov.setAttribute('aria-describedby', p.id);
    }
    var choices = document.createElement('div');
    choices.className = 'choices';
    function close(fn) {
      var restore = previous;
      Array.prototype.forEach.call(host.querySelectorAll('.overlay'), function (node) { node.remove(); });
      host.style.minHeight = '';
      if (restore && restore !== document.body && restore.isConnected && restore.focus) restore.focus({ preventScroll: true });
      else host.focus({ preventScroll: true });
      if (fn) fn();
    }
    actions.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (a.primary ? ' primary' : '');
      b.textContent = a.label;
      b.addEventListener('click', function () { close(a.onClick); });
      choices.appendChild(b);
    });
    card.appendChild(choices);
    ov.appendChild(card);
    ov.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && typeof opts.onEscape === 'function') { e.preventDefault(); e.stopPropagation(); close(opts.onEscape); return; }
      if (e.key !== 'Tab') return;
      // 游戏会在返回后往 .choices 里补按钮，所以每次按键重新取可聚焦元素。
      var nodes = ov.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!nodes.length) return;
      var first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || !ov.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    host.appendChild(ov);
    (ov.querySelector('button') || card).focus({ preventScroll: true });
    return ov;
  };

  /* —— 通用确认弹窗（原生 dialog）——
     Escape 关闭、焦点被浏览器约束在弹窗内、关闭后归还焦点给触发元素。
     用于「会丢掉当前进度」的动作，例如 2048 的重新开始。 —— */
  M.confirm = function (opts) {
    opts = opts || {};
    if (document.querySelector('dialog.game-confirm[open]')) return null;
    var opener = document.activeElement;
    var dlg = document.createElement('dialog');
    dlg.className = 'game-confirm';
    var title = document.createElement('h2');
    title.id = 'game-confirm-title';
    title.textContent = opts.title || '确认操作';
    dlg.setAttribute('aria-labelledby', title.id);
    var copy = document.createElement('p');
    copy.textContent = opts.copy || '';
    var actions = document.createElement('div');
    actions.className = 'choices';
    var cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'btn';
    cancel.textContent = opts.cancelLabel || '取消';
    cancel.addEventListener('click', function () { dlg.close(); });
    var ok = document.createElement('button');
    ok.type = 'button'; ok.className = 'btn primary';
    ok.textContent = opts.confirmLabel || '确定';
    ok.addEventListener('click', function () { dlg.close(); if (opts.onConfirm) opts.onConfirm(); });
    actions.appendChild(cancel); actions.appendChild(ok);
    dlg.appendChild(title); dlg.appendChild(copy); dlg.appendChild(actions);
    dlg.addEventListener('close', function () {
      if (opener && opener !== document.body && opener.isConnected && opener.focus) opener.focus({ preventScroll: true });
      else {
        var stage = document.getElementById('stage');
        if (stage) { if (!stage.hasAttribute('tabindex')) stage.setAttribute('tabindex', '-1'); stage.focus({ preventScroll: true }); }
      }
      dlg.remove();
    });
    document.body.appendChild(dlg);
    dlg.showModal();
    cancel.focus();
    return dlg;
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
  /* 开关类按钮要暴露当前状态：名称固定为「亮暗模式」，亮暗由 aria-pressed 表达。
     首屏主题由 layout 内联脚本设置，因此这里必须主动同步一次初始值。 */
  function syncToggle(t) {
    if (!toggleBtn) return;
    toggleBtn.setAttribute('aria-pressed', String(t === 'dark'));
  }
  syncToggle(themeRoot.dataset.theme);
  window.addEventListener('themechange', function () { syncToggle(themeRoot.dataset.theme); });
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

  /* —— 壁纸（app:appearance 的亮暗两张图，全站共用）——
     自定义图顶替默认油画：--oil-texture 给内页底纹、--oil-painting 给主页整页画面。
     写成行内自定义属性，两套主题各用自己那张；没有自定义就移除，回落到 CSS 里的默认油画。 */
  function applyWallpaper(data) {
    var image = (data && (M.theme.isDark() ? data.heroImageDark : data.heroImage)) || null;
    var root = document.documentElement;
    if (image) {
      root.style.setProperty('--oil-painting', 'url("' + image + '")');
      root.style.setProperty('--oil-texture', 'url("' + image + '")');
    } else {
      root.style.removeProperty('--oil-painting');
      root.style.removeProperty('--oil-texture');
    }
    root.classList.toggle('has-custom-wallpaper', !!image);
  }
  function syncWallpaper() {
    var state = M.store.load('app', 'appearance');
    if (!state.fromFuture) applyWallpaper(state.data);
  }
  syncWallpaper();
  window.addEventListener('themechange', syncWallpaper);
  M.wallpaper = { apply: applyWallpaper, sync: syncWallpaper };
})(window.App);
