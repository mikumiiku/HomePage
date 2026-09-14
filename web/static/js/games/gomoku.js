(function (M, E, AI) {
  'use strict';
  var stage = M.stage('gomoku'), savegame = M.savegame('gomoku');
  var source = new URL(document.currentScript.src), workerURL = new URL('gomoku-worker.js' + source.search, source);
  var key = M.store.PREFIX + 'gomoku:main', data, session, state, readonly = false, conflict = false;
  var worker = null, cancelFallback = null, watchdog = null, request = 0, busy = '', preview = -1, hint = -1, cursor = 112, review = null;
  var rawBefore = null, focusBefore = null, mounted = false;
  var names = { easy: '简单', normal: '普通', hard: '困难' };
  stage.closest('.game-shell').classList.add('gomoku-shell');
  document.getElementById('hud').hidden = true;
  stage.classList.add('gomoku-stage');
  stage.innerHTML = `
    <div class="gm-notice" id="gm-notice" role="status" hidden><span id="gm-notice-text"></span><button class="btn" id="gm-reload" hidden>加载最新进度</button><button class="btn" id="gm-export" hidden>导出原存档</button></div>
    <div class="gm-layout">
      <section class="gm-play" aria-label="五子棋对局">
        <div class="gm-players"><div class="gm-player" id="gm-black"><span class="gm-disc black" aria-hidden="true"></span><div><b id="gm-black-name"></b><span>黑棋 · 先手</span></div></div><div class="gm-turn"><span id="gm-count">0 手</span><div class="gm-status" id="gm-status" role="status" aria-live="polite"></div></div><div class="gm-player" id="gm-white"><span class="gm-disc white" aria-hidden="true"></span><div><b id="gm-white-name"></b><span>白棋 · 后手</span></div></div><button class="btn gm-settings-trigger" id="gm-open-settings" type="button" aria-label="设置" title="设置" aria-haspopup="dialog" aria-controls="gm-settings-dialog"><span class="ti" style="--icon:url(/static/vendor/bootstrap-icons/gear.svg${source.search})" aria-hidden="true"></span></button></div>
        <div class="gm-board-area"><div class="gm-board-frame"><div class="gm-axis gm-axis-top" aria-hidden="true"></div><div class="gm-axis gm-axis-left" aria-hidden="true"></div><div class="gm-board" id="gm-board" role="grid" aria-label="15 行 15 列五子棋棋盘" aria-rowcount="15" aria-colcount="15" aria-describedby="gm-status"></div><svg class="gm-line" viewBox="0 0 15 15" aria-hidden="true"><line id="gm-win-line" hidden /></svg></div>
        <div class="gm-board-controls" id="gm-board-controls" hidden><button class="btn primary" id="gm-confirm" hidden>确认落子</button></div>
        <div class="gm-review" id="gm-review-controls" hidden><button class="btn" data-review="first">首手</button><button class="btn" data-review="prev">上一步</button><span id="gm-review-count"></span><button class="btn" data-review="next">下一步</button><button class="btn" data-review="last">末手</button><button class="btn" data-review="exit">结束复盘</button></div>
        </div>
        <aside class="gm-controls gm-side" aria-label="对局操作与新局设置">
        <section class="gm-session-actions"><h3>本局操作</h3><div class="gm-actions"><button class="btn" id="gm-undo">悔棋</button><button class="btn" id="gm-hint">提示一步</button><button class="btn" id="gm-review" hidden>复盘本局</button></div></section>
        <section class="gm-settings"><h3>新局设置</h3><div class="gm-new-fields">
          <label for="gm-mode">对战方式</label><select id="gm-mode"><option value="ai">人机对战</option><option value="local">同屏双人</option></select>
          <div class="gm-ai-settings"><label for="gm-level">电脑难度</label><select id="gm-level"><option value="easy">简单</option><option value="normal">普通</option><option value="hard">困难</option></select><label for="gm-color">我的执棋</label><select id="gm-color"><option value="black">黑棋先手</option><option value="white">白棋后手</option><option value="random">随机执棋</option></select></div>
          </div><p class="gm-small">更改选项后，开始新局生效</p><button class="btn primary gm-new" id="gm-new">开始新局</button>
        </section>
        </aside>
      </section>
    </div>
    <dialog class="gm-settings-dialog" id="gm-settings-dialog" aria-labelledby="gm-settings-title">
      <header class="gm-panel-header"><h2 id="gm-settings-title">设置</h2><button class="btn" id="gm-close-settings" type="button" autofocus>完成</button></header>
      <div class="gm-settings-scroll"><p class="gm-settings-notice" id="gm-settings-notice" role="status" hidden></p>
      <aside class="gm-side" aria-label="对局设置与棋谱">
        <section><h3>显示与落子</h3>
          <label class="gm-check"><input type="checkbox" id="gm-confirm-setting">确认后落子</label><label class="gm-check"><input type="checkbox" id="gm-numbers">显示手数</label>
        </section>
        <details class="gm-history-section"><summary>本局棋谱 <span id="gm-game-kind"></span></summary><p class="gm-small" id="gm-history-empty">尚未落子</p><ol class="gm-history" id="gm-history" aria-label="落子记录"></ol></details>
        <details><summary>规则与操作</summary><p>黑棋先行，双方轮流落子。横、竖或斜向连续五颗及以上同色棋子获胜，无禁手。棋盘下满无人获胜则为和棋。</p><p>点击交叉点落子。棋盘获得键盘焦点后，用方向键选择，Enter 或空格落子。开启确认后，可先调整位置再确认。</p><p>人机悔棋会撤回你最近一手及电脑回应。提示只标记位置。使用悔棋或提示的对局单独统计，不计最佳连胜；未完成的对局不计胜负。</p></details>
        <details><summary>本地战绩</summary><div id="gm-stats"></div><p class="gm-small">只保存在当前浏览器</p></details>
        <div id="gm-credits"></div>
      </aside>
      </div>
    </dialog>
    <dialog class="gm-dialog" id="gm-dialog" aria-labelledby="gm-dialog-title"><h2 id="gm-dialog-title">开始新局？</h2><p>当前对局将被替换，未完成的对局不计胜负。</p><div class="gm-actions"><button class="btn" id="gm-cancel-new" autofocus>继续本局</button><button class="btn primary" id="gm-accept-new">开始新局</button></div></dialog>`;
  function el(id) { return document.getElementById('gm-' + id); }
  var settingsDialog = el('settings-dialog');
  var footer = document.querySelector('.site-footer');
  if (footer) el('credits').appendChild(footer);
  function closeSettings() { if (settingsDialog.open) settingsDialog.close(); }
  el('open-settings').addEventListener('click', function () {
    gesture = null; pointers.clear();
    settingsDialog.showModal();
  });
  el('close-settings').addEventListener('click', closeSettings);
  settingsDialog.addEventListener('close', function () { el('open-settings').focus({ preventScroll: true }); });
  var boardEl = el('board'), cells = [];
  var fitFrame = 0;
  function fitBoard() {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(function () {
      var controls = el('board-controls'), reviewControls = el('review-controls');
      var noticeHeight = el('notice').hidden ? 0 : el('notice').offsetHeight + 12;
      var bottom = controls.hidden ? 0 : controls.offsetHeight + 10;
      if (!reviewControls.hidden) bottom += reviewControls.offsetHeight + 10;
      var width = stage.clientWidth, height = stage.clientHeight - noticeHeight;
      var side = window.matchMedia('(min-width: 900px), (min-width: 700px) and (max-height: 500px)').matches;
      stage.classList.toggle('gm-side-info', side);
      // Keep mobile intersections comfortably spaced; the controls follow in document flow.
      var size = Math.floor(side ? Math.max(240, Math.min(width - 304, height - 82 - bottom)) : Math.min(width, Math.max(240, window.innerHeight - 24)));
      stage.classList.toggle('gm-compact', size < 320);
      stage.style.setProperty('--gm-size', size + 'px');
    });
  }
  var fitObserver = new ResizeObserver(fitBoard);
  [stage, stage.querySelector('.gm-players'), el('notice'), el('board-controls'), el('review-controls')].forEach(function (node) { fitObserver.observe(node); });
  window.addEventListener('resize', fitBoard);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitBoard);
  for (var y = 0; y < 15; y++) {
    var row = document.createElement('div'); row.className = 'gm-row'; row.setAttribute('role', 'row');
    for (var x = 0; x < 15; x++) {
      var i = y * 15 + x, cell = document.createElement('div');
      cell.className = 'gm-cell'; cell.id = 'gm-cell-' + i; cell.dataset.index = i;
      cell.setAttribute('role', 'gridcell'); cell.setAttribute('aria-rowindex', y + 1); cell.setAttribute('aria-colindex', x + 1); cell.tabIndex = -1;
      if ([48, 56, 112, 168, 176].includes(i)) cell.classList.add('star');
      var stone = document.createElement('span'); stone.className = 'gm-stone'; stone.setAttribute('aria-hidden', 'true'); cell.appendChild(stone);
      row.appendChild(cell); cells.push(cell);
    }
    boardEl.appendChild(row);
    var top = document.createElement('span'); top.textContent = String.fromCharCode(65 + y); stage.querySelector('.gm-axis-top').appendChild(top);
    var left = document.createElement('span'); left.textContent = 15 - y; stage.querySelector('.gm-axis-left').appendChild(left);
  }
  function raw() { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function notice(message, reload, backup) {
    if (readonly) { backup = true; if (!message.includes('原存档')) message += ' 原存档已保留，当前为临时对局，可导出原存档备份。'; }
    el('notice').hidden = false; el('notice-text').textContent = message;
    el('settings-notice').hidden = false; el('settings-notice').textContent = message + ' 关闭设置后可查看提示和处理选项。';
    el('reload').hidden = !reload; el('export').hidden = !backup; fitBoard();
  }
  function defaults() { return { best: { streak: 0 }, stats: { buckets: {} }, settings: { mode: 'ai', level: 'normal', color: 'black', confirm: false, numbers: false }, session: null }; }
  function settingsValid(s) {
    return s && ['ai', 'local'].includes(s.mode) && Object.hasOwn(names, s.level) && ['black', 'white', 'random'].includes(s.color) && typeof s.confirm === 'boolean' && typeof s.numbers === 'boolean';
  }
  function validate(d) {
    if (!d || !settingsValid(d.settings) || !d.best || !Number.isInteger(d.best.streak) || d.best.streak < 0 || !d.stats || !d.stats.buckets || typeof d.stats.buckets !== 'object' || Array.isArray(d.stats.buckets)) throw new Error('存档结构无效');
    Object.entries(d.stats.buckets).forEach(function (entry) {
      if (!['ai:easy', 'ai:normal', 'ai:hard', 'local'].includes(entry[0])) return;
      ['wins', 'losses', 'draws', 'assisted', 'streak'].forEach(function (k) { if (!Number.isInteger(entry[1][k]) || entry[1][k] < 0) throw new Error('战绩无效'); });
    });
    if (d.session !== null) {
      var s = d.session;
      if (!s || typeof s.id !== 'string' || !settingsValid(s.settings) || ![1, 2].includes(s.human) || typeof s.assisted !== 'boolean' || typeof s.settled !== 'boolean') throw new Error('对局信息无效');
      var replay = E.replay(s.moves);
      if (s.result !== replay.result || (s.settled && s.result === null)) throw new Error('对局结果不一致');
    }
  }
  function syncSettings() {
    el('mode').value = data.settings.mode; el('level').value = data.settings.level; el('color').value = data.settings.color;
    el('confirm-setting').checked = data.settings.confirm; el('numbers').checked = data.settings.numbers;
    stage.querySelector('.gm-ai-settings').hidden = data.settings.mode !== 'ai';
  }
  function load() {
    cancel(); conflict = false; readonly = false; review = null; rawBefore = raw();
    el('notice').hidden = true; el('settings-notice').hidden = true;
    try {
      if (rawBefore !== null) {
        var envelope = JSON.parse(rawBefore);
        if (!envelope || !Number.isInteger(envelope.v) || envelope.v < 1 || !envelope.d) throw new Error('存档无法解析');
      }
      var loaded = savegame.load();
      if (loaded.fromFuture) throw new Error('存档来自更新版本');
      data = loaded.data; validate(data);
    } catch (e) {
      readonly = true; data = defaults(); notice('原存档无法读取，已保留。当前仅进行临时对局，可导出原存档备份。', false, true);
    }
    if (M.store.backendKind() !== 'local' && !readonly) notice('浏览器未开放本地存储，本次进度在关闭页面后不会保留。');
    syncSettings(); session = data.session;
    if (!session) newGame();
    else { state = E.replay(session.moves); preview = hint = -1; cursor = session.moves.at(-1) ?? 112; settle(); render(); schedule(); }
    mounted = true;
  }
  function save() {
    if (readonly || conflict) return false;
    if (M.store.backendKind() === 'local' && raw() !== rawBefore) { lockConflict(); return false; }
    data.session = session;
    if (!savegame.save(data)) { notice('无法保存进度，请检查浏览器存储空间；当前仍可继续对局。'); return false; }
    rawBefore = raw(); return true;
  }
  function lockConflict() {
    conflict = true; cancel(); preview = hint = -1;
    notice('另一页面已更新本局，已暂停操作，避免覆盖进度。请加载最新进度。', true);
    if (session) render();
  }
  function cancel() {
    request++; if (worker) worker.terminate(); worker = null;
    if (cancelFallback) cancelFallback(); cancelFallback = null;
    clearTimeout(watchdog); busy = '';
  }
  function newGame() {
    if (conflict) return;
    cancel(); review = null; preview = hint = -1; cursor = 112;
    var human = data.settings.color === 'random' ? (Math.random() < .5 ? 1 : 2) : data.settings.color === 'white' ? 2 : 1;
    session = { id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), settings: Object.assign({}, data.settings), human: human, moves: [], assisted: false, result: null, settled: false };
    data.session = session; state = E.replay([]); save(); render(); schedule();
  }
  function settle() {
    if (session.result === null || session.settled) return;
    var k = session.settings.mode === 'local' ? 'local' : 'ai:' + session.settings.level;
    var b = data.stats.buckets[k] || { wins: 0, losses: 0, draws: 0, assisted: 0, streak: 0 };
    if (session.assisted) { b.assisted++; b.streak = 0; }
    else {
      var win = session.result === (session.settings.mode === 'ai' ? session.human : 1);
      if (session.result === 0) b.draws++; else if (win) b.wins++; else b.losses++;
      b.streak = win ? b.streak + 1 : 0;
      if (session.settings.mode === 'ai') data.best.streak = Math.max(data.best.streak, b.streak);
    }
    data.stats.buckets[k] = b; session.settled = true; save();
  }
  function canMove() { return !conflict && review === null && state.result === null && !busy && (session.settings.mode === 'local' || state.turn === session.human); }
  function commit(i) {
    if (conflict) return;
    var next = E.play(session.moves, i); if (!next) return;
    session.moves.push(i); state = next; session.result = state.result; preview = hint = -1; cursor = i;
    settle(); save(); render(); schedule();
  }
  function select(i) {
    if (!E.valid(i)) return;
    cursor = i;
    if (canMove() && !state.board[i]) {
      if (data.settings.confirm) { preview = i; render(); }
      else commit(i);
    } else render();
  }
  function schedule() {
    if (!conflict && state.result === null && session.settings.mode === 'ai' && state.turn !== session.human) compute('move');
  }
  function compute(kind) {
    cancel(); busy = kind; preview = -1;
    var token = request, gameID = session.id, snapshot = session.moves.slice(), fallbackUsed = false;
    render();
    function receive(i) {
      if (request !== token || session.id !== gameID || conflict || session.moves.length !== snapshot.length) return;
      if (!E.valid(i) || state.board[i]) { fallback(); return; }
      cancel();
      if (kind === 'hint') { hint = i; cursor = i; render(); }
      else commit(i);
    }
    function fallback() {
      if (request !== token || fallbackUsed) return;
      fallbackUsed = true;
      if (worker) worker.terminate(); worker = null; clearTimeout(watchdog);
      notice('电脑搜索暂不可用，已切换为快速搜索，本局可继续游玩。');
      cancelFallback = AI.fallback(snapshot, receive);
    }
    try {
      worker = new Worker(workerURL);
      worker.onmessage = function (event) {
        var r = event.data;
        if (r.game !== gameID || r.request !== token) return;
        if (r.error) fallback(); else receive(r.move);
      };
      worker.onerror = function (event) { event.preventDefault(); fallback(); };
      worker.postMessage({ game: gameID, request: token, moves: snapshot, level: kind === 'hint' ? 'normal' : session.settings.level });
      watchdog = setTimeout(fallback, ({ easy: 150, normal: 600, hard: 2000 }[session.settings.level] || 600) + 3000);
    } catch (e) { fallback(); }
  }
  function humanLast() {
    for (var i = session.moves.length - 1; i >= 0; i--) if (i % 2 + 1 === session.human) return i;
    return -1;
  }
  function undo() {
    if (conflict || review !== null || state.result !== null) return;
    var to = session.settings.mode === 'local' ? session.moves.length - 1 : humanLast();
    if (to < 0) return;
    cancel(); session.moves.length = to; session.assisted = true; state = E.replay(session.moves); session.result = null;
    hint = preview = -1; cursor = session.moves.at(-1) ?? 112; save(); render();
  }
  function resultText() {
    if (state.result === 0) return '本局和棋';
    if (session.settings.mode === 'local') return state.result === 1 ? '黑棋获胜' : '白棋获胜';
    return state.result === session.human ? '你赢了' : '电脑获胜';
  }
  var historyKey = '';
  function render() {
    if (!state) return;
    var displayed = review === null ? session.moves : session.moves.slice(0, review), view = E.replay(displayed), indices = new Map();
    displayed.forEach(function (i, n) { indices.set(i, n + 1); });
    var enabled = canMove(), last = displayed.at(-1), winning = new Set(view.line);
    boardEl.classList.toggle('gm-enabled', enabled); boardEl.dataset.turn = state.turn;
    boardEl.setAttribute('aria-busy', busy ? 'true' : 'false');
    cells.forEach(function (cell, i) {
      cell.classList.toggle('black', view.board[i] === 1); cell.classList.toggle('white', view.board[i] === 2);
      cell.classList.toggle('last', i === last); cell.classList.toggle('winning', winning.has(i));
      cell.classList.toggle('preview', i === preview); cell.classList.toggle('suggested', i === hint);
      cell.tabIndex = i === cursor ? 0 : -1;
      cell.setAttribute('aria-selected', i === preview ? 'true' : 'false');
      cell.setAttribute('aria-label', E.coord(i) + '，' + (view.board[i] ? (view.board[i] === 1 ? '黑棋' : '白棋') + '，第 ' + indices.get(i) + ' 手' : '空位') + (i === hint ? '，建议落点' : ''));
      cell.firstChild.textContent = data.settings.numbers && view.board[i] ? indices.get(i) : '';
    });
    var lineEl = el('win-line'); lineEl.toggleAttribute('hidden', !view.line.length); lineEl.style.display = view.line.length ? '' : 'none';
    if (view.line.length) {
      var a = view.line[0], b = view.line.at(-1);
      lineEl.setAttribute('x1', a % 15 + .5); lineEl.setAttribute('y1', Math.floor(a / 15) + .5);
      lineEl.setAttribute('x2', b % 15 + .5); lineEl.setAttribute('y2', Math.floor(b / 15) + .5);
    }
    el('black-name').textContent = session.settings.mode === 'local' ? '黑棋玩家' : session.human === 1 ? '你' : '电脑';
    el('white-name').textContent = session.settings.mode === 'local' ? '白棋玩家' : session.human === 2 ? '你' : '电脑';
    el('black').classList.toggle('active', state.result === null && view.turn === 1);
    el('white').classList.toggle('active', state.result === null && view.turn === 2);
    el('count').textContent = displayed.length + ' 手';
    var text = conflict ? '对局已暂停，请加载最新进度' : review !== null ? '复盘 · 第 ' + review + ' / ' + session.moves.length + ' 手' : state.result !== null ? resultText() + (session.assisted ? ' · 辅助对局' : '') : busy === 'hint' ? '正在寻找建议落点…' : busy ? '电脑正在思考…' : (state.turn === 1 ? '轮到黑棋' : '轮到白棋') + (hint >= 0 ? ' · 建议 ' + E.coord(hint) : '') + (preview >= 0 ? ' · 待确认 ' + E.coord(preview) : '');
    if (!conflict && review === null && state.result === null && !busy) {
      if (preview >= 0) text = '待确认 ' + E.coord(preview);
      else if (hint >= 0) text = '建议 ' + E.coord(hint);
    }
    el('status').textContent = text;
    el('undo').disabled = conflict || review !== null || state.result !== null || (session.settings.mode === 'local' ? !session.moves.length : humanLast() < 0);
    el('hint').hidden = session.settings.mode === 'local'; el('hint').disabled = !enabled;
    el('board-controls').hidden = !data.settings.confirm || state.result !== null || review !== null;
    el('confirm').hidden = el('board-controls').hidden;
    el('confirm').disabled = !enabled || preview < 0;
    el('review').hidden = state.result === null || review !== null; el('review').disabled = conflict;
    el('review-controls').hidden = review === null;
    el('review-count').textContent = (review ?? 0) + ' / ' + session.moves.length;
    stage.querySelectorAll('[data-review]').forEach(function (button) {
      button.disabled = conflict || (['first', 'prev'].includes(button.dataset.review) && review === 0) || (['last', 'next'].includes(button.dataset.review) && review === session.moves.length);
    });
    el('new').disabled = conflict;
    el('game-kind').textContent = session.settings.mode === 'local' ? '双人' : names[session.settings.level];
    var nextHistoryKey = session.id + ':' + session.moves.join(',') + ':' + review;
    if (nextHistoryKey !== historyKey) {
      var historyEl = el('history'), nearBottom = historyEl.scrollHeight - historyEl.scrollTop - historyEl.clientHeight < 35;
      historyEl.replaceChildren();
      session.moves.forEach(function (i, n) {
        var item = document.createElement('li'); item.textContent = (n + 1) + '. ' + (n % 2 ? '白' : '黑') + ' ' + E.coord(i);
        if (review !== null && n >= review) item.className = 'gm-future';
        if (review === n + 1) item.className = 'gm-current';
        historyEl.appendChild(item);
      });
      el('history-empty').hidden = session.moves.length > 0;
      if (nearBottom && review === null) historyEl.scrollTop = historyEl.scrollHeight;
      if (review !== null) { var current = historyEl.querySelector('.gm-current'); if (current) historyEl.scrollTop = Math.max(0, current.offsetTop - historyEl.offsetTop - historyEl.clientHeight / 2); }
      historyKey = nextHistoryKey;
    }
    el('stats').replaceChildren();
    var best = document.createElement('p'); best.textContent = '人机最佳连胜：' + data.best.streak; el('stats').appendChild(best);
    ['ai:easy', 'ai:normal', 'ai:hard', 'local'].forEach(function (k) {
      var b = data.stats.buckets[k]; if (!b) return;
      var p = document.createElement('p');
      p.textContent = (k === 'local' ? '双人：黑胜 ' : names[k.split(':')[1]] + '：胜 ') + b.wins + (k === 'local' ? '，白胜 ' : '，负 ') + b.losses + '，和 ' + b.draws + '；辅助 ' + b.assisted + ' 局';
      el('stats').appendChild(p);
    });
    fitBoard();
  }
  var pointers = new Set(), gesture = null;
  function nearest(event) {
    var rect = boardEl.getBoundingClientRect(), x = Math.floor((event.clientX - rect.left) / rect.width * 15), y = Math.floor((event.clientY - rect.top) / rect.height * 15);
    return x >= 0 && x < 15 && y >= 0 && y < 15 ? y * 15 + x : -1;
  }
  boardEl.addEventListener('pointerdown', function (event) {
    if (event.button !== 0) return;
    pointers.add(event.pointerId);
    if (pointers.size > 1) { if (gesture) gesture.cancelled = true; return; }
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, cancelled: !event.isPrimary };
  });
  window.addEventListener('pointerdown', function (event) { if (gesture && event.pointerId !== gesture.id) gesture.cancelled = true; });
  window.addEventListener('pointermove', function (event) {
    if (gesture && event.pointerId === gesture.id && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) gesture.cancelled = true;
  });
  window.addEventListener('pointerup', function (event) {
    pointers.delete(event.pointerId);
    if (!gesture || event.pointerId !== gesture.id) return;
    var g = gesture; gesture = null;
    if (g.cancelled || Math.hypot(event.clientX - g.x, event.clientY - g.y) > 8) return;
    var i = nearest(event);
    if (i >= 0) { select(i); if (event.pointerType === 'mouse') cells[cursor].focus({ preventScroll: true }); }
  });
  window.addEventListener('pointercancel', function (event) { pointers.delete(event.pointerId); if (gesture) gesture.cancelled = true; });
  window.addEventListener('blur', function () { gesture = null; pointers.clear(); });
  boardEl.addEventListener('click', function (event) { if (event.detail === 0) { var cell = event.target.closest('.gm-cell'); if (cell) select(Number(cell.dataset.index)); } });
  boardEl.addEventListener('focusin', function (event) { var c = event.target.closest('.gm-cell'); if (c) cursor = Number(c.dataset.index); });
  boardEl.addEventListener('keydown', function (event) {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    var x = cursor % 15, y = Math.floor(cursor / 15), next = cursor;
    if (event.key === 'ArrowLeft') next = y * 15 + Math.max(0, x - 1);
    else if (event.key === 'ArrowRight') next = y * 15 + Math.min(14, x + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, y - 1) * 15 + x;
    else if (event.key === 'ArrowDown') next = Math.min(14, y + 1) * 15 + x;
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) select(cursor); return; }
    else if (event.key === 'Escape') { preview = -1; render(); return; }
    else return;
    event.preventDefault(); cursor = next; render(); cells[cursor].focus({ preventScroll: true });
  });
  function revealBoard() { boardEl.closest('.gm-board-area').scrollIntoView({ block: 'nearest', behavior: 'instant' }); }
  el('undo').addEventListener('click', function () { undo(); revealBoard(); });
  el('hint').addEventListener('click', function () { if (canMove()) { revealBoard(); session.assisted = true; save(); if (!conflict) compute('hint'); } });
  el('confirm').addEventListener('click', function () { if (canMove() && preview >= 0) commit(preview); });
  el('review').addEventListener('click', function () { if (state.result !== null) { review = session.moves.length; render(); revealBoard(); } });
  stage.querySelectorAll('[data-review]').forEach(function (button) { button.addEventListener('click', function () {
    if (conflict || review === null) return;
    var action = button.dataset.review;
    review = action === 'exit' ? null : action === 'first' ? 0 : action === 'last' ? session.moves.length : Math.max(0, Math.min(session.moves.length, review + (action === 'prev' ? -1 : 1)));
    render(); if (review === null) el('review').focus({ preventScroll: true });
  }); });
  ['mode', 'level', 'color', 'confirm-setting', 'numbers'].forEach(function (id) { el(id).addEventListener('change', function () {
    if (conflict) { syncSettings(); return; }
    data.settings = Object.assign({}, data.settings, { mode: el('mode').value, level: el('level').value, color: el('color').value, confirm: el('confirm-setting').checked, numbers: el('numbers').checked });
    syncSettings(); preview = -1; save(); render();
  }); });
  function closeDialog() { el('dialog').close(); }
  el('dialog').addEventListener('close', function () { if (focusBefore && focusBefore.isConnected && focusBefore.getClientRects().length) focusBefore.focus(); else el('open-settings').focus(); });
  el('new').addEventListener('click', function () {
    if (conflict) return;
    if (session.moves.length && state.result === null) { focusBefore = document.activeElement; el('dialog').showModal(); }
    else { newGame(); revealBoard(); }
  });
  el('cancel-new').addEventListener('click', closeDialog);
  el('accept-new').addEventListener('click', function () { closeDialog(); newGame(); revealBoard(); });
  el('reload').addEventListener('click', load);
  el('export').addEventListener('click', function () {
    var url = URL.createObjectURL(new Blob([rawBefore || ''], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = 'gomoku-original-save.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  window.addEventListener('storage', function (event) { if (mounted && (event.key === key || event.key === null) && raw() !== rawBefore) lockConflict(); });
  window.addEventListener('pagehide', cancel);
  window.addEventListener('pageshow', function (event) { if (event.persisted) { if (raw() !== rawBefore) lockConflict(); else { render(); schedule(); } } });
  load();
})(window.App, window.GomokuEngine, window.GomokuAI);
