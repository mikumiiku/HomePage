(function (M, E, AI) {
  'use strict';
  var stage = M.stage('go'), savegame = M.savegame('go');
  var source = new URL(document.currentScript.src), workerURL = new URL('go-worker.js' + source.search, source);
  var key = M.store.PREFIX + 'go:main', data, session, state, readonly = false, conflict = false;
  var worker = null, cancelFallback = null, watchdog = null, request = 0, busy = false;
  var preview = -1, cursor = 0, review = null, lastError = '', rawBefore = null, mounted = false;
  var cells = [], boardSize = 0, pointers = new Set(), gesture = null, fitFrame = 0;
  var levels = { easy: '轻松', normal: '标准', hard: '深入' };

  stage.closest('.game-shell').classList.add('go-shell');
  document.getElementById('hud').hidden = true;
  stage.classList.add('go-stage');
  stage.innerHTML = `
    <div class="go-notice" id="go-notice" role="status" hidden><span id="go-notice-text"></span><button class="btn" id="go-reload" type="button" hidden>加载最新进度</button><button class="btn" id="go-export" type="button" hidden>导出原存档</button></div>
    <div class="go-layout">
      <section class="go-play" aria-label="围棋对局">
        <div class="go-players">
          <div class="go-player" id="go-black"><span class="go-disc black" aria-hidden="true"></span><div><b id="go-black-name"></b><span id="go-black-meta"></span></div></div>
          <div class="go-turn"><span id="go-count">0 手</span><div class="go-status" id="go-status" role="status" aria-live="polite"></div></div>
          <div class="go-player" id="go-white"><span class="go-disc white" aria-hidden="true"></span><div><b id="go-white-name"></b><span id="go-white-meta"></span></div></div>
          <button class="btn go-settings-trigger" id="go-open-settings" type="button" aria-label="打开围棋设置" title="设置" aria-haspopup="dialog" aria-controls="go-settings-dialog"><span class="ti" style="--icon:url(/static/vendor/bootstrap-icons/gear.svg${source.search})" aria-hidden="true"></span></button>
        </div>
        <div class="go-board-area">
          <div class="go-board-frame"><div class="go-axis go-axis-top" aria-hidden="true"></div><div class="go-axis go-axis-left" aria-hidden="true"></div><div class="go-board" id="go-board" role="grid" aria-describedby="go-status"></div></div>
          <div class="go-precision" id="go-precision" role="status" hidden><div><b id="go-precision-coord"></b><span>局部放大</span></div><div class="go-loupe" id="go-loupe" aria-hidden="true"></div></div>
          <div class="go-board-controls" id="go-board-controls" hidden><button class="btn" id="go-cancel-preview" type="button">取消选择</button><button class="btn primary" id="go-confirm" type="button">确认落子</button></div>
          <div class="go-scoring" id="go-scoring" hidden>
            <div class="go-score"><span>黑方 <b id="go-score-black">0</b></span><span>白方 <b id="go-score-white">7.5</b></span><strong id="go-score-lead"></strong></div>
            <p id="go-scoring-help">点击棋盘上的死子，可按整组标记或恢复。</p>
            <div class="go-actions"><button class="btn" id="go-continue" type="button">继续对局</button><button class="btn primary" id="go-accept-score" type="button">确认计分</button></div>
          </div>
          <div class="go-review" id="go-review-controls" hidden><button class="btn" data-review="first" type="button">开局</button><button class="btn" data-review="prev" type="button">上一步</button><span id="go-review-count"></span><button class="btn" data-review="next" type="button">下一步</button><button class="btn" data-review="last" type="button">末手</button><button class="btn" data-review="exit" type="button">结束复盘</button></div>
        </div>
        <aside class="go-controls go-side" aria-label="对局操作与新局设置">
          <section class="go-session-actions"><h3>本局操作</h3><div class="go-actions"><button class="btn" id="go-pass" type="button">停一手</button><button class="btn" id="go-undo" type="button">悔棋</button><button class="btn" id="go-resign" type="button">认输</button><button class="btn" id="go-review" type="button" hidden>复盘本局</button></div></section>
          <section class="go-new-settings"><h3>新局设置</h3><div class="go-new-fields">
            <label for="go-mode">对战方式</label><select id="go-mode"><option value="ai">人机对战</option><option value="local">同屏双人</option></select>
            <label for="go-size">棋盘大小</label><select id="go-size"><option value="9">9 路</option><option value="13">13 路</option><option value="19">19 路</option></select>
            <div class="go-ai-settings"><label for="go-level">电脑难度</label><select id="go-level"><option value="easy">轻松</option><option value="normal">标准</option><option value="hard">深入</option></select><label for="go-color">我的执棋</label><select id="go-color"><option value="black">黑棋先手</option><option value="white">白棋后手</option><option value="random">随机执棋</option></select></div>
          </div><p class="go-small">更改选项后，开始新局生效</p><button class="btn primary go-new" id="go-new" type="button">开始新局</button></section>
        </aside>
      </section>
    </div>
    <dialog class="go-settings-dialog" id="go-settings-dialog" aria-labelledby="go-settings-title">
      <header class="go-panel-header"><h2 id="go-settings-title">设置</h2><button class="btn" id="go-close-settings" type="button" autofocus>完成</button></header>
      <div class="go-settings-scroll"><p class="go-settings-notice" id="go-settings-notice" role="status" hidden></p><aside class="go-side" aria-label="显示设置、棋谱与战绩">
        <section><h3>显示与落子</h3><label for="go-confirm-setting">落子确认</label><select id="go-confirm-setting"><option value="auto">按棋盘自动</option><option value="always">始终确认</option><option value="never">直接落子</option></select><label class="go-check"><input type="checkbox" id="go-numbers">显示手数</label><p class="go-small">自动模式下，触屏设备的 13 路和 19 路需要确认落子。</p></section>
        <details class="go-history-section"><summary>本局棋谱 <span id="go-game-kind"></span></summary><p class="go-small" id="go-history-empty">尚未落子</p><ol class="go-history" id="go-history" aria-label="落子记录"></ol></details>
        <details><summary>规则与操作</summary><p>采用中国规则。黑棋先行，白棋贴 7.5 目；禁止自杀和重复此前出现过的全盘局面。提掉的棋子只用于对局提示，数子时不重复加分。</p><p>双方连续停一手后核对死子。点击棋子可标记或恢复整组死子，确认后按盘上棋子与围住的空点计分。对死子有异议时选择「继续对局」。</p><p>棋盘获得键盘焦点后，用方向键选择交叉点，Enter 或空格落子。需要确认时，再按一次 Enter 或空格即可确认，Escape 取消选择。</p><p>人机悔棋会撤回你最近一手及电脑此后的回应；同屏双人每次撤回一手。终局后不能悔棋。未完成的对局不计战绩。</p></details>
        <details><summary>本地战绩</summary><div id="go-stats"></div><p class="go-small">只保存在当前浏览器</p></details>
        <div id="go-credits"></div>
      </aside></div>
    </dialog>
    <dialog class="go-dialog" id="go-new-dialog" aria-labelledby="go-new-dialog-title"><h2 id="go-new-dialog-title">开始新局？</h2><p>当前对局将被替换，未完成的对局不计战绩。</p><div class="go-actions"><button class="btn" id="go-cancel-new" type="button" autofocus>继续本局</button><button class="btn primary" id="go-accept-new" type="button">开始新局</button></div></dialog>
    <dialog class="go-dialog" id="go-resign-dialog" aria-labelledby="go-resign-dialog-title"><h2 id="go-resign-dialog-title">确认认输？</h2><p id="go-resign-copy">认输后本局立即结束并计入战绩。</p><div class="go-actions"><button class="btn" id="go-cancel-resign" type="button" autofocus>继续对局</button><button class="btn go-danger" id="go-accept-resign" type="button">确认认输</button></div></dialog>`;

  function el(id) { return document.getElementById('go-' + id); }
  var boardEl = el('board'), settingsDialog = el('settings-dialog'), newDialog = el('new-dialog'), resignDialog = el('resign-dialog');
  var footer = document.querySelector('.site-footer');
  if (footer) el('credits').appendChild(footer);

  function defaults() {
    return { best: { streak: 0 }, stats: { buckets: {} }, settings: { mode: 'ai', size: 9, level: 'normal', color: 'black', confirm: 'auto', numbers: false }, session: null };
  }
  function settingsValid(settings) {
    return settings && ['ai', 'local'].includes(settings.mode) && E.validSize(settings.size) && Object.hasOwn(levels, settings.level) && ['black', 'white', 'random'].includes(settings.color) && ['auto', 'always', 'never'].includes(settings.confirm) && typeof settings.numbers === 'boolean';
  }
  function resultValid(result) {
    return result && [1, 2].includes(result.winner) && ['score', 'resign'].includes(result.reason) && Number.isFinite(result.margin) && result.margin >= 0 && (result.reason !== 'score' || (Number.isFinite(result.black) && Number.isFinite(result.white)));
  }
  function validate(saved) {
    if (!saved || !saved.best || !Number.isInteger(saved.best.streak) || saved.best.streak < 0 || !saved.stats || !saved.stats.buckets || typeof saved.stats.buckets !== 'object' || Array.isArray(saved.stats.buckets) || !settingsValid(saved.settings)) throw new Error('存档结构无效');
    Object.entries(saved.stats.buckets).forEach(function (entry) {
      if (!/^(ai:(9|13|19):(easy|normal|hard)|local:(9|13|19))$/.test(entry[0])) return;
      ['wins', 'losses', 'draws', 'streak'].forEach(function (name) { if (!Number.isInteger(entry[1][name]) || entry[1][name] < 0) throw new Error('战绩无效'); });
    });
    if (saved.session === null) return;
    var current = saved.session;
    if (!current || typeof current.id !== 'string' || !settingsValid(current.settings) || ![1, 2].includes(current.human) || !['play', 'scoring', 'ended'].includes(current.phase) || !Array.isArray(current.dead) || !current.confirmations || typeof current.confirmations.black !== 'boolean' || typeof current.confirmations.white !== 'boolean' || typeof current.settled !== 'boolean') throw new Error('对局信息无效');
    var replayed = E.replay(current.settings.size, current.moves);
    current.dead.forEach(function (point) { if (!E.validPoint(current.settings.size, point) || !replayed.board[point]) throw new Error('死子标记无效'); });
    if (current.phase === 'scoring' && replayed.passes < 2) throw new Error('计分状态无效');
    if (current.phase === 'ended') {
      if (!resultValid(current.result)) throw new Error('结果无效');
      if (current.result.reason === 'score') {
        var counted = E.score(replayed, current.dead, 7.5);
        if (counted.winner !== current.result.winner || counted.black !== current.result.black || counted.white !== current.result.white) throw new Error('计分结果不一致');
      }
    } else if (current.result !== null) throw new Error('对局结果与状态不一致');
    if (current.settled && current.phase !== 'ended') throw new Error('战绩状态无效');
  }
  function raw() { try { return localStorage.getItem(key); } catch (error) { return null; } }
  function notice(message, reload, backup) {
    if (readonly) { backup = true; if (!message.includes('原存档')) message += ' 原存档已保留，当前为临时对局，可导出原存档备份。'; }
    el('notice').hidden = false; el('notice-text').textContent = message;
    el('settings-notice').hidden = false; el('settings-notice').textContent = message + ' 关闭设置后可查看提示和处理选项。';
    el('reload').hidden = !reload; el('export').hidden = !backup; fitBoard();
  }
  function closeSettings() { if (settingsDialog.open) settingsDialog.close(); }
  el('open-settings').addEventListener('click', function () { gesture = null; pointers.clear(); settingsDialog.showModal(); });
  el('close-settings').addEventListener('click', closeSettings);
  settingsDialog.addEventListener('close', function () { el('open-settings').focus({ preventScroll: true }); });

  function syncSettings() {
    el('mode').value = data.settings.mode; el('size').value = String(data.settings.size); el('level').value = data.settings.level; el('color').value = data.settings.color;
    el('confirm-setting').value = data.settings.confirm; el('numbers').checked = data.settings.numbers;
    stage.querySelector('.go-ai-settings').hidden = data.settings.mode !== 'ai';
  }
  function load() {
    cancelSearch(); conflict = false; readonly = false; review = null; rawBefore = raw();
    el('notice').hidden = true; el('settings-notice').hidden = true;
    try {
      if (rawBefore !== null) {
        var envelope = JSON.parse(rawBefore);
        if (!envelope || !Number.isInteger(envelope.v) || envelope.v < 1 || !envelope.d || typeof envelope.d !== 'object' || Array.isArray(envelope.d)) throw new Error('存档无法解析');
      }
      var loaded = savegame.load();
      if (loaded.fromFuture) throw new Error('存档来自更新版本');
      data = loaded.data; validate(data);
    } catch (error) {
      readonly = true; data = defaults(); notice('原存档无法读取，已保留。当前仅进行临时对局，可导出原存档备份。', false, true);
    }
    if (M.store.backendKind() !== 'local' && !readonly) notice('浏览器未开放本地存储，本次进度在关闭页面后不会保留。');
    syncSettings(); session = data.session;
    if (!session) newGame();
    else {
      state = E.replay(session.settings.size, session.moves); cursor = lastStone(session.moves, session.settings.size); preview = -1;
      buildBoard(session.settings.size); settle(); render(); scheduleAI();
    }
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
    conflict = true; cancelSearch(); preview = -1;
    notice('另一页面已更新本局，已暂停操作，避免覆盖进度。请加载最新进度。', true);
    if (session) render();
  }
  function cancelSearch() {
    request++;
    if (worker) worker.terminate(); worker = null;
    if (cancelFallback) cancelFallback(); cancelFallback = null;
    clearTimeout(watchdog); watchdog = null; busy = false;
  }
  function lastStone(moves, size) {
    for (var i = moves.length - 1; i >= 0; i--) if (moves[i] >= 0) return moves[i];
    return Math.floor(size * size / 2);
  }
  function newGame() {
    if (conflict) return;
    cancelSearch(); review = null; preview = -1; lastError = '';
    var human = data.settings.color === 'random' ? (Math.random() < .5 ? 1 : 2) : data.settings.color === 'white' ? 2 : 1;
    var settings = Object.assign({}, data.settings);
    session = { id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), settings: settings, human: human, moves: [], phase: 'play', dead: [], confirmations: { black: false, white: false }, result: null, settled: false };
    state = E.replay(settings.size, []); cursor = Math.floor(settings.size * settings.size / 2); data.session = session;
    buildBoard(settings.size); save(); render(); scheduleAI();
  }
  function settle() {
    if (!session || session.phase !== 'ended' || session.settled) return;
    var bucketKey = session.settings.mode === 'local' ? 'local:' + session.settings.size : 'ai:' + session.settings.size + ':' + session.settings.level;
    var bucket = data.stats.buckets[bucketKey] || { wins: 0, losses: 0, draws: 0, streak: 0 };
    var perspective = session.settings.mode === 'local' ? 1 : session.human;
    if (session.result.winner === perspective) { bucket.wins++; bucket.streak++; }
    else if (session.result.winner) { bucket.losses++; bucket.streak = 0; }
    else { bucket.draws++; bucket.streak = 0; }
    if (session.settings.mode === 'ai') data.best.streak = Math.max(data.best.streak, bucket.streak);
    data.stats.buckets[bucketKey] = bucket; session.settled = true; save();
  }
  function needsConfirm() {
    if (data.settings.confirm === 'always') return true;
    if (data.settings.confirm === 'never') return false;
    return M.platform.isTouch && session.settings.size > 9;
  }
  function canMove() {
    return !conflict && review === null && session.phase === 'play' && !busy && (session.settings.mode === 'local' || state.turn === session.human);
  }
  function humanLast() {
    for (var i = session.moves.length - 1; i >= 0; i--) if (i % 2 + 1 === session.human) return i;
    return -1;
  }
  function undoIndex() {
    if (conflict || review !== null || session.phase === 'ended') return -1;
    return session.settings.mode === 'local' ? session.moves.length - 1 : humanLast();
  }
  function undo() {
    var to = undoIndex();
    if (to < 0) return;
    cancelSearch(); session.moves.length = to; state = E.replay(session.settings.size, session.moves);
    session.phase = 'play'; session.dead = []; session.confirmations = { black: false, white: false }; session.result = null;
    preview = -1; review = null; cursor = lastStone(session.moves, session.settings.size); lastError = '已悔棋';
    save(); render(); scheduleAI(); revealBoard();
  }
  function commit(point) {
    if (!canMove()) return;
    var result = E.play(state, point);
    if (!result.ok) {
      lastError = result.reason === 'suicide' ? '这里落子会没有气' : result.reason === 'superko' ? '这里落子会重复此前的盘面' : '这里不能落子';
      preview = -1; render(); return;
    }
    state = result.state; session.moves = state.moves.slice(); preview = -1; lastError = '';
    save(); render(); scheduleAI();
  }
  function select(point) {
    if (!E.validPoint(session.settings.size, point)) return;
    cursor = point;
    if (session.phase === 'scoring' && review === null && !conflict) { toggleDead(point); return; }
    if (!canMove() || state.board[point]) { render(); return; }
    if (needsConfirm()) {
      if (preview === point) commit(point);
      else { preview = point; lastError = ''; render(); }
    } else commit(point);
  }
  function passMove(fromAI) {
    if (session.phase !== 'play' || conflict || review !== null || (!fromAI && !canMove())) return;
    state = E.pass(state); session.moves = state.moves.slice(); preview = -1; lastError = '';
    if (state.passes >= 2) {
      cancelSearch(); session.phase = 'scoring'; session.dead = []; session.confirmations = { black: false, white: false };
    }
    save(); render(); if (session.phase === 'play') scheduleAI();
  }
  function resign() {
    if (conflict || session.phase !== 'play') return;
    cancelSearch();
    var loser = session.settings.mode === 'ai' ? session.human : state.turn, winner = 3 - loser;
    session.phase = 'ended'; session.result = { winner: winner, reason: 'resign', black: null, white: null, margin: 0 }; preview = -1;
    settle(); save(); render();
  }
  function scoreNow() { return E.score(state, session.dead, 7.5); }
  function toggleDead(point) {
    if (!state.board[point]) return;
    var group = E.groupAt(state, point), dead = new Set(session.dead), removing = group.stones.every(function (stone) { return dead.has(stone); });
    group.stones.forEach(function (stone) { if (removing) dead.delete(stone); else dead.add(stone); });
    session.dead = Array.from(dead).sort(function (a, b) { return a - b; });
    session.confirmations = { black: false, white: false }; save(); render();
  }
  function acceptScore() {
    if (conflict || session.phase !== 'scoring') return;
    if (session.settings.mode === 'local') {
      if (!session.confirmations.black) session.confirmations.black = true;
      else if (!session.confirmations.white) session.confirmations.white = true;
      if (!session.confirmations.white) { save(); render(); return; }
    }
    var counted = scoreNow();
    session.phase = 'ended'; session.result = { winner: counted.winner, reason: 'score', black: counted.black, white: counted.white, margin: counted.margin };
    settle(); save(); render();
  }
  function continueGame() {
    if (conflict || session.phase !== 'scoring') return;
    session.phase = 'play'; session.dead = []; session.confirmations = { black: false, white: false }; preview = -1; lastError = '';
    save(); render(); scheduleAI();
  }
  function randomSeed() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) { var value = new Uint32Array(1); crypto.getRandomValues(value); return value[0]; }
    return Math.floor(Math.random() * 4294967296);
  }
  function scheduleAI() {
    if (!conflict && session.phase === 'play' && session.settings.mode === 'ai' && state.turn !== session.human) computeAI();
  }
  function computeAI() {
    cancelSearch(); busy = true; preview = -1;
    var token = request, gameID = session.id, snapshot = session.moves.slice(), size = session.settings.size, fallbackUsed = false;
    render();
    function receive(point) {
      if (request !== token || session.id !== gameID || conflict || session.moves.length !== snapshot.length || session.phase !== 'play') return;
      if (point !== -1) {
        var legal = E.play(state, point);
        if (!legal.ok) { fallback(); return; }
      }
      cancelSearch();
      if (point === -1) passMove(true);
      else {
        var result = E.play(state, point); state = result.state; session.moves = state.moves.slice(); save(); render(); scheduleAI();
      }
    }
    function fallback() {
      if (request !== token || fallbackUsed) return;
      fallbackUsed = true;
      if (worker) worker.terminate(); worker = null; clearTimeout(watchdog);
      notice('电脑搜索暂不可用，已切换为快速搜索，本局可继续游玩。');
      cancelFallback = AI.fallback({ size: size, moves: snapshot }, receive);
    }
    try {
      worker = new Worker(workerURL);
      worker.onmessage = function (event) {
        var response = event.data;
        if (response.game !== gameID || response.request !== token) return;
        if (response.error) fallback(); else receive(response.move);
      };
      worker.onerror = function (event) { event.preventDefault(); fallback(); };
      worker.postMessage({ game: gameID, request: token, size: size, moves: snapshot, level: session.settings.level, seed: randomSeed() });
      watchdog = setTimeout(fallback, (AI.BUDGETS[session.settings.level] || 800) + 3000);
    } catch (error) { fallback(); }
  }

  function buildBoard(size) {
    if (boardSize === size) return;
    boardSize = size; cells = []; boardEl.replaceChildren();
    boardEl.setAttribute('aria-label', size + ' 行 ' + size + ' 列围棋棋盘'); boardEl.setAttribute('aria-rowcount', size); boardEl.setAttribute('aria-colcount', size);
    boardEl.style.setProperty('--go-lines', size);
    var topAxis = stage.querySelector('.go-axis-top'), leftAxis = stage.querySelector('.go-axis-left');
    topAxis.replaceChildren(); leftAxis.replaceChildren(); topAxis.style.setProperty('--go-lines', size); leftAxis.style.setProperty('--go-lines', size);
    var stars = new Set(E.starPoints(size));
    for (var y = 0; y < size; y++) {
      var row = document.createElement('div'); row.className = 'go-row'; row.setAttribute('role', 'row'); row.style.setProperty('--go-lines', size);
      for (var x = 0; x < size; x++) {
        var point = y * size + x, cell = document.createElement('div');
        cell.className = 'go-cell'; cell.id = 'go-cell-' + point; cell.dataset.index = point; cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-rowindex', y + 1); cell.setAttribute('aria-colindex', x + 1); cell.tabIndex = -1;
        if (stars.has(point)) cell.classList.add('star');
        var stone = document.createElement('span'); stone.className = 'go-stone'; stone.setAttribute('aria-hidden', 'true'); cell.appendChild(stone);
        var marker = document.createElement('span'); marker.className = 'go-area-marker'; marker.setAttribute('aria-hidden', 'true'); cell.appendChild(marker);
        row.appendChild(cell); cells.push(cell);
      }
      boardEl.appendChild(row);
      var top = document.createElement('span'); top.textContent = E.LETTERS[y]; topAxis.appendChild(top);
      var left = document.createElement('span'); left.textContent = size - y; leftAxis.appendChild(left);
    }
    fitBoard();
  }
  function displayedState() {
    return review === null ? state : E.replay(session.settings.size, session.moves.slice(0, review));
  }
  function resultText() {
    if (!session.result) return '';
    var winner = session.result.winner === 1 ? '黑棋' : '白棋';
    if (session.result.reason === 'score') return winner + '胜 ' + session.result.margin.toFixed(1) + ' 目';
    if (session.settings.mode === 'ai') return session.result.winner === session.human ? '你获胜，电脑已认输' : '电脑获胜，你已认输';
    return winner + '获胜，对方认输';
  }
  function renderLoupe(view) {
    var show = preview >= 0 && needsConfirm() && M.platform.isTouch && session.settings.size > 9 && session.phase === 'play';
    el('precision').hidden = !show;
    if (!show) return;
    el('precision-coord').textContent = E.coord(session.settings.size, preview);
    var loupe = el('loupe'); loupe.replaceChildren();
    var cx = preview % session.settings.size, cy = Math.floor(preview / session.settings.size);
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      var item = document.createElement('span'), x = cx + dx, y = cy + dy;
      item.className = 'go-loupe-point';
      if (x < 0 || x >= session.settings.size || y < 0 || y >= session.settings.size) item.classList.add('outside');
      else {
        var value = view.board[y * session.settings.size + x];
        if (value === 1) item.classList.add('black'); else if (value === 2) item.classList.add('white');
      }
      if (!dx && !dy) item.classList.add('selected');
      loupe.appendChild(item);
    }
  }
  var historyKey = '';
  function render() {
    if (!state || !session) return;
    buildBoard(session.settings.size);
    var view = displayedState(), displayed = review === null ? session.moves : session.moves.slice(0, review);
    var numbers = new Map(), moveNumber = 0;
    displayed.forEach(function (point, index) { if (point >= 0) { moveNumber = index + 1; numbers.set(point, moveNumber); } });
    var last = lastStone(displayed, session.settings.size), score = null;
    var showTerritory = review === null && (session.phase === 'scoring' || (session.phase === 'ended' && session.result && session.result.reason === 'score'));
    if (showTerritory) score = E.score(state, session.dead, 7.5);
    var blackArea = new Set(score ? score.territory.black : []), whiteArea = new Set(score ? score.territory.white : []), dead = new Set(session.dead);
    var enabled = canMove();
    boardEl.classList.toggle('go-enabled', enabled);
    boardEl.classList.toggle('go-scoring-mode', session.phase === 'scoring' && !conflict && review === null);
    boardEl.dataset.turn = view.turn; boardEl.setAttribute('aria-busy', busy ? 'true' : 'false');
    cells.forEach(function (cell, point) {
      var value = view.board[point];
      cell.classList.toggle('black', value === 1); cell.classList.toggle('white', value === 2); cell.classList.toggle('last', value > 0 && point === last);
      cell.classList.toggle('preview', point === preview); cell.classList.toggle('dead', dead.has(point));
      cell.classList.toggle('black-area', blackArea.has(point)); cell.classList.toggle('white-area', whiteArea.has(point));
      cell.tabIndex = point === cursor ? 0 : -1; cell.setAttribute('aria-selected', point === preview || dead.has(point) ? 'true' : 'false');
      var label = E.coord(session.settings.size, point) + '，' + (value ? (value === 1 ? '黑棋' : '白棋') + (numbers.has(point) ? '，第 ' + numbers.get(point) + ' 手' : '') : '空位');
      if (dead.has(point)) label += '，已标记为死子';
      if (blackArea.has(point)) label += '，黑方领地'; else if (whiteArea.has(point)) label += '，白方领地';
      cell.setAttribute('aria-label', label); cell.querySelector('.go-stone').textContent = data.settings.numbers && value && numbers.has(point) ? numbers.get(point) : '';
    });
    el('black-name').textContent = session.settings.mode === 'local' ? '黑棋玩家' : session.human === 1 ? '你' : '电脑';
    el('white-name').textContent = session.settings.mode === 'local' ? '白棋玩家' : session.human === 2 ? '你' : '电脑';
    el('black-meta').textContent = '先手 · 提子 ' + state.captures[1]; el('white-meta').textContent = '贴 7.5 目 · 提子 ' + state.captures[2];
    el('black').classList.toggle('active', session.phase === 'play' && state.turn === 1); el('white').classList.toggle('active', session.phase === 'play' && state.turn === 2);
    el('count').textContent = displayed.length + ' 手';
    var status = conflict ? '对局已暂停，请加载最新进度' : review !== null ? '复盘 · 第 ' + review + ' / ' + session.moves.length + ' 手' : session.phase === 'ended' ? resultText() : session.phase === 'scoring' ? (session.settings.mode === 'local' && session.confirmations.black ? '黑方已确认，请白方核对结果' : '请核对死子和计分结果') : busy ? '电脑正在思考…' : preview >= 0 ? '待确认 ' + E.coord(session.settings.size, preview) : lastError || (state.turn === 1 ? '轮到黑棋' : '轮到白棋');
    el('status').textContent = status;
    el('pass').disabled = !enabled; el('undo').disabled = undoIndex() < 0; el('resign').disabled = conflict || session.phase !== 'play' || review !== null;
    el('review').hidden = session.phase !== 'ended' || review !== null; el('review').disabled = conflict;
    el('board-controls').hidden = preview < 0 || session.phase !== 'play' || review !== null; el('confirm').disabled = !enabled || preview < 0;
    el('review-controls').hidden = review === null;
    el('review-count').textContent = (review === null ? 0 : review) + ' / ' + session.moves.length;
    stage.querySelectorAll('[data-review]').forEach(function (button) {
      button.disabled = conflict || review === null || (['first', 'prev'].includes(button.dataset.review) && review === 0) || (['last', 'next'].includes(button.dataset.review) && review === session.moves.length);
    });
    el('scoring').hidden = session.phase !== 'scoring' || review !== null;
    if (session.phase === 'scoring' && review === null) {
      score = score || scoreNow(); el('score-black').textContent = score.black.toFixed(1); el('score-white').textContent = score.white.toFixed(1);
      el('score-lead').textContent = (score.winner === 1 ? '黑方' : '白方') + '暂领先 ' + score.margin.toFixed(1) + ' 目';
      if (session.settings.mode === 'local') {
        el('accept-score').textContent = session.confirmations.black ? '白方确认结果' : '黑方确认结果';
        el('scoring-help').textContent = session.confirmations.black ? '黑方已确认。白方确认前仍可修改死子，修改后双方需重新确认。' : '点击棋盘上的死子，可按整组标记或恢复。';
      } else { el('accept-score').textContent = '确认计分'; el('scoring-help').textContent = '点击棋盘上的死子，可按整组标记或恢复。'; }
    }
    el('game-kind').textContent = session.settings.size + ' 路 · ' + (session.settings.mode === 'local' ? '双人' : levels[session.settings.level]);
    renderLoupe(view); renderHistory(); renderStats(); fitBoard();
  }
  function renderHistory() {
    var nextKey = session.id + ':' + session.moves.join(',') + ':' + review;
    if (nextKey === historyKey) return;
    var history = el('history'), nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 35; history.replaceChildren();
    session.moves.forEach(function (point, index) {
      var item = document.createElement('li'); item.textContent = (index + 1) + '. ' + (index % 2 ? '白' : '黑') + ' ' + (point < 0 ? '停一手' : E.coord(session.settings.size, point));
      if (review !== null && index >= review) item.className = 'go-future'; else if (review === index + 1) item.className = 'go-current'; history.appendChild(item);
    });
    el('history-empty').hidden = session.moves.length > 0;
    if (nearBottom && review === null) history.scrollTop = history.scrollHeight;
    if (review !== null) { var current = history.querySelector('.go-current'); if (current) history.scrollTop = Math.max(0, current.offsetTop - history.offsetTop - history.clientHeight / 2); }
    historyKey = nextKey;
  }
  function renderStats() {
    var stats = el('stats'); stats.replaceChildren();
    var best = document.createElement('p'); best.textContent = '人机最佳连胜：' + data.best.streak; stats.appendChild(best);
    Object.keys(data.stats.buckets).sort().forEach(function (bucketKey) {
      var bucket = data.stats.buckets[bucketKey], parts = bucketKey.split(':'), item = document.createElement('p');
      item.textContent = parts[0] === 'local' ? parts[1] + ' 路双人：黑胜 ' + bucket.wins + '，白胜 ' + bucket.losses : parts[1] + ' 路' + levels[parts[2]] + '：胜 ' + bucket.wins + '，负 ' + bucket.losses + '，连胜 ' + bucket.streak;
      stats.appendChild(item);
    });
  }
  function renderReview(action) {
    if (review === null || conflict) return;
    if (action === 'first') review = 0; else if (action === 'prev') review = Math.max(0, review - 1); else if (action === 'next') review = Math.min(session.moves.length, review + 1); else if (action === 'last') review = session.moves.length; else if (action === 'exit') review = null;
    preview = -1; render(); revealBoard();
  }

  function fitBoard() {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(function () {
      if (stage.classList.contains("unified-stage")) return;
      var noticeHeight = el('notice').hidden ? 0 : el('notice').offsetHeight + 12;
      var extras = (el('board-controls').hidden ? 0 : el('board-controls').offsetHeight + 8) + (el('scoring').hidden ? 0 : el('scoring').offsetHeight + 8) + (el('review-controls').hidden ? 0 : el('review-controls').offsetHeight + 8);
      var width = stage.clientWidth, height = stage.clientHeight - noticeHeight;
      var side = window.matchMedia('(min-width: 900px), (min-width: 700px) and (max-height: 500px)').matches;
      stage.classList.toggle('go-side-info', side);
      var size = Math.floor(side ? Math.max(260, Math.min(width - 304, height - 82 - extras)) : Math.min(width, Math.max(280, window.innerHeight - 24)));
      stage.classList.toggle('go-compact', size < 340); stage.style.setProperty('--go-size', size + 'px');
    });
  }
  function revealBoard() { boardEl.closest('.go-board-area').scrollIntoView({ block: 'nearest', behavior: 'instant' }); }
  function pointAt(event) {
    var target = event.target && event.target.closest ? event.target.closest('.go-cell') : null;
    if (target && boardEl.contains(target)) return Number(target.dataset.index);
    var hit = document.elementFromPoint(event.clientX, event.clientY), cell = hit && hit.closest ? hit.closest('.go-cell') : null;
    if (cell && boardEl.contains(cell)) return Number(cell.dataset.index);
    var rect = boardEl.getBoundingClientRect(), x = Math.floor((event.clientX - rect.left) / rect.width * session.settings.size), y = Math.floor((event.clientY - rect.top) / rect.height * session.settings.size);
    return x >= 0 && x < session.settings.size && y >= 0 && y < session.settings.size ? y * session.settings.size + x : -1;
  }
  function tapSlop(pointerType) {
    return pointerType === 'touch' ? 14 : pointerType === 'pen' ? 10 : 8;
  }

  boardEl.addEventListener('pointerdown', function (event) {
    if (event.button !== 0) return;
    pointers.add(event.pointerId); if (pointers.size > 1) { if (gesture) gesture.cancelled = true; return; }
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, point: pointAt(event), slop: tapSlop(event.pointerType), pointerType: event.pointerType, cancelled: !event.isPrimary };
  });
  window.addEventListener('pointerdown', function (event) { if (gesture && event.pointerId !== gesture.id) gesture.cancelled = true; });
  window.addEventListener('pointermove', function (event) { if (gesture && event.pointerId === gesture.id && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > gesture.slop) gesture.cancelled = true; });
  window.addEventListener('pointerup', function (event) {
    pointers.delete(event.pointerId); if (!gesture || event.pointerId !== gesture.id) return;
    var current = gesture; gesture = null; if (current.cancelled || Math.hypot(event.clientX - current.x, event.clientY - current.y) > current.slop) return;
    if (current.point >= 0) { select(current.point); if (current.pointerType === 'mouse') cells[cursor].focus({ preventScroll: true }); }
  });
  window.addEventListener('pointercancel', function (event) { pointers.delete(event.pointerId); if (gesture) gesture.cancelled = true; });
  window.addEventListener('blur', function () { gesture = null; pointers.clear(); });
  boardEl.addEventListener('click', function (event) { if (event.detail === 0) { var cell = event.target.closest('.go-cell'); if (cell) select(Number(cell.dataset.index)); } });
  boardEl.addEventListener('focusin', function (event) { var cell = event.target.closest('.go-cell'); if (cell) cursor = Number(cell.dataset.index); });
  boardEl.addEventListener('keydown', function (event) {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    var size = session.settings.size, x = cursor % size, y = Math.floor(cursor / size), next = cursor;
    if (event.key === 'ArrowLeft') next = y * size + Math.max(0, x - 1);
    else if (event.key === 'ArrowRight') next = y * size + Math.min(size - 1, x + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, y - 1) * size + x;
    else if (event.key === 'ArrowDown') next = Math.min(size - 1, y + 1) * size + x;
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) select(cursor); return; }
    else if (event.key === 'Escape') { preview = -1; render(); return; }
    else return;
    event.preventDefault(); cursor = next; render(); cells[cursor].focus({ preventScroll: true });
  });

  el('confirm').addEventListener('click', function () { if (preview >= 0) commit(preview); });
  el('cancel-preview').addEventListener('click', function () { preview = -1; render(); cells[cursor].focus({ preventScroll: true }); });
  el('pass').addEventListener('click', function () { passMove(false); revealBoard(); });
  el('undo').addEventListener('click', undo);
  el('resign').addEventListener('click', function () { if (!el('resign').disabled) resignDialog.showModal(); });
  el('cancel-resign').addEventListener('click', function () { resignDialog.close(); });
  el('accept-resign').addEventListener('click', function () { resignDialog.close(); resign(); });
  resignDialog.addEventListener('close', function () { el('resign').focus({ preventScroll: true }); });
  el('accept-score').addEventListener('click', acceptScore); el('continue').addEventListener('click', continueGame);
  el('review').addEventListener('click', function () { review = session.moves.length; render(); revealBoard(); });
  stage.querySelectorAll('[data-review]').forEach(function (button) { button.addEventListener('click', function () { renderReview(button.dataset.review); }); });
  el('new').addEventListener('click', function () {
    if (conflict) return;
    if (session.phase !== 'ended' && session.moves.length) newDialog.showModal(); else newGame();
  });
  el('cancel-new').addEventListener('click', function () { newDialog.close(); });
  el('accept-new').addEventListener('click', function () { newDialog.close(); newGame(); revealBoard(); });
  newDialog.addEventListener('close', function () { el('new').focus({ preventScroll: true }); });
  ['mode', 'size', 'level', 'color'].forEach(function (name) {
    el(name).addEventListener('change', function () {
      data.settings[name] = name === 'size' ? Number(el(name).value) : el(name).value; syncSettings(); save();
    });
  });
  el('confirm-setting').addEventListener('change', function () { data.settings.confirm = el('confirm-setting').value; preview = -1; save(); render(); });
  el('numbers').addEventListener('change', function () { data.settings.numbers = el('numbers').checked; save(); render(); });
  el('reload').addEventListener('click', load);
  el('export').addEventListener('click', function () {
    var blob = new Blob([rawBefore || ''], { type: 'application/json' }), link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'homepage-go-save.json'; link.click(); setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
  });
  window.addEventListener('storage', function (event) { if (mounted && event.key === key && event.newValue !== rawBefore) lockConflict(); });
  window.addEventListener('resize', fitBoard); if (window.visualViewport) window.visualViewport.addEventListener('resize', fitBoard);
  var fitObserver = new ResizeObserver(fitBoard); [stage, stage.querySelector('.go-players'), el('notice'), el('board-controls'), el('scoring'), el('review-controls')].forEach(function (node) { fitObserver.observe(node); });
  window.addEventListener('beforeunload', cancelSearch);
  load();
})(window.App, window.GoEngine, window.GoAI);
