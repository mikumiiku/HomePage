'use strict';
/* 雀蛇麻将引擎回归：牌池守恒、理牌、向听数、三种和牌型、牌价值。 */
const assert = require('node:assert/strict');
const E = require('../web/static/js/games/squek-engine.js');

let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }

/* 「123m」这样的简写转成牌 id 数组：m/p/s 数字牌，z 字牌（1 东 … 7 白）。 */
function hand(text) {
  const out = [];
  for (const chunk of text.trim().split(/\s+/)) {
    const m = /^(\d+)([mpsz])$/.exec(chunk);
    assert(m, '非法牌组 ' + chunk);
    for (const digit of m[1]) out.push(E.tileOf(E.kindOfTile(m[2], Number(digit)), 0));
  }
  return out;
}

test('牌池为 136 张标准麻将，每种 4 张', () => {
  const wall = E.makeWall();
  assert.equal(wall.length, E.TOTAL);
  assert.equal(new Set(wall).size, E.TOTAL);
  const c = E.countKinds(wall);
  for (let k = 0; k < E.KINDS; k++) assert.equal(c[k], 4, '种类 ' + k);
  const wall2 = E.makeWall();
  assert.notDeepEqual(wall, wall2);
});

test('牌面名称：数字牌用花色，字牌用传统叫法', () => {
  assert.equal(E.label(E.kindOfTile('m', 3)), '3万');
  assert.equal(E.label(E.kindOfTile('p', 9)), '9筒');
  assert.equal(E.label(E.kindOfTile('s', 1)), '1条');
  assert.equal(E.label(E.kindOfTile('z', 5)), '中');
  assert.equal(E.fullName(E.kindOfTile('m', 3)), '三万');
  assert.equal(E.fullName(E.kindOfTile('z', 5)), '红中');
  assert.equal(E.fullName(E.kindOfTile('z', 7)), '白板');
});

test('理牌顺序：万筒条字，字牌东南西北中发白', () => {
  const messy = hand('3z 2z 1p 9s 1m 7z 1s');
  const names = E.sortHand(messy).map(E.fullNameOfId);
  assert.deepEqual(names, ['一万', '一筒', '一条', '九条', '南风', '西风', '白板']);
});

test('向听数：和牌、听牌、两向听与十三幺、七对子', () => {
  assert.equal(E.shanten(hand('123m 456m 789m 123p 55s')), -1);
  assert.equal(E.winForm(hand('123m 456m 789m 123p 55s')), '标准胡');
  assert.equal(E.shanten(hand('123m 456m 789m 123p 5s')), 0);
  assert.equal(E.shanten(hand('1122334455667m')), 0, '七对子听牌');
  assert.equal(E.shanten(hand('1122334455m 1166p')), -1);
  assert.equal(E.winForm(hand('1122334455m 1166p')), '七对子');
  /* 11223344556677m 既是七对子也是标准胡，按标准胡优先。 */
  assert.equal(E.winForm(hand('11223344556677m')), '标准胡');
  assert.equal(E.shanten(hand('19m 19p 19s 1234567z')), 0, '十三幺听牌');
  assert.equal(E.shanten(hand('19m 19p 19s 12345677z')), -1);
  assert.equal(E.winForm(hand('19m 19p 19s 12345677z')), '十三幺');
  assert.equal(E.winForm(hand('19m 19p 19s 1234567z')), null, '十三张不成和');
});

test('向听数单调：摸到进张不会变差', () => {
  const base = hand('123m 456m 789m 12p 77s');
  assert.equal(E.shanten(base), 0);
  const improved = base.concat(hand('3p'));
  assert.equal(E.shanten(improved), -1);
  const cold = base.concat(hand('1z'));
  assert.equal(E.shanten(cold), 0);
});

test('吃牌收益：进张为正、废牌为零', () => {
  const base = hand('123m 456m 789m 12p 77s');
  assert.equal(E.tileGain(base, E.kindOfTile('p', 3)), 1);
  assert.equal(E.tileGain(base, E.kindOfTile('m', 1)), 0);
  assert.equal(E.hazard(base, E.kindOfTile('p', 3)), 2, '吃进直接和牌');
  const mid = hand('123m 456m 78m 12p 77s 2z');
  assert.equal(E.hazard(mid, E.kindOfTile('m', 9)), 1);
  assert.equal(E.hazard(mid, E.kindOfTile('z', 7)), 0);
});

test('有效牌统计忽略已见张', () => {
  const c = E.countKinds(hand('123m 456m 789m 12p 77s'));
  const seen = new Int8Array(E.KINDS);
  const open = E.ukeire(c, seen);
  assert(open > 0, '听牌应有有效牌');
  /* 把 3p 的四张全部记成已见，有效牌只剩 3s（两种听口之一的张数减少）。 */
  seen[E.kindOfTile('p', 3)] = 4;
  assert(E.ukeire(c, seen) < open);
  seen[E.kindOfTile('p', 3)] = 0;
  seen[E.kindOfTile('s', 3)] = 4;
  assert.equal(E.ukeire(c, seen), 4, '只等 3p，剩四张');
});

test('弃牌排序：优先打掉孤张字牌', () => {
  const fourteen = hand('123m 456m 789m 12p 77s 1z');
  const order = E.discardOrder(fourteen, new Int8Array(E.KINDS));
  assert.equal(E.fullNameOfId(fourteen[order[0]]), '东风');
  const worst = E.worstTile(fourteen, new Int8Array(E.KINDS));
  assert.equal(worst.name, '东风');
  const rank = E.discardRanking(fourteen, new Int8Array(E.KINDS));
  assert.equal(rank[0].shanten, 0, '打掉东风后仍然听牌');
});

test('弃牌排序返回全部手牌且不重复', () => {
  const fourteen = hand('123456789m 1234p 5s');
  const order = E.discardOrder(fourteen, new Int8Array(E.KINDS));
  assert.equal(order.length, 14);
  assert.equal(new Set(order).size, 14);
});

test('引擎在整副牌下不超时（AI 每 200ms 复用）', () => {
  const wall = E.makeWall();
  const seen = new Int8Array(E.KINDS);
  for (let i = 0; i < 52; i++) seen[E.kindOf(wall[i])]++;
  const thirteen = wall.slice(52, 65);
  const started = Date.now();
  for (let i = 0; i < 40; i++) E.discardRanking(thirteen.concat([wall[65]]), seen);
  const cost = (Date.now() - started) / 40;
  assert(cost < 40, '单次弃牌评估耗时 ' + cost.toFixed(1) + 'ms 过高');
});

console.log('PASS: ' + count + ' engine cases');
