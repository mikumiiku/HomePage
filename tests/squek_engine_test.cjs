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

/* 评分助手：hand('123m 55s') 配和牌张 'm4'，返回 scoreHand 的结果。 */
function score(text, win) {
  const h = hand(text);
  return E.scoreHand(h, win ? E.kindOfTile(win[0], Number(win[1])) : undefined);
}
function names(s) { return s.yaku.map((y) => y.name); }

test('通常役：平和、断幺九、一杯口、二杯口、三色同顺、一气通贯', () => {
  const pinfu = score('123m 456m 789m 123p 55s', 'm4');
  assert.deepEqual(names(pinfu), ['平和', '一气通贯']);
  assert.equal(pinfu.han, 3);
  assert.equal(pinfu.fu, 30, '全顺子平和两面：底20 + 门清10');
  assert.equal(pinfu.points, 3900);

  const tanyao = score('234m 567m 345p 678p 22s', 'p8');
  assert.deepEqual(names(tanyao), ['断幺九', '平和']);
  assert.equal(tanyao.points, 2000, '2番30符');

  assert.deepEqual(names(score('123m 123m 456p 789p 55s', 'p5')), ['一杯口'], '嵌张待ち不成立平和');
  assert.deepEqual(names(score('123m 123m 456p 789p 55s', 'p6')), ['平和', '一杯口']);
  assert.deepEqual(names(score('112233m 445566p 77s', 'p4')), ['平和', '二杯口']);
  assert.deepEqual(names(score('123m 456m 123p 123s 77m', 'm4')), ['平和', '三色同顺']);
});

test('通常役：刻子系（三色同刻、三暗刻、役牌、小三元）', () => {
  assert.deepEqual(names(score('111m 111p 111s 234m 55m', 'm5')), ['三色同刻', '三暗刻']);
  const sho = score('555z 666z 111m 234m 77z', 'z7');
  assert.deepEqual(names(sho), ['三暗刻', '红中', '发财', '小三元', '混一色']);
  assert.equal(sho.points, 16000, '9 番是倍满');
  assert.equal(sho.limit, '倍满');
});

test('通常役：全带与一色（混全带、纯全带、混一色、清一色、混老头）', () => {
  assert.deepEqual(names(score('123m 789m 123p 789p 11z', 'm1')), ['平和', '混全带幺九']);
  const junchan = score('123m 789m 123p 789p 11m', 'm1');
  assert.deepEqual(names(junchan), ['平和', '纯全带幺九']);
  assert.equal(junchan.points, 7700, '4番30符');
  assert.deepEqual(names(score('123m 234m 345m 456m 77m', 'm4')), ['平和', '清一色']);
  assert.deepEqual(names(score('123m 456m 789m 111z 22z', 'z1')), ['一气通贯', '混一色']);
  const honroutou = score('11m 99m 11p 99s 11z 22z 55z', 'z5');
  assert.equal(honroutou.form, '七对子');
  assert.deepEqual(names(honroutou), ['七对子', '混老头']);
  assert.equal(honroutou.fu, 25, '七对子固定 25 符');
  assert.equal(honroutou.points, 6400, '4番25符');
});

test('役满：国士无双、四暗刻、大三元、字一色、清老头、绿一色、九莲宝灯、大四喜', () => {
  const cases = [
    ['19m 19p 19s 1234567z 7z', 'z7', '十三幺', '国士无双'],
    ['111m 222m 333m 444m 55m', 'm5', '标准胡', '四暗刻'],
    ['555z 666z 777z 123m 44m', 'm4', '标准胡', '大三元'],
    ['11122233344455z', 'z5', '标准胡', '字一色'],
    ['111m 999m 111p 999p 11s', 's1', '标准胡', '清老头'],
    ['222s 333s 444s 666s 88s', 's8', '标准胡', '绿一色'],
    ['1112345678999m 5m', 'm5', '标准胡', '九莲宝灯'],
    ['11z 22z 33z 44z 55z 66z 77z', 'z7', '七对子', '字一色'],
  ];
  for (const [text, win, form, yaku] of cases) {
    const s = score(text, win);
    assert(s, text + ' 应当和牌');
    assert.equal(s.form, form, text);
    assert(names(s).includes(yaku), text + ' 缺少 ' + yaku + '：' + names(s).join(' '));
    assert.equal(s.han, 13, text);
    assert.equal(s.points, 32000, text);
    assert.equal(s.yakuman, true, text);
  }
  assert.equal(score('11122233344455z', 'z5').limit, '役满（不叠加）', '字一色+大四喜+四暗刻算一个役满');
});

