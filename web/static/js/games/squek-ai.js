/* 雀蛇 · 电脑对手：三种性格 + 三档难度。
 * 只做「往哪走」和「打哪张」两个决策；移动、碰撞、计时都由 squek.js 负责。
 *
 * 目标评分 = 麻将价值 × 安全系数 ÷ 路径成本（设计文档第 36 节）。
 * 路径用 BFS 在危险地图上求：蛇身是障碍，其他蛇头前方一格是风险区。
 * 地图边界是循环的，BFS 与预判都在环面（torus）上计算。 */
(function (root) {
  'use strict';
  var E = root.SquekEngine;
  if (!E && typeof require === 'function') E = require('./squek-engine.js');

  var DIRS = [
    { x: 1, y: 0, name: 'right' }, { x: -1, y: 0, name: 'left' },
    { x: 0, y: 1, name: 'down' }, { x: 0, y: -1, name: 'up' }
  ];

  /* 三种性格：牌效率 / 抢牌 / 干扰（设计文档第 39 节）。 */
  var PERSONALITIES = {
    cpu1: { id: 'cpu1', name: 'CPU.01', style: '牌效率', value: 1.0, denial: 0, contest: 0, risk: 1.4, roam: 0.7 },
    cpu2: { id: 'cpu2', name: 'CPU.02', style: '抢牌', value: 1.0, denial: 0.1, contest: 0.45, risk: 0.7, roam: 1.1 },
    cpu3: { id: 'cpu3', name: 'CPU.03', style: '干扰', value: 0.92, denial: 0.85, contest: 0.2, risk: 1.0, roam: 0.9 }
  };
  /* 难度只改判断力与反应频率，不改移动速度（设计文档第 72 节）。 */
  var PROFILES = {
    casual: { think: 340, risk: 0.7, area: 0.7, breadth: 3, predict: 0 },
    normal: { think: 200, risk: 1.0, area: 1.0, breadth: 2, predict: 1 },
    hard: { think: 130, risk: 1.4, area: 1.5, breadth: 1, predict: 2 }
  };
  function profileOf(name) { return PROFILES[name] || PROFILES.normal; }
  function personalityOf(id) { return PERSONALITIES[id] || PERSONALITIES.cpu1; }

  /* 麻将价值：向听前进一歩 100 分，直接和牌 10000 分；
     别人越需要这张牌，干扰型越想抢（设计文档第 39 节 CPU.03）。 */
  function tileValue(view, kind) {
    var p = view.personality;
    var hand = view.self.hand;
    var probe = hand.concat([E.tileOf(kind, 0)]);
    if (E.winForm(probe)) return 10000;
    var gain = E.tileGain(hand, kind);
    var special = specialBonus(hand, kind);
    var maxOpp = 0;
    for (var i = 0; i < view.opponents.length; i++) {
      var g = E.tileGain(view.opponents[i], kind);
      if (g > maxOpp) maxOpp = g;
    }
    var score = 100 * gain * p.value + 30 * special;
    score += 100 * maxOpp * p.denial;
    if (gain > 0 && maxOpp > 0) score += 120 * p.contest;
    if (score <= 0) score = 22 * p.roam;
    return score;
  }
  /* 特殊牌型潜力：对子多时看七对，幺九多时看十三幺。 */
  function specialBonus(hand, kind) {
    var c = E.countKinds(hand), pairs = 0, orphans = 0;
    for (var k = 0; k < E.KINDS; k++) {
      if (c[k] >= 2) pairs++;
      if (c[k] > 0 && E.isOrphan(k)) orphans++;
    }
    var bonus = 0;
    if (pairs >= 5 && c[kind] >= 1 && c[kind] < 4) bonus += 2;
    if (orphans >= 9 && E.isOrphan(kind) && c[kind] === 0) bonus += 2;
    return bonus;
  }

  /* 建地图：0 可走，1 阻挡。自己的尾巴下一步会让开，算可走；
     别人的尾巴保守当成墙，避免对方吃牌后自己撞上去。 */
  function buildGrid(view) {
    var w = view.w, h = view.h, blocked = new Uint8Array(w * h), risk = new Uint8Array(w * h);
    function mark(body, skipTail) {
      for (var i = 0; i < body.length; i++) {
        if (skipTail && i === body.length - 1) continue;
        blocked[body[i].y * w + body[i].x] = 1;
      }
    }
    mark(view.self.body, true);
    for (var i = 0; i < view.snakes.length; i++) {
      var s = view.snakes[i];
      if (s.ghost || s.invincible) continue;   // 决策态与无敌期不构成障碍
      mark(s.body, false);
    }
    /* 风险区：其他蛇头下一步可能到达的格子（设计文档第 38 节预判）。 */
    var steps = Math.max(1, view.profile.predict);
    for (var j = 0; j < view.snakes.length; j++) {
      var o = view.snakes[j];
      if (o.ghost) continue;
      for (var d = 0; d < DIRS.length; d++) {
        var nx = o.head.x, ny = o.head.y;
        for (var step = 1; step <= steps; step++) {
          nx = (nx + DIRS[d].x + w) % w;
          ny = (ny + DIRS[d].y + h) % h;
          risk[ny * w + nx] += 1;
          if (blocked[ny * w + nx]) break;
        }
      }
    }
    return { blocked: blocked, risk: risk };
  }

  /* 从某格做 BFS（边界环绕）：返回距离表（-1 不可达）与可达格数。 */
  function bfs(grid, w, h, sx, sy) {
    var dist = new Int16Array(w * h).fill(-1);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h || grid.blocked[sy * w + sx]) {
      return { dist: dist, area: 0 };
    }
    var queue = new Int32Array(w * h), head = 0, tail = 0;
    dist[sy * w + sx] = 0;
    queue[tail++] = sy * w + sx;
    var area = 0;
    while (head < tail) {
      var at = queue[head++], x = at % w, y = (at / w) | 0;
      area++;
      for (var d = 0; d < DIRS.length; d++) {
        var nx = (x + DIRS[d].x + w) % w, ny = (y + DIRS[d].y + h) % h;
        var np = ny * w + nx;
        if (dist[np] !== -1 || grid.blocked[np]) continue;
        dist[np] = dist[at] + 1;
        queue[tail++] = np;
      }
    }
    return { dist: dist, area: area };
  }

  /* 选中方向后，看它的下一格是否紧贴其他蛇头（会撞死）。 */
  function headDanger(view, x, y) {
    var danger = 0;
    for (var i = 0; i < view.snakes.length; i++) {
      var o = view.snakes[i];
      var step = Math.max(1, view.profile.predict);
      var ox = o.head.x, oy = o.head.y;
      for (var s = 1; s <= step; s++) {
        ox = (ox + o.dir.x + view.w) % view.w;
        oy = (oy + o.dir.y + view.h) % view.h;
        if (ox === x && oy === y) { danger += s === 1 ? 3 : 1; break; }
      }
      /* 换位：双方同时踩进对方当前蛇头，视为对撞。 */
      if (o.head.x === x && o.head.y === y) danger += 4;
    }
    return danger;
  }

  /* 选择方向。view 见文件头说明；返回 { dir, x, y, score } 或 null（无路可走）。 */
  function chooseMove(view) {
    var w = view.w, h = view.h, self = view.self, profile = view.profile;
    var grid = buildGrid(view);
    var reverse = { x: -self.dir.x, y: -self.dir.y };
    var options = [];
    for (var d = 0; d < DIRS.length; d++) {
      var dir = DIRS[d];
      if (dir.x === reverse.x && dir.y === reverse.y) continue;
      var nx = (self.head.x + dir.x + w) % w, ny = (self.head.y + dir.y + h) % h;
      var np = ny * w + nx;
      if (grid.blocked[np]) continue;
      var path = bfs(grid, w, h, nx, ny);
      if (path.area === 0) continue;
      var danger = headDanger(view, nx, ny);
      var riskCells = grid.risk[np];
      /* 安全系数：空间不够（可能把自己困死）与其他蛇头贴近都会压低它。 */
      var room = Math.min(1.5, path.area / (self.body.length + 4));
      var trap = path.area < self.body.length ? 0.25 : 1;
      var safety = trap / (1 + (danger * 0.8 + riskCells * 0.25) * profile.risk);
      /* 目标牌：价值 ÷ 路径成本，取可达的场上牌里最优的一张。 */
      var best = 0, bestKind = -1;
      for (var t = 0; t < view.tiles.length; t++) {
        var tile = view.tiles[t];
        var dist = path.dist[tile.y * w + tile.x];
        if (dist < 0) continue;
        var score = tileValue(view, tile.kind) / (dist + 2);
        if (score > best) { best = score; bestKind = tile.kind; }
      }
      /* 抢不到牌也要保证活得下去：空间给一个不超过牌面量级的保底分。 */
      options.push({
        dir: dir, x: nx, y: ny,
        score: best * safety + room * 8 * profile.area * safety,
        area: path.area, safety: safety, tile: bestKind, chasing: best > 0
      });
    }
    if (!options.length) return null;
    options.sort(function (a, b) { return b.score - a.score; });
    var breadth = Math.max(1, profile.breadth);
    /* 低难度在近似解里随机挑一个，避免每次走法一模一样。 */
    var pick = options[0];
    if (breadth > 1 && options.length > 1) {
      var pool = options.filter(function (o) { return o.score >= options[0].score * 0.92; }).slice(0, breadth);
      if (pool.length > 1) pick = pool[Math.floor(Math.random() * pool.length)];
    }
    return pick;
  }

  /* 弃牌：引擎给出「打出哪张最不亏」，抢牌型偶尔留一张高价进张。 */
  function chooseDiscard(hand, seen, personality) {
    var order = E.discardOrder(hand, seen);
    if (!order.length) return -1;
    var p = personality || PERSONALITIES.cpu1;
    if (p.style === '抢牌' && hand.length > 1 && Math.random() < 0.15) return order[Math.min(1, order.length - 1)];
    /* 打最右侧的同种牌，保证结果稳定。 */
    var kind = E.kindOf(hand[order[0]]), pick = order[0];
    for (var i = 0; i < hand.length; i++) if (E.kindOf(hand[i]) === kind) pick = i;
    return pick;
  }

  var api = {
    DIRS: DIRS, PERSONALITIES: PERSONALITIES, PROFILES: PROFILES,
    profileOf: profileOf, personalityOf: personalityOf,
    tileValue: tileValue, buildGrid: buildGrid, bfs: bfs,
    chooseMove: chooseMove, chooseDiscard: chooseDiscard
  };
  root.SquekAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
