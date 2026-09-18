'use strict';
/* 雀蛇 AI 回归：追牌、避墙、被围死、三种性格的取舍、地图阻挡规则。 */
const assert = require('node:assert/strict');
const E = require('../web/static/js/games/squek-engine.js');
const AI = require('../web/static/js/games/squek-ai.js');

let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }
function hand(text) {
  const out = [];
  for (const chunk of text.trim().split(/\s+/)) {
    const m = /^(\d+)([mpsz])$/.exec(chunk);
    for (const digit of m[1]) out.push(E.tileOf(E.kindOfTile(m[2], Number(digit)), 0));
  }
  return out;
}
function body(cells) { return cells.map(([x, y]) => ({ x, y })); }
function view(extra) {
  return Object.assign({
    w: 20, h: 12,
    self: { head: { x: 2, y: 5 }, dir: { x: 1, y: 0 }, body: body([[2, 5], [1, 5], [0, 5]]), hand: hand('123m 456m 789m 12p 77s') },
    snakes: [], opponents: [], tiles: [], ghosts: [],
    personality: AI.PERSONALITIES.cpu1, profile: AI.PROFILES.normal
  }, extra || {});
}

test('追胡牌进张：直接朝能胡的那张牌走', () => {
  const v = view({ tiles: [{ x: 10, y: 5, kind: E.kindOfTile('p', 3) }] });
  const move = AI.chooseMove(v);
  assert(move);
  assert.deepEqual(move.dir, { x: 1, y: 0, name: 'right' });
  assert.equal(move.chasing, true);
});

test('不会掉头，也不会走出边界', () => {
  const v = view({
    self: { head: { x: 19, y: 5 }, dir: { x: 1, y: 0 }, body: body([[19, 5], [18, 5], [17, 5]]), hand: hand('123m 456m 789m 12p 77s') },
    tiles: [{ x: 8, y: 5, kind: E.kindOfTile('p', 3) }]
  });
  const move = AI.chooseMove(v);
  assert(move, '必须选一个方向');
  assert(!(move.dir.x === -1 && move.dir.y === 0), '不能掉头');
  assert(move.x >= 0 && move.y >= 0 && move.x < v.w && move.y < v.h);
});

test('被蛇身围死时返回 null', () => {
  /* 前后左右分别被自己的身体与另一条蛇堵住。 */
  const v = view({
    self: { head: { x: 5, y: 5 }, dir: { x: 1, y: 0 }, body: body([[5, 5], [4, 5]]), hand: hand('123m 456m 789m 12p 77s') },
    snakes: [{ id: 'cpu1', head: { x: 3, y: 5 }, dir: { x: -1, y: 0 }, body: body([[3, 5], [6, 5], [5, 4], [5, 6]]), ghost: false, invincible: false }]
  });
  assert.equal(AI.chooseMove(v), null);
});

test('决策态与无敌蛇不构成障碍', () => {
  const ghost = { id: 'cpu1', head: { x: 3, y: 5 }, dir: { x: -1, y: 0 }, body: body([[3, 5], [6, 5], [5, 4], [5, 6]]), ghost: true, invincible: false };
  const v = view({
    self: { head: { x: 5, y: 5 }, dir: { x: 1, y: 0 }, body: body([[5, 5], [4, 5]]), hand: hand('123m 456m 789m 12p 77s') },
    snakes: [ghost]
  });
  const move = AI.chooseMove(v);
  assert(move, '幽灵蛇不该把路堵死');
  assert(!(move.x === 4 && move.y === 5), '不能钻进自己的脖子');
  assert(move.x >= 0 && move.y >= 0 && move.x < v.w && move.y < v.h);
});

