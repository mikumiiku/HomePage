/* ============================================================
 * schemas.js —— 所有存档结构的唯一登记处
 *
 * 新增游戏：在这里 defineSlot 登记 main 槽位即可，store 会完成其余一切。
 * 改造结构：version + 1，并在 migrations 里登记 旧版本号 -> 迁移函数。
 *
 * 顶层分区约定（所有游戏保持一致）：
 *   best     纪录；stats 累计统计；settings 玩家偏好；session 进行中对局（可选）
 * ============================================================ */
(function (M) {
  'use strict';
  var D = M.store.defineSlot;

  D('chess', 'main', {
    version: 1,
    defaults: function () { return { best: { wins: 0 }, stats: { games: 0, wins: 0, draws: 0 }, settings: { mode: 'ai', level: 'normal', color: 'w' }, session: null }; },
    bestText: function (b) { return b && b.wins > 0 ? '人机获胜 ' + b.wins + ' 局' : null; }
  });

  D('gomoku', 'main', {
    version: 1,
    defaults: function () {
      return {
        best: { streak: 0 },
        stats: { buckets: {} },
        settings: { mode: 'ai', level: 'normal', color: 'black', confirm: false, numbers: false },
        session: null
      };
    },
    bestText: function (b) { return b && b.streak > 0 ? '最佳 ' + b.streak + ' 连胜' : null; }
  });

  D('go', 'main', {
    version: 1,
    defaults: function () {
      return {
        best: { streak: 0 },
        stats: { buckets: {} },
        settings: { mode: 'ai', size: 9, level: 'normal', color: 'black', confirm: 'auto', numbers: false },
        session: null
      };
    },
    bestText: function (b) { return b && b.streak > 0 ? '最佳 ' + b.streak + ' 连胜' : null; }
  });

  D('2048', 'main', {
    version: 1,
    defaults: function () {
      return {
        best: { score: 0, maxTile: 0 },
        stats: { games: 0, totalMoves: 0 },
        settings: {},
        session: null, // { board: number[16], score, won } 退出时的棋盘，用于续玩
      };
    },
    bestText: function (b) { return b && b.score > 0 ? b.score + ' 分' : null; },
  });

  D('snake', 'main', {
    version: 1,
    defaults: function () {
      return {
        best: { score: 0 },
        stats: { games: 0, foodEaten: 0 },
        settings: {},
      };
    },
    bestText: function (b) { return b && b.score > 0 ? b.score + ' 分' : null; },
  });

  D('squek', 'main', {
    version: 1,
    defaults: function () {
      return {
        best: { wins: 0, fastest: 0 },
        stats: { games: 0, wins: 0, doubleHu: 0, crashes: 0 },
        settings: { difficulty: 'normal', hint: true, sound: true, seen: false },
      };
    },
    bestText: function (b) { return b && b.wins > 0 ? '胡牌 ' + b.wins + ' 局' : null; },
  });

  D('memory', 'main', {
    version: 1,
    defaults: function () {
      return {
        best: { easy: { moves: 0, seconds: 0 }, hard: { moves: 0, seconds: 0 } },
        stats: { games: 0 },
        settings: { difficulty: 'easy' },
      };
    },
    bestText: function (b) {
      if (!b) return null;
      var moves = ['easy', 'hard']
        .map(function (k) { return b[k] && b[k].moves; })
        .filter(function (m) { return m > 0; });
      if (!moves.length) return null;
      return '最少 ' + Math.min.apply(null, moves) + ' 步';
    },
  });

  D('minesweeper', 'main', {
    version: 1,
    defaults: function () {
      return {
        best: { easy: { seconds: 0 }, hard: { seconds: 0 } },
        stats: { games: 0, wins: 0 },
        settings: { difficulty: 'easy', flagMode: false },
      };
    },
    bestText: function (b) {
      if (!b) return null;
      var ts = ['easy', 'hard']
        .map(function (k) { return b[k] && b[k].seconds; })
        .filter(function (t) { return t > 0; });
      if (!ts.length) return null;
      return '最快 ' + Math.min.apply(null, ts) + ' 秒';
    },
  });

  D('tetris', 'main', {
    version: 1,
    defaults: function () {
      return {
        best: { score: 0, lines: 0 },
        stats: { games: 0 },
        settings: {},
      };
    },
    bestText: function (b) { return b && b.score > 0 ? b.score + ' 分' : null; },
  });

  D('swipe', 'main', {
    version: 1,
    defaults: function () {
      return {
        best: { score: 0, combo: 0 },
        stats: { games: 0, arrows: 0 },
        settings: {},
      };
    },
    bestText: function (b) { return b && b.score > 0 ? b.score + ' 分' : null; },
  });

  D('sandstrike', 'main', {
    version: 2,
    migrations: { 1: function (d) { d.settings.primary = 'rifle'; return d; } },
    defaults: function () {
      return { best: { score: 0 }, stats: { games: 0, wins: 0, kills: 0, headshots: 0 }, settings: { sound: true, primary: 'rifle' } };
    },
    bestText: function (b) { return b && b.score > 0 ? b.score + ' 分' : null; },
  });

  D('app', 'chat', {
    version: 2,
    migrations: {1: function (d) {
      d.settings.profiles.forEach(function (p) { p.models = p.model ? [p.model] : []; p.reasoning = ''; });
      return d;
    }},
    defaults: function () {
      return {best: {}, stats: {}, settings: {profiles: [], selected: ''}, session: {active: '', threads: []}};
    },
  });

  /* —— App 级槽位（跨游戏） —— */

  // 游玩足迹：首页「最近在玩」条
  D('app', 'activity', {
    version: 1,
    defaults: function () {
      return {
        counts: {},   // { gameId: 次数 }
        recent: [],   // [{ g: gameId, t: 最近游玩时间戳 }]，新在前，最多 12 条
      };
    },
  });
  // 外观偏好：亮暗主题（'' = 跟随系统）+ 主页背景图（dataURL，可能较大，读写仅限主页）
  D('app', 'appearance', {
    version: 1,
    defaults: function () {
      return { theme: '', heroImage: null };
    },
  });
})(window.App);
