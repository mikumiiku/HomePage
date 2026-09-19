/* 雀蛇 · 麻将贪吃蛇
 *
 * 四条蛇（玩家 + 三台电脑）在网格里抢场上四张麻将：吃掉一张就多一个身体节点，
 * 手里凑到 14 张时先判胡牌，没胡就打掉一张；地图边界是循环的，撞自己或撞到别的蛇
 * 会死亡并换一副新起手牌重生。先胡牌的一方获胜。
 *
 * 地图与蛇用 canvas 画（60FPS 插值），手牌、状态与操作条用 HTML。
 * 逻辑固定步长推进，一个 tick 内同时结算吃牌、碰撞与胡牌（设计文档第 64-66 节）。 */
(function (M) {
  'use strict';
  var E = window.SquekEngine, AI = window.SquekAI;

  var stage = M.stage('squek');
  var G = M.savegame('squek');
  var VER = new URL(document.currentScript.src).search;   // 静态资源指纹

  /* —— 规则常量 —— */
  var W = 36, H = 24;                 // 地图格数
  var BODY = 13;                      // 起手身长（= 手牌张数）
  var FIELD_TILES = 4;                // 场上常驻麻将数
  var BASE_STEP = 360;                // 毫秒 / 格
  var SUDDEN_AT = 480;                // 8 分钟后进入终局（秒）
  var SUDDEN_SPAN = 20, SUDDEN_GAIN = 0.05, SPEED_CAP = 1.6;
  /* 选牌时间走日本麻将那套：每次思考给 12 银秒，用超了从每局共用的 30 金秒里扣。 */
  var SILVER_MS = 12000, GOLD_MS = 30000;
  var AI_DISCARD_MS = 500;            // 电脑选牌思考时间
  var INVINCIBLE_MS = 3000;
  var DEATH_WAIT = [2000, 3000, 4000, 5000];
  var CRASH_MS = 460;
  var COUNTDOWN_MS = 3200, GO_MS = 700;
  var HU_HOLD_MS = 1500;              // 「胡」字停留时间
  var DIRS = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };

  var PLAYERS = [
    { id: 'player', name: 'YOU', tag: 'YOU', human: true, color: '--sq-player' },
    { id: 'cpu1', name: 'CPU.01', tag: 'CPU.01', human: false, color: '--sq-cpu1' },
    { id: 'cpu2', name: 'CPU.02', tag: 'CPU.02', human: false, color: '--sq-cpu2' },
    { id: 'cpu3', name: 'CPU.03', tag: 'CPU.03', human: false, color: '--sq-cpu3' }
  ];
  var DIFF_LABEL = { casual: '休闲', normal: '普通', hard: '困难' };

  /* —— 存档 —— */
  var save = G.load().data;
  var settings = {
    difficulty: save.settings.difficulty || 'normal',
    hint: save.settings.hint !== false,
    sound: save.settings.sound !== false,
    seen: !!save.settings.seen
  };

  /* —— 运行状态 —— */
  var game = {
    phase: 'MENU',            // MENU / COUNTDOWN / PLAYING / OVER
    now: 0,                   // 只在不暂停时前进的游戏时钟（毫秒）
    time: 0,                  // 对局秒数
    pool: [], field: [], snakes: [],
    winner: null, winners: [], huForm: '', doubleHu: false,
    speed: 1, countdownEnd: 0, overAt: 0,
    gold: GOLD_MS                 // 每局共用的附加思考时间（毫秒）
  };
  var flights = [];           // 飞牌动画
  var pendingDirs = [];
  var viewing = 'player';     // 手牌条当前展示谁的手牌
  var crashed = 0;
  var huTimer = 0, rafId = 0, lastTs = 0, acc = 0, hudAcc = 0, barSig = '', msgText = '';
  var dprScale = 1, flashUntil = 0, flashText = '';

  /* —— DOM —— */
  var wrap = document.createElement('div');
  wrap.className = 'sq-wrap';
  var plates = document.createElement('div');
  plates.className = 'sq-plates';
  plates.setAttribute('role', 'group');
  plates.setAttribute('aria-label', '四名角色的状态，点击可查看手牌');
  var frame = document.createElement('div');
  frame.className = 'canvas-frame sq-frame';
  var canvas = document.createElement('canvas');
  canvas.className = 'sq-board';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '雀蛇地图：四条麻将蛇在场上抢牌');
  frame.appendChild(canvas);
  var msg = document.createElement('p');
  msg.className = 'sq-msg';
  msg.setAttribute('aria-hidden', 'true');
  frame.appendChild(msg);
  var bar = document.createElement('div');
  bar.className = 'sq-bar';
  var barHead = document.createElement('div');
  barHead.className = 'sq-bar-head';
  var barLabel = document.createElement('span');
  barLabel.className = 'sq-bar-label';
  var barTimer = document.createElement('span');
  barTimer.className = 'sq-bar-timer';
  var silverEl = document.createElement('b');
  silverEl.className = 'sq-silver';
  var goldEl = document.createElement('b');
  goldEl.className = 'sq-gold';
  barTimer.appendChild(silverEl);
  barTimer.appendChild(goldEl);
  barHead.appendChild(barLabel);
  barHead.appendChild(barTimer);
  var tilesRow = document.createElement('div');
  tilesRow.className = 'sq-tiles';
  bar.appendChild(barHead);
  bar.appendChild(tilesRow);
  wrap.appendChild(plates);
  wrap.appendChild(frame);
  wrap.appendChild(bar);
  stage.appendChild(wrap);

  var ctx = null, cell = 20, ox = 0, P = {}, bgCache = null, fontNow = '';

  /* ============================================================
   * 主题色板与尺寸
   * ============================================================ */
  function readPalette() {
    var cs = getComputedStyle(stage);
    function token(name, fallback) {
      var v = cs.getPropertyValue(name).trim();
      return v || fallback;
    }
    P = {
      bg: token('--sq-bg', '#f4f1e8'), grid: token('--sq-grid', '#d8d2c2'),
      line: token('--sq-line', '#14110c'), face: token('--sq-face', '#fdfbf4'),
      m: token('--sq-m', '#b2352b'), p: token('--sq-p', '#1f4e79'),
      s: token('--sq-s', '#2f6b3a'), z: token('--sq-z', '#6b2f52'),
      win: token('--sq-win', '#c9931f'),
      font: getComputedStyle(document.body).getPropertyValue('--font-body') || 'sans-serif',
      players: {
        player: token('--sq-player', '#d1452f'), cpu1: token('--sq-cpu1', '#2f6fb5'),
        cpu2: token('--sq-cpu2', '#d9a921'), cpu3: token('--sq-cpu3', '#3f8f4f')
      }
    };
  }
  /* 场地底与格线是静态的：按当前尺寸与主题缓存成一张图，每帧只做一次 drawImage。 */
  function buildBackground(px, py) {
    var dpr = dprScale || 1;
    bgCache = document.createElement('canvas');
    bgCache.width = (px + 24) * dpr;
    bgCache.height = (py + 24) * dpr;
    var c = bgCache.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 12 * dpr, 12 * dpr);
    c.fillStyle = P.bg;
    c.fillRect(-12, -12, px + 24, py + 24);
    c.strokeStyle = P.grid;
    c.lineWidth = 1;
    for (var i = 1; i < W; i++) { c.beginPath(); c.moveTo(i * cell + 0.5, 0); c.lineTo(i * cell + 0.5, py); c.stroke(); }
    for (var j = 1; j < H; j++) { c.beginPath(); c.moveTo(0, j * cell + 0.5); c.lineTo(px, j * cell + 0.5); c.stroke(); }
  }

  function suitColor(kind) {
    var s = E.suitOf(kind);
    return s === 'm' ? P.m : s === 'p' ? P.p : s === 's' ? P.s : P.z;
  }

  function fit() {
    /* 上方的状态牌与下方的手牌条各自独立占位，这里按剩余高度换算格子尺寸。
       固定预留 30px：两处 8px 间距、页面底部内边距与棋盘 3px 边框。 */
    var availW = Math.max(80, wrap.clientWidth - 2);
    var stageTop = stage.getBoundingClientRect().top;
    var availH = window.innerHeight - stageTop - (plates.offsetHeight || 0) - (bar.offsetHeight || 0) - 30;
    if (tilePx() !== lastTilePx) { lastTilePx = tilePx(); barSig = ''; }
    var raw = Math.min(availW / W, Math.max(24, availH) / H);
    var next = Math.max(5, Math.floor(raw));
    var changed = next !== cell;
    cell = next;
    var px = cell * W, py = cell * H;
    ox = 0;
    var dpr = window.devicePixelRatio || 1;
    dprScale = dpr;
    canvas.width = px * dpr;
    canvas.height = py * dpr;
    canvas.style.width = px + 'px';
    canvas.style.height = py + 'px';
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    frame.style.width = (px + 6) + 'px';   // 边框 3px × 2，让外框贴合棋盘
    if (changed || !bgCache) buildBackground(px, py);
    stage.classList.toggle('sq-tiny', cell < 15);
    if (changed || !game.snakes.length) draw(1);
  }

  /* ============================================================
   * 音效（WebAudio 合成，不新增音频文件）
   * ============================================================ */
  var actx = null;
  function audioCtx() {
    if (!settings.sound) return null;
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = new AC(); } catch (e) { return null; }
    }
    if (actx.state === 'suspended' && actx.resume) actx.resume();
    return actx;
  }
  function tone(freq, dur, type, gain, delay, slideTo) {
    var ac = audioCtx();
    if (!ac) return;
    var t0 = ac.currentTime + (delay || 0);
    var osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(ac.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  function knock(dur, gain, cut, delay) {
    var ac = audioCtx();
    if (!ac) return;
    var t0 = ac.currentTime + (delay || 0);
    var len = Math.max(1, Math.floor(ac.sampleRate * dur));
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ac.createBufferSource(); src.buffer = buf;
    var filter = ac.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cut || 1200;
    var g = ac.createGain(); g.gain.value = gain;
    src.connect(filter); filter.connect(g); g.connect(ac.destination);
    src.start(t0);
  }
  var sfx = {
    move: function () { tone(760, 0.02, 'square', 0.01); },
    eat: function () { knock(0.05, 0.16, 2600); tone(680, 0.09, 'triangle', 0.13, 0.01, 1150); },
    discard: function () { knock(0.09, 0.2, 900); tone(190, 0.07, 'sine', 0.1, 0.005, 120); },
    crash: function () { knock(0.2, 0.24, 700); tone(140, 0.22, 'sawtooth', 0.12, 0, 60); },
    hu: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.5, 'triangle', 0.15, i * 0.1); });
      knock(0.3, 0.2, 3000);
    }
  };

  /* ============================================================
   * 建模：开局、出生、场上牌
   * ============================================================ */
  function cloneCells(cells) { return cells.map(function (c) { return { x: c.x, y: c.y }; }); }
  /* 电脑的动作不占中央横幅，改在它蛇头上弹一行小字（身体已消失时用死亡时的位置）。 */
  function note(s, text, ms, at) {
    s.note = { text: text, until: game.now + ms, cell: at ? { x: at.x, y: at.y } : null };
  }

  function snakeById(id) { for (var i = 0; i < game.snakes.length; i++) if (game.snakes[i].id === id) return game.snakes[i]; return null; }
  function isInvincible(s) { return game.now < s.invincibleUntil; }
  /* 实体蛇参与碰撞；决策态、无敌期与死亡都不参与（第 15、28、33 节）。 */
  function isSolid(s) { return s.state === 'NORMAL' && !s.ghost && !isInvincible(s); }
  function isMoving(s) { return s.state === 'NORMAL'; }
  function rndInt(n) { return Math.floor(Math.random() * n); }
  function pickOne(list) { return list[rndInt(list.length)]; }
  function cellKey(x, y) { return y * W + x; }

  function occupancy() {
    var occ = new Uint8Array(W * H);
    for (var i = 0; i < game.snakes.length; i++) {
      var s = game.snakes[i];
      for (var j = 0; j < s.segments.length; j++) occ[cellKey(s.segments[j].x, s.segments[j].y)] = 1;
    }
    for (var f = 0; f < game.field.length; f++) occ[cellKey(game.field[f].x, game.field[f].y)] = 2;
    return occ;
  }
  function fieldAt(x, y) {
    for (var i = 0; i < game.field.length; i++) {
      if (game.field[i].x === x && game.field[i].y === y) return game.field[i];
    }
    return null;
  }
  /* 重生点：不压蛇身与麻将，离边界留一格，身后放得下整条蛇，前方两格有路，
     并与其他蛇头保持距离；找不到就逐级放宽（第 32 节）。 */
  function pickSpawn(clearance) {
    var occ = occupancy(), heads = [];
    for (var i = 0; i < game.snakes.length; i++) {
      if (game.snakes[i].segments.length) heads.push(game.snakes[i].segments[0]);
    }
    for (var attempt = 0; attempt < 300; attempt++) {
      var dir = pickOne([DIRS.left, DIRS.right, DIRS.up, DIRS.down]);
      var x = 2 + rndInt(W - 4), y = 2 + rndInt(H - 4);
      var ok = true, cells = [];
      for (var k = 0; k < BODY; k++) {
        var cx = x - dir.x * k, cy = y - dir.y * k;
        if (cx < 1 || cy < 1 || cx > W - 2 || cy > H - 2) { ok = false; break; }
        if (occ[cellKey(cx, cy)]) { ok = false; break; }
        cells.push({ x: cx, y: cy });
      }
      if (!ok) continue;
      var fx = x + dir.x * 2, fy = y + dir.y * 2;
      if (fx < 1 || fy < 1 || fx > W - 2 || fy > H - 2) continue;
      var near = false;
      for (var h = 0; h < heads.length; h++) {
        if (Math.max(Math.abs(heads[h].x - x), Math.abs(heads[h].y - y)) < clearance) { near = true; break; }
      }
      if (near) continue;
      return { cells: cells, dir: dir };
    }
    return null;
  }
  function respawn(s) {
    var spot = pickSpawn(6) || pickSpawn(3) || pickSpawn(1) || pickSpawn(0);
    if (!spot) return false;
    s.segments = spot.cells;
    s.prev = spot.cells;
    s.dir = { x: spot.dir.x, y: spot.dir.y };
    s.hand = E.sortHand(game.pool.splice(0, BODY));
    s.state = 'NORMAL';
    s.ghost = false;
    s.crash = null;
    s.discardDeadline = 0;
    s.invincibleUntil = game.now + INVINCIBLE_MS;
    s.aiNextThink = game.now + AI.profileOf(settings.difficulty).think;
    s.note = null;
    if (!s.human) note(s, 'READY', 1300, s.segments[0]);
    return true;
  }
  /* 场上补牌：只放合法空白格，避开蛇头前方两格，并尽量与已有麻将拉开距离（第 13 节）。 */
  function spawnFieldTile() {
    if (!game.pool.length) return;
    var occ = occupancy(), x, y;
    var heads = [];
    for (var i = 0; i < game.snakes.length; i++) {
      var s = game.snakes[i];
      if (isMoving(s) && s.segments.length) heads.push({ h: s.segments[0], d: s.dir });
    }
    function allowed(cx, cy) {
      if (occ[cellKey(cx, cy)]) return false;
      for (var k = 0; k < heads.length; k++) {
        var h = heads[k].h, d = heads[k].d;
        if (cx === h.x + d.x && cy === h.y + d.y) return false;
        if (cx === h.x + d.x * 2 && cy === h.y + d.y * 2) return false;
      }
      return true;
    }
    var level3 = [], level2 = [], level1 = [];
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        if (!allowed(x, y)) continue;
        var gap = 99;
        for (var f = 0; f < game.field.length; f++) {
          var d = Math.abs(game.field[f].x - x) + Math.abs(game.field[f].y - y);
          if (d < gap) gap = d;
        }
        /* 优先挑离已有麻将至少 3 格的空位，其次 2 格，最后任意空格。 */
        if (gap >= 3) level3.push({ x: x, y: y });
        else if (gap >= 2) level2.push({ x: x, y: y });
        else level1.push({ x: x, y: y });
      }
    }
    var pool = level3.length ? level3 : level2.length ? level2 : level1;
    if (!pool.length) return;
    var spot = pickOne(pool);
    game.field.push({ tile: game.pool.pop(), x: spot.x, y: spot.y, hint: 0 });
  }

  function newGame() {
    var wall = E.makeWall(), at = 0;
    game.phase = 'COUNTDOWN';
    game.now = 0; game.time = 0; game.pool = []; game.field = [];
    game.snakes = []; game.winner = null; game.winners = []; game.huForm = '';
    game.doubleHu = false; game.speed = 1; game.countdownEnd = COUNTDOWN_MS; game.overAt = 0;
    game.gold = GOLD_MS;
    flights = []; pendingDirs = []; viewing = 'player'; crashed = 0; barSig = '';
    flashUntil = 0; flashText = '';
    clearTimeout(huTimer);
    PLAYERS.forEach(function (def, index) {
      game.snakes.push({
        id: def.id, index: index, def: def, human: def.human,
        state: 'DEAD', ghost: true, dir: DIRS.right,
        segments: [], prev: [], hand: E.sortHand(wall.slice(at, at + BODY)),
        invincibleUntil: 0, deathCount: 0, discardDeadline: 0, decisionStart: 0,
        aiNextThink: 0, respawnAt: 0, crash: null
      });
      at += BODY;
    });
    game.snakes.forEach(function (s) {
      var spot = pickSpawn(6) || pickSpawn(3) || pickSpawn(1) || pickSpawn(0);
      if (!spot) return;
      s.segments = spot.cells;
      s.prev = spot.cells;
      s.dir = { x: spot.dir.x, y: spot.dir.y };
      s.state = 'NORMAL';
      s.ghost = false;
    });
    game.pool = wall.slice(at);
    for (var i = 0; i < FIELD_TILES; i++) spawnFieldTile();
    markHazard();
    renderAll(true);
    M.announce('新的一局开始，四条蛇各十三张牌', true);
  }

  /* ============================================================
   * 游戏推进
   * ============================================================ */
  function stepMs() { return BASE_STEP / game.speed; }
  function reverseOf(dir) { return { x: -dir.x, y: -dir.y }; }

  function applyDirection(s) {
    if (s.human) {
      while (pendingDirs.length) {
        var d = pendingDirs.shift();
        var back = reverseOf(s.dir);
        if (d.x === back.x && d.y === back.y) continue;
        s.dir = d;
        return;
      }
      return;
    }
    if (game.now >= s.aiNextThink) {
      var move = AI.chooseMove(aiView(s));
      if (move) s.dir = move.dir;
      s.aiNextThink = game.now + AI.profileOf(settings.difficulty).think;
    }
  }

  function aiView(s) {
    var others = [], opponents = [];
    for (var i = 0; i < game.snakes.length; i++) {
      var o = game.snakes[i];
      if (o === s || !o.segments.length) continue;
      others.push({
        head: o.segments[0], dir: o.dir, body: o.segments,
        ghost: o.ghost || o.state === 'DECISION', invincible: isInvincible(o)
      });
      if (o.hand.length === BODY) opponents.push(o.hand);
    }
    return {
      w: W, h: H,
      self: { head: s.segments[0], dir: s.dir, body: s.segments, hand: s.hand },
      snakes: others, opponents: opponents,
      tiles: game.field.map(function (f) { return { x: f.x, y: f.y, kind: E.kindOf(f.tile) }; }),
      personality: AI.personalityOf(s.id),
      profile: AI.profileOf(settings.difficulty)
    };
  }

  /* 一个逻辑 tick：先算全部计划，再统一结算（第 64 节）。 */
  function step() {
    var plans = [], i, j;
    for (i = 0; i < game.snakes.length; i++) {
      var s = game.snakes[i];
      if (!isMoving(s) || !s.segments.length) { s.prev = s.segments; continue; }
      applyDirection(s);
      /* 边界是循环的：从一边出去就从对边回来（不判墙死）。 */
      var head = {
        x: (s.segments[0].x + s.dir.x + W) % W,
        y: (s.segments[0].y + s.dir.y + H) % H
      };
      var f = fieldAt(head.x, head.y);
      plans.push({ s: s, head: head, eat: f, ate: !!f, dead: null, win: null });
    }
    var byId = {};
    plans.forEach(function (p) { byId[p.s.id] = p; });
    plans.forEach(function (p) {
      var s = p.s;
      /* 撞自己：尾巴会让开，无敌期不判自杀（第 33 节） */
      if (!isInvincible(s)) {
        var limit = p.ate ? s.segments.length : s.segments.length - 1;
        for (j = 0; j < limit; j++) {
          if (s.segments[j].x === p.head.x && s.segments[j].y === p.head.y) { p.dead = '自己'; break; }
        }
      }
      if (p.dead) return;
      for (i = 0; i < plans.length; i++) {
        var q = plans[i];
        if (q === p) continue;
        /* 同格对撞与换位对撞：双方都死（第 27、65 节） */
        if (q.head.x === p.head.x && q.head.y === p.head.y) { p.dead = '对头'; return; }
        if (q.head.x === s.segments[0].x && q.head.y === s.segments[0].y &&
          q.s.segments[0].x === p.head.x && q.s.segments[0].y === p.head.y) { p.dead = '对头'; return; }
      }
      if (p.dead) return;
      for (i = 0; i < game.snakes.length; i++) {
        var o = game.snakes[i];
        if (o === s || !isSolid(o)) continue;
        var op = byId[o.id];
        /* 对方这 tick 不吃牌时尾巴会让开，可以跟上；否则算撞到 */
        var bodyLimit = o.segments.length - (isMoving(o) && !(op && op.ate) ? 1 : 0);
        for (j = 0; j < bodyLimit; j++) {
          if (o.segments[j].x === p.head.x && o.segments[j].y === p.head.y) { p.dead = o.def.name; return; }
        }
      }
    });
    /* 胡牌优先于普通死亡（第 66 节） */
    var winners = [];
    plans.forEach(function (p) {
      if (!p.ate) return;
      var form = E.winForm(p.s.hand.concat([p.eat.tile]));
      if (form) { p.win = form; winners.push(p); }
    });
    if (winners.length) {
      winners.forEach(function (p) {
        growTail(p.s);
        p.s.hand.unshift(p.eat.tile);
        p.s.state = 'WINNER';
        p.s.ghost = false;
        var at = game.field.indexOf(p.eat);
        if (at >= 0) game.field.splice(at, 1);
      });
      game.winners = winners.map(function (p) { return p.s; });
      game.doubleHu = winners.length > 1;
      game.winner = game.winners[0];
      game.huForm = winners[0].win;
      endGame();
      return;
    }
    /* 结算移动、吃牌、死亡 */
    plans.forEach(function (p) {
      if (p.dead) { killSnake(p.s, p.dead); return; }
      p.s.prev = cloneCells(p.s.segments);
      p.s.segments.unshift({ x: p.head.x, y: p.head.y });
      if (!p.ate) p.s.segments.pop();
      else eatTile(p.s, p.eat);
      if (p.s.human) sfx.move();
    });
    for (i = 0; i < game.snakes.length; i++) {
      var g = game.snakes[i];
      if (!isMoving(g)) { g.prev = g.segments; continue; }
      /* 幽灵蛇在身体让开后恢复实体（第 28 节） */
      if (g.ghost && !headBlocked(g)) g.ghost = false;
    }
    markHazard();
  }

  function headBlocked(s) {
    if (!s.segments.length) return false;
    var h = s.segments[0];
    for (var i = 0; i < game.snakes.length; i++) {
      var o = game.snakes[i];
      if (o === s || !isSolid(o)) continue;
      for (var j = 0; j < o.segments.length; j++) {
        if (o.segments[j].x === h.x && o.segments[j].y === h.y) return true;
      }
    }
    return false;
  }
  /* 身体长一节：接在尾巴外侧那一格（只给「这一 tick 没走成」的胡牌蛇补长，第 14 节）。 */
  function growTail(s) {
    var n = s.segments.length;
    if (n < 2) return;
    var tail = s.segments[n - 1], before = s.segments[n - 2];
    var nx = (tail.x + (tail.x - before.x) + W) % W;
    var ny = (tail.y + (tail.y - before.y) + H) % H;
    s.segments.push({ x: nx, y: ny });
  }

  function eatTile(s, f) {
    var at = game.field.indexOf(f);
    if (at >= 0) game.field.splice(at, 1);
    /* 牌头：吃进的牌先不排牌，整手往后顺一位，蛇头就是这张新牌（第 8 节的映射）。 */
    s.hand.unshift(f.tile);
    /* 身体已经在移动阶段长出一节（这一 tick 不收尾），这里不再重复加长。 */
    s.state = 'DECISION';
    s.ghost = true;                                   // 决策态退出碰撞系统（第 15 节）
    s.deathCount = 0;                                 // 吃牌重置连续死亡计数（第 31 节）
    s.decisionStart = game.now;
    s.discardDeadline = s.human ? 0 : game.now + AI_DISCARD_MS + rndInt(300);
    if (s.human) {
      viewing = 'player';
      sfx.eat();
      M.announce('吃进' + E.fullNameOfId(f.tile) + '，共十四张，请打出一张', true);
    } else {
      note(s, 'DRAW', 900, s.segments[0]);
    }
    renderAll(true);
  }

  function killSnake(s, reason) {
    var i, cells = cloneCells(s.segments);
    for (i = 0; i < cells.length; i++) {
      flights.push({
        kind: s.hand[i] === undefined ? -1 : s.hand[i],
        x0: cells[i].x, y0: cells[i].y, cx: W / 2, cy: H / 2,
        start: game.now + i * 12, dur: 420
      });
    }
    for (i = 0; i < s.hand.length; i++) game.pool.push(s.hand[i]);   // 手牌全部回牌库（第 30 节）
    s.hand = [];
    s.segments = [];
    s.prev = [];
    s.state = 'DEAD';
    s.ghost = true;
    s.crash = { reason: reason, until: game.now + CRASH_MS };
    if (!s.human) note(s, 'CRASH', 1300, cells[0]);
    s.deathCount = Math.min(s.deathCount + 1, 4);
    s.respawnAt = game.now + DEATH_WAIT[s.deathCount - 1];
    s.discardDeadline = 0;
    if (s.human) {
      crashed += 1;
      sfx.crash();
      M.announce('你撞上' + reason + '，全部手牌回到牌库，' +
        (DEATH_WAIT[s.deathCount - 1] / 1000) + ' 秒后重生', true);
    }
    renderAll(true);
  }

  /* 弃牌：逻辑上打掉选中的那张，空间上永远缩短蛇尾（第 16 节）。 */
  function doDiscard(s, index) {
    if (s.state !== 'DECISION' || index < 0 || index >= s.hand.length) return;
    var tile = s.hand[index];
    var previousTail = s.segments[s.segments.length - 1];
    s.hand.splice(index, 1);
    game.pool.push(tile);
    if (s.segments.length > BODY) s.segments.pop();
    /* 打出之后才排牌：牌面重新映射，蛇的空间位置不变（第 9 节）。 */
    s.hand = E.sortHand(s.hand);
    s.state = 'NORMAL';
    s.ghost = headBlocked(s);
    s.prev = s.segments;
    s.discardDeadline = 0;
    s.aiNextThink = game.now;
    var nowTail = s.segments[s.segments.length - 1];
    if (previousTail && (!nowTail || nowTail.x !== previousTail.x || nowTail.y !== previousTail.y)) {
      flights.push({ kind: tile, x0: previousTail.x, y0: previousTail.y, cx: W / 2, cy: H / 2, start: game.now, dur: 260 });
    }
    if (s.human) {
      sfx.discard();
      flash('DISCARD ' + E.labelOfId(tile), 420);
      M.announce('打出' + E.fullNameOfId(tile), true);
    }
    spawnFieldTile();
    renderAll(true);
  }

  function seenCounts() {
    var c = new Int8Array(E.KINDS);
    game.snakes.forEach(function (s) { s.hand.forEach(function (t) { c[E.kindOf(t)]++; }); });
    game.field.forEach(function (f) { c[E.kindOf(f.tile)]++; });
    return c;
  }
  function playerDiscardIndex() {
    var s = snakeById('player');
    if (!s || s.hand.length !== BODY + 1) return -1;
    var worst = E.worstTile(s.hand, seenCounts());
    return worst.index >= 0 ? worst.index : s.hand.length - 1;
  }
  function markHazard() {
    var player = snakeById('player');
    var hand = settings.hint && player && player.hand.length === BODY ? player.hand : null;
    game.field.forEach(function (f) { f.hint = hand ? E.hazard(hand, E.kindOf(f.tile)) : 0; });
  }

  /* 每帧计时：倒计时、终局加速、弃牌限时、重生等待。 */
  function timers(dt) {
    if (game.phase === 'COUNTDOWN') {
      if (game.now >= game.countdownEnd) game.phase = 'PLAYING';
      return;
    }
    if (game.phase !== 'PLAYING') return;
    game.time += dt / 1000;
    if (game.time >= SUDDEN_AT) {
      var steps = Math.floor((game.time - SUDDEN_AT) / SUDDEN_SPAN) + 1;
      game.speed = Math.min(SPEED_CAP, 1 + steps * SUDDEN_GAIN);
    }
    game.snakes.forEach(function (s) {
      if (s.state === 'DECISION' && s.human) {
        /* 银秒用完开始吃金秒，金秒见底才自动弃牌。 */
        if (game.now - s.decisionStart > SILVER_MS) {
          game.gold = Math.max(0, game.gold - dt);
          if (game.gold <= 0) doDiscard(s, playerDiscardIndex());
        }
      } else if (s.state === 'DECISION' && s.discardDeadline && game.now >= s.discardDeadline) {
        doDiscard(s, AI.chooseDiscard(s.hand, seenCounts(), AI.personalityOf(s.id)));
      } else if (s.state === 'DEAD' && !s.segments.length && game.now >= s.respawnAt) {
        if (s.crash && game.now >= s.crash.until) s.crash = null;
        respawn(s);
      }
      if (s.state === 'NORMAL' && s.ghost && !headBlocked(s)) s.ghost = false;
    });
  }

  function endGame() {
    game.phase = 'OVER';
    game.overAt = game.now;
    sfx.hu();
    var playerWon = game.winners.some(function (s) { return s.human; });
    var seconds = Math.round(game.time);
    G.update(function (d) {
      d.stats.games += 1;
      d.stats.crashes = (d.stats.crashes || 0) + crashed;
      if (game.doubleHu) d.stats.doubleHu = (d.stats.doubleHu || 0) + 1;
      if (playerWon) {
        d.stats.wins += 1;
        d.best.wins = (d.best.wins || 0) + 1;
        if (!d.best.fastest || seconds < d.best.fastest) d.best.fastest = seconds;
      }
    });
    renderAll(true);
    M.announce((game.doubleHu ? '双方同时胡牌' : game.winner.def.name + '胡牌') +
      '，牌型' + game.huForm + '，用时' + M.fmt.seconds(seconds), true);
    huTimer = setTimeout(showResult, HU_HOLD_MS);
  }

  function showResult() {
    var playerWon = game.winners.some(function (s) { return s.human; });
    var lines = [];
    game.winners.forEach(function (s) {
      lines.push(s.def.name + '：' + E.sortHand(s.hand).map(E.fullNameOfId).join(' '));
    });
    lines.push('牌型：' + game.huForm + '　用时 ' + M.fmt.clock(Math.round(game.time)));
    lines.push(game.doubleHu ? '双胡：双方同时获胜' : (playerWon ? '你抢在电脑前面胡牌' : '电脑先胡牌，本局失败'));
    if (playerWon) {
      var fastest = G.load().data.best.fastest || 0;
      lines.push(fastest && Math.round(game.time) <= fastest ? '新纪录：最快胡牌' : '最快纪录 ' + M.fmt.clock(fastest));
    }
    M.overlay(stage, {
      title: game.doubleHu ? 'DOUBLE HU' : (playerWon ? 'PLAYER WINS' : game.winner.def.name + ' WINS'),
      lines: lines,
      actions: [{ label: '再来一局', primary: true, onClick: startRound }]
    });
  }

  /* ============================================================
   * 渲染
   * ============================================================ */
  function lerp(a, b, t) { return a + (b - a) * t; }
  /* 循环边界下的插值：跨缝时把上一格换算到相邻副本，并在接缝另一侧补画一份，
     这样蛇从右边出去的同时会有一半从左边进来，不会横穿整块棋盘。 */
  function wrapPoints(prev, cur, t) {
    var x0 = prev ? prev.x : cur.x, y0 = prev ? prev.y : cur.y;
    var dx = cur.x - x0, dy = cur.y - y0;
    if (dx > W / 2) x0 += W; else if (dx < -W / 2) x0 -= W;
    if (dy > H / 2) y0 += H; else if (dy < -H / 2) y0 -= H;
    var x = lerp(x0, cur.x, t), y = lerp(y0, cur.y, t);
    var oxs = [0], oys = [0];
    if (x < 0) oxs.push(W); else if (x > W - 1) oxs.push(-W);
    if (y < 0) oys.push(H); else if (y > H - 1) oys.push(-H);
    var out = [];
    for (var a = 0; a < oxs.length; a++) {
      for (var b = 0; b < oys.length; b++) out.push({ x: x + oxs[a], y: y + oys[b] });
    }
    return out;
  }

  /* —— 牌面：矢量画法，数字牌完全不依赖字体 ——
     筒 = 圆点阵（大点点成圆环），条 = 竹节，万 = 大号数字，字牌 = 大字/白板方框，
     字牌在格子太小时改用拉丁首字母，任何尺寸都不会糊成一团。 */
  var PIPS = {
    1: [[.5, .5]],
    2: [[.5, .3], [.5, .7]],
    3: [[.26, .22], [.5, .5], [.74, .78]],
    4: [[.3, .3], [.7, .3], [.3, .7], [.7, .7]],
    5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]],
    6: [[.32, .2], [.68, .2], [.32, .5], [.68, .5], [.32, .8], [.68, .8]],
    7: [[.28, .15], [.5, .28], [.72, .41], [.3, .7], [.7, .7], [.3, .9], [.7, .9]],
    8: [[.32, .14], [.68, .14], [.32, .38], [.68, .38], [.32, .62], [.68, .62], [.32, .86], [.68, .86]],
    9: [[.25, .25], [.5, .25], [.75, .25], [.25, .5], [.5, .5], [.75, .5], [.25, .75], [.5, .75], [.75, .75]]
  };
  var PIP_R = { 1: .3, 2: .19, 3: .16, 4: .155, 5: .145, 6: .125, 7: .105, 8: .11, 9: .105 };
  var HONOR_CJK = ['东', '南', '西', '北', '中', '发', '白'];
  var HONOR_LATIN = ['E', 'S', 'W', 'N', 'C', 'F', 'P'];

  function honorColor(idx) {
    if (idx === 4) return P.m;      // 中：红
    if (idx === 5) return P.s;      // 发：绿
    if (idx === 6) return P.p;      // 白：蓝
    return P.line;                  // 风牌：墨色
  }
  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function drawPips(c, n, bx, by, bw, bh, color, stick) {
    var layout = PIPS[n], u = Math.min(bw, bh);
    for (var i = 0; i < layout.length; i++) {
      var px = bx + layout[i][0] * bw, py = by + layout[i][1] * bh;
      c.fillStyle = color;
      if (stick) {
        /* 竹节：细长胶囊 + 中间一道浅色节环，比纯色块更像条子。 */
        var w = Math.max(1.5, u * (n <= 3 ? 0.19 : n <= 6 ? 0.15 : 0.125));
        var h = Math.min(bh * (n <= 3 ? 0.34 : 0.26), w * 2.6);
        roundRectPath(c, px - w / 2, py - h / 2, w, h, w / 2);
        c.fill();
        if (h >= 6 && w >= 3) {
          c.fillStyle = P.face;
          c.fillRect(px - w / 2, py - Math.max(0.5, h * 0.06), w, Math.max(1, h * 0.12));
        }
      } else {
        var r = Math.max(1.4, u * PIP_R[n]);
        c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
        if (r >= 3.2) {           // 够大就抠出圆心，接近传统筒子
          c.fillStyle = P.face;
          c.beginPath(); c.arc(px, py, r * 0.42, 0, Math.PI * 2); c.fill();
        }
      }
    }
  }
  function drawHonor(c, kind, bx, by, bw, bh) {
    var idx = E.rankOf(kind) - 1;
    if (idx === 6) {              // 白板：传统就是一块空白带框
      var pad = Math.max(1.5, bw * 0.14);
      c.strokeStyle = P.p;
      c.lineWidth = Math.max(1.5, bw * 0.1);
      c.strokeRect(bx + pad, by + pad, bw - pad * 2, bh - pad * 2);
      return;
    }
    var big = bh >= 15;
    var text = big ? HONOR_CJK[idx] : HONOR_LATIN[idx];
    c.font = '800 ' + Math.round(bh * (big ? 0.78 : 0.88)) + 'px ' + P.font;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = honorColor(idx);
    c.fillText(text, bx + bw / 2, by + bh * 0.54);
  }
  /* 一张牌：象牙白底 + 花色条 + 花色图案。c 可以是棋盘 ctx，也可以是手牌条里的小画布。 */
  function paintTile(c, kind, x, y, size, alpha) {
    c.globalAlpha = alpha === undefined ? 1 : alpha;
    var suit = E.suitOf(kind), rank = E.rankOf(kind);
    c.fillStyle = P.face;
    c.fillRect(x, y, size, size);
    var strip = suitColor(kind);
    var sh = Math.max(1.5, Math.round(size * 0.16));
    c.fillStyle = strip;
    c.fillRect(x, y, size, sh);
    var bx = x + size * 0.1, by = y + sh + size * 0.05;
    var bw = size * 0.8, bh = size - sh - size * 0.1;
    if (suit === 'm') {
      c.font = '800 ' + Math.max(7, Math.round(bh * 0.86)) + 'px ' + P.font;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = strip;
      c.fillText(String(rank), x + size / 2, by + bh * 0.53);
    } else if (suit === 'p') {
      drawPips(c, rank, bx, by, bw, bh, strip, false);
    } else if (suit === 's') {
      drawPips(c, rank, bx, by, bw, bh, strip, true);
    } else {
      drawHonor(c, kind, bx, by, bw, bh);
    }
    c.globalAlpha = 1;
  }
  function tileFace(kind, px, py, size, alpha) {
    paintTile(ctx, kind, px, py, size, alpha);
  }

  function drawSnake(s, alpha) {
    if (!s.segments.length) return;
    var color = P.players[s.id] || P.line;
    var ghost = s.ghost;
    var invincible = isInvincible(s);
    var winner = s.state === 'WINNER';
    var blink = invincible ? 0.4 + 0.4 * Math.abs(Math.sin(game.now / 150)) : 1;
    var alphaNow = ghost ? 0.42 : blink;
    if (winner) alphaNow = 0.75 + 0.25 * Math.abs(Math.sin(game.now / 130));
    for (var i = s.segments.length - 1; i >= 0; i--) {
      var cur = s.segments[i];
      if (!cur) continue;
      var head = i === 0;
      var pad = head ? cell * 0.03 : cell * 0.1;
      var size = cell - pad * 2;
      var kind = s.hand[i] === undefined ? 0 : E.kindOf(s.hand[i]);
      var points = wrapPoints(s.prev[i], cur, alpha);
      for (var k = 0; k < points.length; k++) {
        var px = ox + points[k].x * cell, py = points[k].y * cell;
        var bx = px + pad, by = py + pad;
        if (head) {
          ctx.globalAlpha = alphaNow;
          ctx.fillStyle = winner ? P.win : color;
          ctx.fillRect(bx - 1, by - 1, size + 2, size + 2);
        }
        tileFace(kind, bx, by, size, alphaNow);
        ctx.globalAlpha = Math.max(0.6, alphaNow);
        ctx.strokeStyle = winner ? P.win : color;
        ctx.lineWidth = head ? Math.max(2, cell * 0.12) : Math.max(1.5, cell * 0.07);
        ctx.strokeRect(bx + ctx.lineWidth / 2, by + ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
        if (invincible && cell >= 8) {
          ctx.globalAlpha = 0.45 * blink;
          ctx.strokeStyle = P.win;
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1.5, py + 1.5, cell - 3, cell - 3);
        }
        ctx.globalAlpha = 1;
        if (head && k === 0 && cell >= 20) {
          ctx.font = '700 ' + Math.round(cell * 0.38) + 'px ' + P.font;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = color;
          ctx.fillText(s.def.tag, px + cell / 2, py - 1);
        }
      }
    }
  }

  function drawNotes() {
    for (var i = 0; i < game.snakes.length; i++) {
      var s = game.snakes[i];
      if (!s.note || game.now >= s.note.until) continue;
      var cellPos = s.segments.length ? s.segments[0] : s.note.cell;
      if (!cellPos) continue;
      var life = (s.note.until - game.now) / 1000;
      var alpha = Math.min(1, life * 2);
      var size = Math.max(9, Math.round(cell * 0.5));
      ctx.globalAlpha = alpha;
      ctx.font = '800 ' + size + 'px ' + P.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      var tx = ox + cellPos.x * cell + cell / 2;
      var ty = cellPos.y * cell - 3;
      ctx.fillStyle = P.line;
      ctx.fillText(s.note.text, tx + 1, ty + 1);
      ctx.fillStyle = P.players[s.id] || P.line;
      ctx.fillText(s.note.text, tx, ty);
      ctx.globalAlpha = 1;
    }
  }

  function draw(alpha) {
    if (!ctx) return;
    var px = cell * W, py = cell * H, i;
    var crashing = game.snakes.some(function (s) { return s.crash && game.now < s.crash.until; });
    var shakeX = crashing ? Math.sin(game.now / 22) * Math.max(1, cell * 0.12) : 0;
    var shakeY = crashing ? Math.cos(game.now / 18) * Math.max(1, cell * 0.1) : 0;
    ctx.setTransform(dprScale, 0, 0, dprScale, 0, 0);
    ctx.clearRect(0, 0, px, py);
    /* 撞击时整块画布轻微位移（设计文档第 57 节）。 */
    ctx.setTransform(dprScale, 0, 0, dprScale, shakeX, shakeY);
    if (bgCache) ctx.drawImage(bgCache, -12, -12, px + 24, py + 24);
    else { ctx.fillStyle = P.bg; ctx.fillRect(0, 0, px, py); }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    /* 场上麻将：能降低向听的牌轻轻抖动边框（第 42 节） */
    var wobble = (game.now % 420) < 210 ? 0 : 1;
    game.field.forEach(function (f) {
      var pad = cell * 0.12, size = cell - pad * 2;
      var jitter = f.hint > 0 ? wobble : 0;
      var bx = ox + f.x * cell + pad + jitter, by = f.y * cell + pad;
      tileFace(E.kindOf(f.tile), bx, by, size, 1);
      ctx.strokeStyle = f.hint > 0 ? P.win : P.line;
      ctx.lineWidth = Math.max(2, cell * 0.1);
      ctx.strokeRect(bx, by, size, size);
    });
    /* 飞牌动画 */
    var alive = [];
    for (i = 0; i < flights.length; i++) if (game.now < flights[i].start + flights[i].dur) alive.push(flights[i]);
    flights = alive;
    flights.forEach(function (fl) {
      var t = Math.max(0, Math.min(1, (game.now - fl.start) / fl.dur));
      var ease = 1 - (1 - t) * (1 - t);
      var x = lerp(fl.x0, fl.cx, ease), y = lerp(fl.y0, fl.cy, ease);
      var pad = cell * 0.12, size = (cell - pad * 2) * (1 - t * 0.6);
      if (fl.kind >= 0) tileFace(E.kindOf(fl.kind), ox + x * cell + pad, y * cell + pad, size, 1 - t);
    });
    game.snakes.forEach(function (s) { drawSnake(s, alpha); });
    drawNotes();
    /* 撞击闪白、胡牌闪金（设计文档第 57、25 节） */
    if (crashing) {
      ctx.globalAlpha = 0.18 + 0.18 * Math.abs(Math.sin(game.now / 40));
      ctx.fillStyle = P.line;
      ctx.fillRect(0, 0, px, py);
      ctx.globalAlpha = 1;
    }
    var sinceWin = game.now - game.overAt;
    if (game.overAt && sinceWin < 560) {
      ctx.globalAlpha = 0.34 * (1 - sinceWin / 560) * (0.5 + 0.5 * Math.abs(Math.sin(sinceWin / 40)));
      ctx.fillStyle = P.win;
      ctx.fillRect(0, 0, px, py);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, px - 3, py - 3);
  }

  /* ============================================================
   * HTML 面板：状态牌、手牌条、横幅
   * ============================================================ */
  /* 局内状态用英文短标签：小字号下比汉字清楚，也避免中文字形在小格子里的糊边。 */
  function stateLabel(s) {
    if (s.state === 'WINNER') return 'WIN';
    if (s.state === 'DEAD') return 'RESPAWN ' + Math.max(0, Math.ceil((s.respawnAt - game.now) / 1000));
    if (s.state === 'DECISION') return 'CHOOSE';
    if (isInvincible(s)) return 'INVINCIBLE ' + Math.max(1, Math.ceil((s.invincibleUntil - game.now) / 1000));
    if (s.ghost) return 'GHOST';
    if (!s.hand.length) return 'DEALING';
    return settings.hint ? shantenText(s) : s.hand.length + ' TILES';
  }
  function shantenText(s) {
    var n = E.shanten(s.hand);
    return n <= 0 ? 'TENPAI' : n + '-SHANTEN';
  }
  function renderPlates() {
    var html = '';
    game.snakes.forEach(function (s) {
      var active = viewing === s.id;
      html += '<button type="button" class="sq-plate' + (active ? ' is-active' : '') +
        '" data-view="' + s.id + '" aria-pressed="' + (active ? 'true' : 'false') +
        '" style="--sq-plate:var(' + s.def.color + ')" aria-label="' +
        s.def.name + '，' + s.hand.length + ' 张，' + stateLabel(s) + '，查看手牌">' +
        '<span class="sq-plate-name">' + s.def.name + '</span>' +
        '<span class="sq-plate-state">' + stateLabel(s) + '</span></button>';
    });
    plates.innerHTML = html;
  }
  /* 手牌条里的一张牌：按钮 + 一块只画一次的牌面画布。 */
  function tileButton(tile, index, acting) {
    var px = tilePx();
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'sq-tile' + (acting ? '' : ' is-static');
    button.dataset.index = index;
    if (!acting) button.disabled = true;
    button.setAttribute('aria-label', (acting ? '打出' : '手牌') + E.fullNameOfId(tile));
    var cv = document.createElement('canvas');
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(px * dpr);
    cv.height = Math.round(px * dpr);
    cv.style.width = px + 'px';
    cv.style.height = px + 'px';
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintTile(c, E.kindOf(tile), 0, 0, px, 1);
    button.appendChild(cv);
    return button;
  }
  function tilePx() { return window.innerWidth < 420 ? 34 : 40; }

  /* 手牌条：决策时可点；其余时间是公开信息查看器。 */
  function renderBar(force) {
    var target = snakeById(viewing) || snakeById('player');
    if (!target) return;
    var acting = target.state === 'DECISION' && target.human;
    var sig = target.id + '|' + target.hand.join(',') + '|' + (acting ? 'act' : 'read');
    if (force || sig !== barSig) {
      barSig = sig;
      bar.classList.toggle('is-acting', acting);
      tilesRow.innerHTML = '';
      if (!target.hand.length) {
        var empty = document.createElement('span');
        empty.className = 'sq-bar-empty';
        empty.textContent = 'DEALING…';
        tilesRow.appendChild(empty);
      }
      /* 决策中（14 张）把牌头挪到最右，前面空一牌的距离，像日麻的摸牌位；
         其余时候按手牌顺序平铺。 */
      var head14 = target.hand.length === BODY + 1;
      var order = target.hand.map(function (tile, i) { return i; });
      if (head14) { order.splice(0, 1); order.push(0); }
      order.forEach(function (idx, pos) {
        if (head14 && pos === order.length - 1) {
          var gap = document.createElement('span');
          gap.className = 'sq-gap';
          gap.setAttribute('aria-hidden', 'true');
          gap.style.width = tilePx() + 'px';
          tilesRow.appendChild(gap);
        }
        tilesRow.appendChild(tileButton(target.hand[idx], idx, acting));
      });
      barLabel.textContent = acting ? 'PICK ONE'
        : (viewing === 'player' || !viewing ? 'YOUR HAND' : target.def.name + ' · PUBLIC');
    }
    var me = snakeById('player');
    if (me && me.state === 'DECISION' && me.human) {
      /* 银秒用完才开始扣金秒（日麻那种两段计时）。 */
      var used = (game.now - me.decisionStart) / 1000;
      var silver = Math.max(0, SILVER_MS / 1000 - used);
      var gold = game.gold / 1000;
      silverEl.textContent = silver.toFixed(1);
      goldEl.textContent = gold.toFixed(1);
      barTimer.title = '银秒 ' + silver.toFixed(1) + '，金秒 ' + gold.toFixed(1);
      barTimer.setAttribute('aria-label', barTimer.title);
      var overGold = silver <= 0;
      barTimer.classList.toggle('is-gold', overGold);
      bar.style.setProperty('--sq-left',
        (overGold ? gold / (GOLD_MS / 1000) : silver / (SILVER_MS / 1000)) * 100 + '%');
      bar.style.setProperty('--sq-clock', overGold ? 'var(--sq-gold)' : 'var(--sq-silver)');
    } else {
      if (silverEl.textContent) silverEl.textContent = '';
      goldEl.textContent = (game.gold / 1000).toFixed(1);
      barTimer.title = '本局剩余金秒 ' + goldEl.textContent;
      barTimer.setAttribute('aria-label', barTimer.title);
      barTimer.classList.remove('is-gold');
      bar.style.setProperty('--sq-left', '0%');
    }
  }
  /* 界面图标统一用自托管 Bootstrap Icons，用 mask 取色。文字标签留给读屏与悬停提示。 */
  function icon(name, label) {
    return '<span class="ti" role="img" aria-label="' + label + '" title="' + label +
      '" style="--icon:url(/static/vendor/bootstrap-icons/' + name + '.svg' + VER + ')"></span>';
  }
  function renderHud() {
    var best = G.load().data.best;
    var labelEl = document.getElementById('hud-score-label');
    if (labelEl && !labelEl.dataset.squek) {
      labelEl.dataset.squek = '1';
      /* 图标给眼睛，sr-only 文本给读屏与 HUD 播报（播报读的是 textContent）。 */
      labelEl.innerHTML = icon('box-seam', '牌库') + '<span class="sr-only">牌库</span>';
    }
    M.hud.score(game.pool.length);
    M.hud.best(best && best.wins ? '胡牌 ' + best.wins + ' 局' : '—');
    var chip = M.hud.extra();
    if (chip) {
      if (!chip.dataset.squek) {
        chip.dataset.squek = '1';
        chip.innerHTML = '<span class="sq-stat">' + icon('grid-3x3-gap', '场上牌数') + ' <b id="sq-field">0</b></span>' +
          '<span class="sq-stat">' + icon('clock', '对局时间') + ' <b id="sq-time">0:00</b></span>' +
          '<span class="sq-stat">' + icon('speedometer2', '移动速度') + ' <b id="sq-speed">100%</b></span>';
      }
      chip.hidden = false;
      var f = document.getElementById('sq-field'), t = document.getElementById('sq-time'), sp = document.getElementById('sq-speed');
      if (f) f.textContent = game.field.length;
      if (t) t.textContent = M.fmt.clock(Math.floor(game.time));
      if (sp) sp.textContent = Math.round(game.speed * 100) + '%';
    }
  }
  var lastTilePx = 0;
  function renderAll(force) {
    if (!game.snakes.length) return;
    renderPlates();
    renderBar(force !== false);
    renderHud();
  }
  function showMsg(text) {
    if (text === msgText) return;
    msgText = text;
    msg.textContent = text;
    msg.className = 'sq-msg' + (text ? ' is-on' : '');
  }
  function bannerClass(name) { msg.classList.add(name); }
  /* 短促横幅：弃牌这类一次性反馈直接盖几帧，不额外建 DOM。 */
  function flash(text, ms) {
    flashText = text;
    flashUntil = game.now + ms;
  }
  function updateBanner() {
    if (game.phase === 'COUNTDOWN') {
      var left = game.countdownEnd - game.now;
      var step = Math.ceil(left / 800);
      showMsg(step > 3 ? 'READY' : String(step));
      return;
    }
    if (game.phase === 'OVER') { showMsg('HU'); bannerClass('is-hu'); return; }
    if (game.now < flashUntil) { showMsg(flashText); return; }
    if (game.phase === 'PLAYING' && game.now < game.countdownEnd + GO_MS) { showMsg('GO'); return; }
    /* 中央横幅只讲玩家自己的事；电脑的吃牌、撞击与重生在它蛇头上弹小字。 */
    var deciding = false, crashing = false, waiting = null;
    game.snakes.forEach(function (s) {
      if (!s.human) return;
      if (s.state === 'DECISION') deciding = true;
      if (s.crash && game.now < s.crash.until) crashing = true;
      if (s.state === 'DEAD' && !s.segments.length) waiting = s;
    });
    if (deciding) { showMsg('DRAW · PICK ONE'); bannerClass('is-big'); return; }
    if (crashing) { showMsg('CRASH'); bannerClass('is-crash'); return; }
    if (waiting) { showMsg('RESPAWN'); return; }
    var me = snakeById('player');
    if (me && isInvincible(me)) {
      showMsg('INVINCIBLE ' + Math.max(1, Math.ceil((me.invincibleUntil - game.now) / 1000)));
      return;
    }
    showMsg('');
  }

  /* ============================================================
   * 输入
   * ============================================================ */
  function queue(name) {
    var d = DIRS[name];
    if (!d || game.phase !== 'PLAYING') return;
    var s = snakeById('player');
    if (!s || !isMoving(s)) return;
    if (pendingDirs.length < 2) pendingDirs.push(d);
  }
  M.onDirectionKeys(queue);
  M.onSwipe(canvas, queue);
  canvas.addEventListener('click', function (event) {
    var s = snakeById('player');
    if (!s || s.state !== 'DECISION') return;
    var rect = canvas.getBoundingClientRect();
    var gx = Math.floor((event.clientX - rect.left) / cell);
    var gy = Math.floor((event.clientY - rect.top) / cell);
    for (var i = 0; i < s.segments.length && i < s.hand.length; i++) {
      if (s.segments[i].x === gx && s.segments[i].y === gy) { doDiscard(s, i); return; }
    }
  });
  tilesRow.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-index]');
    if (!button) return;
    var s = snakeById('player');
    if (!s || s.state !== 'DECISION') return;
    doDiscard(s, Number(button.dataset.index));
  });
  plates.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-view]');
    if (!button) return;
    var id = button.dataset.view;
    var s = snakeById('player');
    if (s && s.state === 'DECISION') viewing = 'player';
    else viewing = viewing === id ? 'player' : id;
    renderAll(true);
  });
  window.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (game.phase !== 'PLAYING' && game.phase !== 'COUNTDOWN') return;
    if (M.gamePaused()) return;
    event.preventDefault();
    M.overlay(stage, {
      title: '已暂停',
      lines: ['所有蛇、动画与倒计时都已停下。'],
      actions: [{ label: '继续游戏', primary: true, onClick: function () { lastTs = 0; } }],
      onEscape: function () { lastTs = 0; }
    });
  });

  /* ============================================================
   * 主循环
   * ============================================================ */
  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    var dt = Math.min(120, ts - lastTs);
    lastTs = ts;
    if (!M.gamePaused()) {
      game.now += dt;
      if (game.phase === 'PLAYING') {
        acc += dt;
        var guard = 0;
        while (acc >= stepMs() && guard < 4) { acc -= stepMs(); step(); guard++; }
        if (guard >= 4) acc = 0;
      } else {
        acc = 0;
      }
      timers(dt);
      updateBanner();
      hudAcc += dt;
      if (hudAcc >= 200) { hudAcc = 0; renderHud(); renderPlates(); }
      renderBar(false);
    }
    draw(game.phase === 'PLAYING' ? Math.min(1, acc / stepMs()) : 1);
  }

  /* ============================================================
   * 启动
   * ============================================================ */
  function startRound() {
    M.clearOverlays(stage);
    lastTs = 0; acc = 0; hudAcc = 0; msgText = '';
    newGame();
    if (!rafId) rafId = requestAnimationFrame(loop);
    if (!settings.seen) {
      settings.seen = true;
      G.update(function (d) { d.settings.seen = true; });
    } else {
      G.update(function (d) { d.settings.difficulty = settings.difficulty; });
    }
    updateBanner();
  }
  function showStart() {
    var best = G.load().data.best;
    var lines = settings.seen
      ? ['吃牌凑成四组牌加一对牌就赢。地图上下左右是循环的，撞自己或撞到别的蛇会重生换一副手牌。',
        '场上常驻四张麻将。吃满十四张后选一张打掉：每次思考 12 银秒，不够用再扣每局共用的 30 金秒。']
      : ['MOVE｜方向键 / WASD 转向，也可以在地图上滑动',
        'EAT A TILE｜蛇头碰到麻将就吃进来',
        'DISCARD ONE｜吃满十四张，点一张打掉（每次 12 银秒 + 每局 30 金秒）',
        'MAKE A HAND｜四组牌加一对牌就能胡',
        'WRAP AROUND｜走出边界会从对边回来',
        'CRASH = NEW HAND｜撞到自己或别的蛇会重生并换一副手牌'];
    lines.push('当前难度：' + (DIFF_LABEL[settings.difficulty] || '普通'));
    lines.push(best && best.wins ? '已胡牌 ' + best.wins + ' 局' : '还没有胡过牌');
    M.overlay(stage, {
      intro: true,
      title: '雀蛇',
      label: '开始雀蛇',
      lines: lines,
      actions: [
        { label: '开始游戏', primary: true, onClick: startRound },
        { label: '换难度', onClick: showDifficulty }
      ]
    });
  }
  function showDifficulty() {
    function pick(name) {
      return {
        label: DIFF_LABEL[name],
        onClick: function () {
          settings.difficulty = name;
          G.update(function (d) { d.settings.difficulty = name; });
          startRound();
        }
      };
    }
    M.overlay(stage, {
      title: '难度',
      lines: ['难度只改电脑的判断力与反应频率，不加快它们的移动速度。'],
      actions: [pick('casual'), pick('normal'), pick('hard')]
    });
  }
  /* 设置面板：等 game-ui.js 建好弹窗后再补进去（它在页面脚本之后执行）。 */
  function buildSettings() {
    var content = document.querySelector('.game-settings-content');
    if (!content || content.querySelector('.sq-settings')) return;
    var box = document.createElement('div');
    box.className = 'sq-settings';
    box.innerHTML =
      '<label class="sq-field"><span>难度</span><select id="sq-difficulty">' +
      '<option value="casual">休闲</option><option value="normal">普通</option><option value="hard">困难</option>' +
      '</select></label>' +
      '<label class="sq-check"><input type="checkbox" id="sq-hint"> 显示向听提示</label>' +
      '<label class="sq-check"><input type="checkbox" id="sq-sound"> 播放音效</label>';
    content.appendChild(box);
    var difficulty = box.querySelector('#sq-difficulty');
    var hint = box.querySelector('#sq-hint');
    var sound = box.querySelector('#sq-sound');
    difficulty.value = settings.difficulty;
    hint.checked = settings.hint;
    sound.checked = settings.sound;
    difficulty.addEventListener('change', function () {
      settings.difficulty = difficulty.value;
      G.update(function (d) { d.settings.difficulty = settings.difficulty; });
      renderAll(true);
    });
    hint.addEventListener('change', function () {
      settings.hint = hint.checked;
      G.update(function (d) { d.settings.hint = settings.hint; });
      renderAll(true);
    });
    sound.addEventListener('change', function () {
      settings.sound = sound.checked;
      G.update(function (d) { d.settings.sound = settings.sound; });
      if (settings.sound) sfx.eat();
    });
  }

  M.onRestart(function () {
    if (game.phase === 'MENU') { showStart(); return; }
    M.confirm({
      title: '重新开始',
      copy: '当前对局会被放弃，四条蛇重新发牌。',
      confirmLabel: '重新开始',
      onConfirm: startRound
    });
  });

  readPalette();
  window.addEventListener('themechange', function () {
    readPalette();
    buildBackground(cell * W, cell * H);
    draw(1);
  });
  window.addEventListener('resize', fit);
  new ResizeObserver(fit).observe(stage);
  fit();
  renderHud();
  M.hud.best(save.best && save.best.wins ? '胡牌 ' + save.best.wins + ' 局' : '—');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildSettings);
  else buildSettings();
  showStart();

  /* 浏览器回归测试用的只读状态与转向入口：与键盘输入走同一条队列。 */
  M.squek = {
    state: function () {
      return {
        phase: game.phase, time: game.time, pool: game.pool.length, speed: game.speed,
        gold: game.gold, silver: SILVER_MS,
        stepMs: BASE_STEP,
        field: game.field.map(function (f) {
          return { x: f.x, y: f.y, tile: E.labelOfId(f.tile), name: E.fullNameOfId(f.tile) };
        }),
        winner: game.winner ? game.winner.def.name : null,
        huForm: game.huForm, doubleHu: game.doubleHu,
        snakes: game.snakes.map(function (s) {
          return {
            id: s.id, state: s.state, hand: s.hand.map(E.labelOfId), tiles: s.hand.length,
            head: s.segments[0] || null, headTile: s.hand.length ? E.labelOfId(s.hand[0]) : null,
            handKinds: s.hand.map(E.kindOf),
            dir: { x: s.dir.x, y: s.dir.y },
            body: s.segments.map(function (c) { return { x: c.x, y: c.y }; }),
            ghost: s.ghost, invincible: isInvincible(s), deaths: s.deathCount
          };
        })
      };
    },
    steer: function (dir) { queue(dir); return pendingDirs.length; }
  };
})(window.App);