test('符：暗刻、役牌雀头、待ち型与进位', () => {
  /* 单骑 + 幺九暗刻：20 + 10 + 8 + 2 = 40 */
  const tanki = score('111m 999m 111p 999p 11s', 's1');
  assert.equal(tanki.yakuman, true, '这副是清老头役满，换一副非役满的');
  const anko = score('111m 222m 333m 456p 77s', 's7');
  assert.equal(anko.fu, 50, '20 + 10 + (8+4+4) + 单骑2 = 48 进位到 50');
  const yakuPair = score('111m 222p 333s 456m 77z', 'z7');
  assert.equal(yakuPair.fu, 50, '白板雀头 +2 符');
  const kanchan = score('123m 234m 567m 234p 11z', 'p3');
  assert.equal(kanchan.fu, 40, '20 + 10 + 嵌张 2 = 32 进位到 40');
  assert.equal(kanchan.han, 0);
  assert.deepEqual(names(kanchan), ['底和'], '无役也记 0 番底和');
  assert.equal(kanchan.points, 1000, '无役底和 1000 点');
});

test('点数表：满贯及以上按档位，4 番 40 符以上并到满贯', () => {
  assert.deepEqual(E.pointsOf(1, 30), { points: 1000, limit: '' });
  assert.deepEqual(E.pointsOf(2, 30), { points: 2000, limit: '' });
  assert.deepEqual(E.pointsOf(3, 30), { points: 3900, limit: '' });
  assert.deepEqual(E.pointsOf(4, 30), { points: 7700, limit: '' });
  assert.deepEqual(E.pointsOf(4, 40), { points: 8000, limit: '满贯' }, '基本点超过 2000 并到满贯');
  assert.deepEqual(E.pointsOf(5, 30), { points: 8000, limit: '满贯' });
  assert.deepEqual(E.pointsOf(6, 30), { points: 12000, limit: '跳满' });
  assert.deepEqual(E.pointsOf(8, 30), { points: 16000, limit: '倍满' });
  assert.deepEqual(E.pointsOf(11, 30), { points: 24000, limit: '三倍满' });
  assert.deepEqual(E.pointsOf(13, 30), { points: 32000, limit: '役满' });
  assert.equal(E.pointsOf(0, 30).points, 1000, '无役底和');
});

test('高点法：同分取番数高的拆法', () => {
  /* 11223344556677m 既是七对子+清一色（8 番），也是二杯口+平和+清一色（10 番）。 */
  const s = score('11223344556677m', 'm6');
  assert.equal(s.form, '标准胡');
  assert.deepEqual(names(s), ['平和', '二杯口', '清一色']);
  assert.equal(s.han, 10);
});

test('摘要文本与不和判定', () => {
  assert.equal(E.scoreText(score('123m 456m 789m 123p 55s', 'm4')), '3 番 30 符　3900 点');
  assert.equal(E.scoreText(score('111m 222m 333m 444m 55m', 'm5')), '役满　32000 点');
  assert.equal(E.scoreText(score('123m 234m 567m 234p 11z', 'p3')), '0 番 40 符　1000 点');
  assert.equal(E.scoreHand(hand('123m 456m 789m 123p 5s'), E.kindOfTile('s',3)), null, '十三张不成和');
  assert.equal(score('123m 456m 789m 123p 55s', 'm4').form, E.winForm(hand('123m 456m 789m 123p 55s')));
});

console.log('PASS: ' + count + ' engine cases');