test('干扰型会为别人急需的牌加价', () => {
  /* 自己已经三面子加一对，吃 5条 毫无帮助；对手却在等这张 5条 和牌。 */
  const base = {
    self: { hand: hand('123m 456m 789m 11p 2z 3z') },
    opponents: [hand('123m 456m 789m 123p 5s')]
  };
  const theirs = E.kindOfTile('s', 5);
  const useless = E.kindOfTile('z', 5);
  const effTheirs = AI.tileValue(Object.assign({ personality: AI.PERSONALITIES.cpu1 }, base), theirs);
  const effUseless = AI.tileValue(Object.assign({ personality: AI.PERSONALITIES.cpu1 }, base), useless);
  assert.equal(effTheirs, effUseless, '牌效率型对两张废牌一视同仁');
  const denyTheirs = AI.tileValue(Object.assign({ personality: AI.PERSONALITIES.cpu3 }, base), theirs);
  const denyUseless = AI.tileValue(Object.assign({ personality: AI.PERSONALITIES.cpu3 }, base), useless);
  assert(denyTheirs > denyUseless, '干扰型更愿意抢走对手的进张');
  assert(denyTheirs > effTheirs);
});

test('抢牌型愿意为双方都要的牌加价', () => {
  const kind = E.kindOfTile('p', 3);
  const base = {
    self: { hand: hand('123m 456m 789m 12p 7s') },
    opponents: [hand('123m 456m 789m 12p 7s')]
  };
  const eff = AI.tileValue(Object.assign({ personality: AI.PERSONALITIES.cpu1 }, base), kind);
  const contest = AI.tileValue(Object.assign({ personality: AI.PERSONALITIES.cpu2 }, base), kind);
  const deny = AI.tileValue(Object.assign({ personality: AI.PERSONALITIES.cpu3 }, base), kind);
  assert(contest > eff, '抢牌型加分');
  assert(deny > eff, '干扰型也加分');
});

test('路径与预判在循环边界上计算', () => {
  const grid = { blocked: new Uint8Array(20 * 12), risk: new Uint8Array(20 * 12) };
  const path = AI.bfs(grid, 20, 12, 0, 5);
  assert.equal(path.dist[5 * 20 + 19], 1, '从左边出去应该一步到右边');
  assert.equal(path.area, 20 * 12, '空场上整块地图都可达');
  /* 蛇头在最右边向右走，目标在左边：穿过边界才是最近的路。 */
  const v = view({
    self: { head: { x: 19, y: 5 }, dir: { x: 1, y: 0 }, body: body([[19, 5], [18, 5]]), hand: hand('123m 456m 789m 12p 77s') },
    tiles: [{ x: 2, y: 5, kind: E.kindOfTile('p', 3) }]
  });
  const move = AI.chooseMove(v);
  assert(move);
  assert.deepEqual(move.dir, { x: 1, y: 0, name: 'right' }, '绕边界比绕回去更近');
});

test('弃牌选择返回合法下标', () => {
  const fourteen = hand('123m 456m 789m 12p 77s 1z');
  const index = AI.chooseDiscard(fourteen, new Int8Array(E.KINDS), AI.PERSONALITIES.cpu1);
  assert(Number.isInteger(index) && index >= 0 && index < fourteen.length);
  assert.equal(E.fullNameOfId(fourteen[index]), '东风');
  assert.equal(AI.chooseDiscard([], new Int8Array(E.KINDS)), -1);
});

test('整副牌开局的决策耗时可控', () => {
  const wall = E.makeWall();
  const seen = new Int8Array(E.KINDS);
  for (let i = 0; i < 56; i++) seen[E.kindOf(wall[i])]++;
  const v = view({
    self: { head: { x: 5, y: 5 }, dir: { x: 1, y: 0 }, body: body([[5, 5], [4, 5], [3, 5]]), hand: wall.slice(0, 13).sort() },
    snakes: [
      { id: 'a', head: { x: 15, y: 3 }, dir: { x: -1, y: 0 }, body: body([[15, 3], [16, 3]]), ghost: false, invincible: false },
      { id: 'b', head: { x: 15, y: 9 }, dir: { x: -1, y: 0 }, body: body([[15, 9], [16, 9]]), ghost: false, invincible: false }
    ],
    opponents: [wall.slice(13, 26), wall.slice(26, 39), wall.slice(39, 52)],
    tiles: [0, 1, 2, 3].map(i => ({ x: 5 + i * 3, y: 2 + i, kind: E.kindOf(wall[56 + i]) }))
  });
  const started = Date.now();
  for (let i = 0; i < 60; i++) AI.chooseMove(v);
  const cost = (Date.now() - started) / 60;
  assert(cost < 12, '单次决策耗时 ' + cost.toFixed(1) + 'ms 过高');
});

console.log('PASS: ' + count + ' ai cases');
