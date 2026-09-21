/* 雀蛇 · 麻将牌引擎：牌定义、洗牌、理牌、向听数、胡牌判定、牌价值。
 * 纯函数、无 DOM、无随机源之外的副作用；浏览器与 Node 单测共用。
 *
 * 牌用整数 id 表示：id = 种类 * 4 + 副本，0..135。
 * 种类 kind 0..33 = 一万..九万、一筒..九筒、一条..九条、东..白。 */
(function (root) {
  'use strict';

  var KINDS = 34, COPIES = 4, TOTAL = 136;
  var SUITS = ['m', 'p', 's', 'z'];
  /* 界面用简体，牌面沿用传统叫法（红中/发财/白板）。 */
  var HONOR_SHORT = ['东', '南', '西', '北', '中', '发', '白'];
  var HONOR_FULL = ['东风', '南风', '西风', '北风', '红中', '发财', '白板'];
  var NUM_FULL = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  /* 十三幺需要的 13 种牌：三种花色的 1、9 加七种字牌。 */
  var ORPHAN_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

  function kindOf(id) { return id >> 2; }
  function copyOf(id) { return id & 3; }
  function tileOf(kind, copy) { return kind * 4 + (copy || 0); }
  function kindOfTile(suit, rank) {
    var s = SUITS.indexOf(suit);
    if (s < 0) throw new Error('未知花色: ' + suit);
    if (s < 3) { if (rank < 1 || rank > 9) throw new Error('数字越界: ' + rank); return s * 9 + rank - 1; }
    if (rank < 1 || rank > 7) throw new Error('字牌越界: ' + rank);
    return 27 + rank - 1;
  }
  function suitOf(kind) { return SUITS[kind < 27 ? (kind / 9) | 0 : 3]; }
  function rankOf(kind) { return kind < 27 ? kind % 9 + 1 : kind - 26; }
  function isHonor(kind) { return kind >= 27; }
  function isTerminal(kind) { return kind < 27 && (kind % 9 === 0 || kind % 9 === 8); }
  function isOrphan(kind) { return isHonor(kind) || isTerminal(kind); }
  /* 牌面短标签（画布用）：数字牌「3万」，字牌「东」。 */
  function label(kind) {
    if (isHonor(kind)) return HONOR_SHORT[kind - 27];
    return rankOf(kind) + (suitOf(kind) === 'm' ? '万' : suitOf(kind) === 'p' ? '筒' : '条');
  }
  /* 读屏与说明用全名：三万、东风、红中。 */
  function fullName(kind) {
    if (isHonor(kind)) return HONOR_FULL[kind - 27];
    return NUM_FULL[rankOf(kind) - 1] + (suitOf(kind) === 'm' ? '万' : suitOf(kind) === 'p' ? '筒' : '条');
  }
  function labelOfId(id) { return label(kindOf(id)); }
  function fullNameOfId(id) { return fullName(kindOf(id)); }

  /* —— 牌池 —— */
  function makeWall(random) {
    var rnd = random || Math.random;
    var wall = new Array(TOTAL);
    for (var i = 0; i < TOTAL; i++) wall[i] = i;
    for (var j = TOTAL - 1; j > 0; j--) {
      var k = Math.floor(rnd() * (j + 1));
      var t = wall[j]; wall[j] = wall[k]; wall[k] = t;
    }
    return wall;
  }
  function countKinds(tiles) {
    var c = new Int8Array(KINDS);
    for (var i = 0; i < tiles.length; i++) c[kindOf(tiles[i])]++;
    return c;
  }
  /* 理牌：万 → 筒 → 条 → 字，同花色数字升序，字牌东南西北中发白。 */
  function sortHand(tiles) {
    return tiles.slice().sort(function (a, b) {
      var ka = kindOf(a), kb = kindOf(b);
      return ka === kb ? copyOf(a) - copyOf(b) : ka - kb;
    });
  }
  function removeFirst(tiles, id) {
    var at = tiles.indexOf(id);
    if (at < 0) return false;
    tiles.splice(at, 1);
    return true;
  }
  function countsKey(c) {
    var out = '';
    for (var i = 0; i < KINDS; i++) out += c[i];
    return out;
  }

  /* —— 向听数（返回 -1 表示已和牌，0 表示听牌） ——
     标准型：shanten = 2 × (4 − 面子) − 搭子 − 雀头。 */
  var memo = new Map(), MEMO_MAX = 60000;
  function walk(countsArr, i, melds, partials, eye, acc) {
    if (melds + partials >= 4) {
      var v = 2 * (4 - melds) - partials - eye;
      if (v < acc.best) acc.best = v;
      return;
    }
    if (i >= KINDS) {
      var w = 2 * (4 - melds) - partials - eye;
      if (w < acc.best) acc.best = w;
      return;
    }
    var c = countsArr[i];
    if (c === 0) { walk(countsArr, i + 1, melds, partials, eye, acc); return; }
    if (c >= 3) {
      countsArr[i] -= 3; walk(countsArr, i, melds + 1, partials, eye, acc); countsArr[i] += 3;
    }
    if (i < 27 && i % 9 <= 6 && countsArr[i + 1] > 0 && countsArr[i + 2] > 0) {
      countsArr[i]--; countsArr[i + 1]--; countsArr[i + 2]--;
      walk(countsArr, i, melds + 1, partials, eye, acc);
      countsArr[i]++; countsArr[i + 1]++; countsArr[i + 2]++;
    }
    if (c >= 2) {
      countsArr[i] -= 2; walk(countsArr, i, melds, partials + 1, eye, acc); countsArr[i] += 2;
    }
    if (i < 27) {
      if (i % 9 <= 7 && countsArr[i + 1] > 0) {
        countsArr[i]--; countsArr[i + 1]--; walk(countsArr, i, melds, partials + 1, eye, acc); countsArr[i]++; countsArr[i + 1]++;
      }
      if (i % 9 <= 6 && countsArr[i + 2] > 0) {
        countsArr[i]--; countsArr[i + 2]--; walk(countsArr, i, melds, partials + 1, eye, acc); countsArr[i]++; countsArr[i + 2]++;
      }
    }
    walk(countsArr, i + 1, melds, partials, eye, acc);
  }
  function standardShanten(countsArr) {
    var acc = { best: 8 };
    walk(countsArr, 0, 0, 0, 0, acc);
    for (var k = 0; k < KINDS; k++) {
      if (countsArr[k] < 2) continue;
      countsArr[k] -= 2;
      walk(countsArr, 0, 0, 0, 1, acc);
      countsArr[k] += 2;
      if (acc.best < 0) break;
    }
    return acc.best;
  }
  function chiitoiShanten(countsArr) {
    var pairs = 0, unique = 0;
    for (var k = 0; k < KINDS; k++) {
      if (countsArr[k] > 0) unique++;
      if (countsArr[k] >= 2) pairs++;
    }
    return 6 - pairs + Math.max(0, 7 - unique);
  }
  function kokushiShanten(countsArr) {
    var unique = 0, pair = 0;
    for (var i = 0; i < ORPHAN_KINDS.length; i++) {
      var k = ORPHAN_KINDS[i];
      if (countsArr[k] > 0) unique++;
      if (countsArr[k] >= 2) pair = 1;
    }
    return 13 - unique - pair;
  }
  /* 手牌向听数：三种牌型取最小。 */
  function shanten(tiles) {
    var c = countKinds(tiles);
    return shantenOfCounts(c);
  }
  function shantenOfCounts(c) {
    var key = countsKey(c);
    var hit = memo.get(key);
    if (hit !== undefined) return hit;
    var v = standardShanten(c);
    var chi = chiitoiShanten(c), kok = kokushiShanten(c);
    if (chi < v) v = chi;
    if (kok < v) v = kok;
    if (memo.size >= MEMO_MAX) memo.clear();
    memo.set(key, v);
    return v;
  }
  /* 和牌判定：14 张（或 3n+2 张）且满足三种牌型之一。 */
  function winForm(tiles) {
    if (tiles.length % 3 !== 2) return null;
    var c = countKinds(tiles);
    var std = standardShanten(c);
    if (std === -1) return '标准胡';
    if (chiitoiShanten(c) === -1) return '七对子';
    if (kokushiShanten(c) === -1) return '十三幺';
    return null;
  }
  function shantenText(n) {
    if (n < 0) return '已和牌';
    if (n === 0) return '听牌';
    return ['一', '二', '三', '四', '五', '六', '七', '八'][n - 1] + '向听';
  }

  /* —— 评估 ——
     吃进一张牌的价值：手牌向听数 − 吃牌后（14 张）向听数。
     等于 1 表示这次吃牌让牌型前进了一步。 */
  function tileGain(hand, kind) {
    var before = shanten(hand);
    var probe = hand.slice();
    probe.push(tileOf(kind, 0));
    return before - shanten(probe);
  }
  /* 有效牌：还能摸到哪些牌能降低向听，按剩余张数计。 */
  function ukeire(c, seen) {
    var base = shantenOfCounts(c), total = 0;
    for (var k = 0; k < KINDS; k++) {
      var left = COPIES - (seen ? seen[k] : 0);
      if (left <= 0 || c[k] >= COPIES) continue;
      c[k]++;
      if (shantenOfCounts(c) < base) total += left;
      c[k]--;
    }
    return total;
  }
  /* 手里 14 张时，逐张评估打出去之后的向听与有效牌。index 为手牌下标。 */
  function discardRanking(hand, seen) {
    var c = countKinds(hand);
    var out = [], done = {};
    for (var i = 0; i < hand.length; i++) {
      var kind = kindOf(hand[i]);
      if (done[kind]) continue;
      done[kind] = 1;
      c[kind]--;
      var left = shantenOfCounts(c);
      var accept = ukeire(c, seen);
      c[kind]++;
      out.push({ kind: kind, name: fullName(kind), shanten: left, ukeire: accept });
    }
    /* 向听优先，其次有效牌；同分时优先打掉字牌与孤张（种类序号大者靠后）。 */
    out.sort(function (a, b) {
      if (a.shanten !== b.shanten) return a.shanten - b.shanten;
      if (a.ukeire !== b.ukeire) return b.ukeire - a.ukeire;
      return b.kind - a.kind;
    });
    return out;
  }
  /* 按手牌下标给出「打掉它有多亏」的排序（越靠前越该打）。 */
  function discardOrder(hand, seen) {
    var rank = discardRanking(hand, seen);
    var order = [], used = {};
    rank.forEach(function (row) {
      for (var i = 0; i < hand.length; i++) {
        if (kindOf(hand[i]) !== row.kind) continue;
        order.push(i);
        used[i] = 1;
        break;
      }
    });
    for (var i = 0; i < hand.length; i++) if (!used[i]) order.push(i);
    return order;
  }
  /* 只看「打出哪张最不亏」的牌面（AI 与自动弃牌用）。 */
  function worstTile(hand, seen) {
    var order = discardOrder(hand, seen);
    var kind = kindOf(hand[order[0]]);
    /* 返回该种类里最靠右的那张，保证多次调用结果稳定。 */
    var pick = -1;
    for (var i = 0; i < hand.length; i++) if (kindOf(hand[i]) === kind) pick = i;
    return { index: pick, kind: kind, name: fullName(kind) };
  }
  /* 场上某张牌对当前手牌的提示等级：2 = 直接和牌，1 = 前进一歩，0 = 无关。 */
  function hazard(hand, kind) {
    var probe = hand.slice();
    probe.push(tileOf(kind, 0));
    if (winForm(probe)) return 2;
    return tileGain(hand, kind) >= 1 ? 1 : 0;
  }

  /* ============================================================
   * 番种与符点
   *
   * 规则口径（本游戏没有吃碰杠，手牌恒为门前清）：
   *  - 役牌只有三元牌（中 31 / 发 32 / 白 33）：没有场风与自风，东南西北不做役牌。
   *  - 刻子一律按暗刻计符（牌是自己在场上捡的）；四个刻子按日麻记四暗刻役满。
   *  - 没有自摸与荣和的区分，因此不设门前清自摸和，也不计门清荣和加符，
   *    直接给一个固定的门清 10 符——否则每次和牌都至少一番，无役就失去意义。
   *  - 无役也能和，记 0 番、底和 1000 点（日麻里无役不能和，这条是本游戏的自定）。
   *  - 多个役满同时成立时不叠加，统一按一个役满 32000 点计。
   * ============================================================ */
  var YAKUHAI_FROM = 31;                        // 中发白
  var GREEN = { 19: 1, 20: 1, 21: 1, 23: 1, 25: 1, 32: 1 };   // 2/3/4/6/8条 与 发
  var LIMITS = [
    { han: 13, name: '役满', base: 8000 },
    { han: 11, name: '三倍满', base: 6000 },
    { han: 8, name: '倍满', base: 4000 },
    { han: 6, name: '跳满', base: 3000 },
    { han: 5, name: '满贯', base: 2000 }
  ];
  function isYakuhaiKind(kind) { return kind >= YAKUHAI_FROM; }
  function isOrphanKind(kind) { return isHonor(kind) || isTerminal(kind); }
  function runRank(start) { return start % 9 + 1; }

  /* —— 拆成「四面子 + 一雀头」的全部拆法 ——
     面子写成 {run:true, start}（顺子）或 {run:false, kind}（刻子）。 */
  function meldSplits(counts) {
    var out = [];
    for (var pair = 0; pair < KINDS; pair++) {
      if (counts[pair] < 2) continue;
      counts[pair] -= 2;
      walkMelds(counts, 0, [], out, pair);
      counts[pair] += 2;
    }
    return out;
  }
  function walkMelds(counts, from, melds, out, pair) {
    var i = from;
    while (i < KINDS && counts[i] === 0) i++;
    if (i >= KINDS) {
      if (melds.length === 4) out.push({ pair: pair, melds: melds.slice() });
      return;
    }
    if (melds.length === 4) return;              // 还有牌没放完，这套拆法不成立
    if (counts[i] >= 3) {
      counts[i] -= 3;
      melds.push({ run: false, kind: i });
      walkMelds(counts, i, melds, out, pair);
      melds.pop();
      counts[i] += 3;
    }
    if (i < 27 && i % 9 <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
      counts[i]--; counts[i + 1]--; counts[i + 2]--;
      melds.push({ run: true, start: i });
      walkMelds(counts, i, melds, out, pair);
      melds.pop();
      counts[i]++; counts[i + 1]++; counts[i + 2]++;
    }
  }

  /* 和牌张在这套拆法里落哪儿：单骑 / 嵌张 / 边张 / 两面 / 双碰，以及对应的待ち符。 */
  function waitOptions(split, winKind) {
    var out = [];
    if (split.pair === winKind) out.push({ name: '单骑', fu: 2 });
    for (var i = 0; i < split.melds.length; i++) {
      var m = split.melds[i];
      if (!m.run) {
        if (m.kind === winKind) out.push({ name: '双碰', fu: 0 });
        continue;
      }
      var rank = runRank(m.start);
      if (winKind === m.start) out.push(rank === 7 ? { name: '边张', fu: 2 } : { name: '两面', fu: 0 });
      else if (winKind === m.start + 1) out.push({ name: '嵌张', fu: 2 });
      else if (winKind === m.start + 2) out.push(rank === 1 ? { name: '边张', fu: 2 } : { name: '两面', fu: 0 });
    }
    return out;
  }

  /* 九莲宝灯：同一花色，形如 1112345678999 再加任意一张同花。 */
  function isNineGates(kinds) {
    var suit = -1, c = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < kinds.length; i++) {
      var k = kinds[i];
      if (k >= 27) return false;
      var s = (k / 9) | 0;
      if (suit < 0) suit = s;
      else if (s !== suit) return false;
      c[k % 9]++;
    }
    var need = [3, 1, 1, 1, 1, 1, 1, 1, 3], extra = 0;
    for (var r = 0; r < 9; r++) {
      if (c[r] < need[r]) return false;
      extra += c[r] - need[r];
    }
    return extra === 1;
  }

  /* 单套「四面子 + 一雀头」的役与符。winKind 是和牌张的种类。 */
  function scoreSplit(split, win, winKind) {
    var melds = split.melds, pair = split.pair, i, m;
    var kinds = [pair, pair], runs = [], triplets = [];
    for (i = 0; i < 4; i++) {
      m = melds[i];
      if (m.run) { runs.push(m.start); kinds.push(m.start, m.start + 1, m.start + 2); }
      else { triplets.push(m.kind); kinds.push(m.kind, m.kind, m.kind); }
    }
    var each = function (fn) {
      for (var j = 0; j < kinds.length; j++) if (!fn(kinds[j])) return false;
      return true;
    };
    var windTriplets = triplets.filter(function (k) { return k >= 27 && k <= 30; });
    var dragonTriplets = triplets.filter(isYakuhaiKind);

    /* —— 役满 —— */
    var yakuman = [];
    if (each(isHonor)) yakuman.push('字一色');
    if (each(function (k) { return !isHonor(k) && isTerminal(k); })) yakuman.push('清老头');
    if (each(function (k) { return GREEN[k]; })) yakuman.push('绿一色');
    if (dragonTriplets.length === 3) yakuman.push('大三元');
    if (windTriplets.length === 4) yakuman.push('大四喜');
    else if (windTriplets.length === 3 && pair >= 27 && pair <= 30) yakuman.push('小四喜');
    if (triplets.length === 4) yakuman.push('四暗刻');
    if (isNineGates(kinds)) yakuman.push('九莲宝灯');
    if (yakuman.length) return { yakuman: yakuman };

    /* —— 通常役 —— */
    var yaku = [], han = 0;
    function add(name, h) { yaku.push({ name: name, han: h }); han += h; }

    if (each(function (k) { return !isOrphanKind(k); })) add('断幺九', 1);
    if (runs.length === 4 && !isYakuhaiKind(pair) && win.name === '两面') add('平和', 1);

    var runAt = {}, doubled = 0;
    runs.forEach(function (st) { runAt[st] = (runAt[st] || 0) + 1; });
    Object.keys(runAt).forEach(function (st) { if (runAt[st] >= 2) doubled++; });
    if (doubled >= 2) add('二杯口', 3);
    else if (doubled === 1) add('一杯口', 1);

    for (i = 0; i < runs.length; i++) {
      var st = runs[i];
      if (st < 9 && runAt[st + 9] && runAt[st + 18]) { add('三色同顺', 2); break; }
    }
    for (i = 0; i < 3; i++) {
      if (runAt[i * 9] && runAt[i * 9 + 3] && runAt[i * 9 + 6]) { add('一气通贯', 2); break; }
    }
    var tripletAt = {};
    triplets.forEach(function (k) { tripletAt[k] = 1; });
    for (i = 0; i < 9; i++) {
      if (tripletAt[i] && tripletAt[i + 9] && tripletAt[i + 18]) { add('三色同刻', 2); break; }
    }
    if (triplets.length === 3) add('三暗刻', 2);
    dragonTriplets.forEach(function (k) { add(fullName(k), 1); });
    if (dragonTriplets.length === 2 && isYakuhaiKind(pair)) add('小三元', 2);

    var hasHonor = !each(function (k) { return !isHonor(k); });
    var meldsAllOrphan = melds.every(function (x) {
      return x.run ? runRank(x.start) === 1 || runRank(x.start) === 7 : isOrphanKind(x.kind);
    }) && isOrphanKind(pair);
    /* 混老头只可能出在七对子（全是幺九牌的四个刻子已经是四暗刻役满，上面就返回了）。 */
    if (meldsAllOrphan && runs.length > 0) {
      add(hasHonor ? '混全带幺九' : '纯全带幺九', hasHonor ? 2 : 3);
    }
    var suits = {}, honor = 0;
    kinds.forEach(function (k) { if (isHonor(k)) honor = 1; else suits[(k / 9) | 0] = 1; });
    var suitCount = Object.keys(suits).length;
    if (suitCount === 1 && !honor) add('清一色', 6);
    else if (suitCount === 1 && honor) add('混一色', 3);

    /* —— 符：底 20 + 门清 10 + 雀头 + 面子 + 待ち —— */
    var fu = 20 + 10 + (isYakuhaiKind(pair) ? 2 : 0) + win.fu;
    triplets.forEach(function (k) { fu += isOrphanKind(k) ? 8 : 4; });
    fu = Math.ceil(fu / 10) * 10;
    return { yaku: yaku, han: han, fu: fu };
  }

  /* 七对子：25 符固定，没有刻子顺子。 */
  function scoreChiitoi(counts) {
    var kinds = [];
    for (var k = 0; k < KINDS; k++) {
      if (counts[k] === 2) kinds.push(k);
      else if (counts[k] !== 0) return null;
    }
    if (kinds.length !== 7) return null;
    var honor = 0, suits = {}, i;
    for (i = 0; i < kinds.length; i++) {
      if (isHonor(kinds[i])) honor = 1;
      else suits[(kinds[i] / 9) | 0] = 1;
    }
    if (kinds.every(isHonor)) return { yakuman: ['字一色'] };
    var yaku = [{ name: '七对子', han: 2 }], han = 2;
    if (kinds.every(function (x) { return !isOrphanKind(x); })) { yaku.push({ name: '断幺九', han: 1 }); han += 1; }
    if (kinds.every(isOrphanKind)) { yaku.push({ name: '混老头', han: 2 }); han += 2; }
    var suitCount = Object.keys(suits).length;
    if (suitCount === 1 && !honor) { yaku.push({ name: '清一色', han: 6 }); han += 6; }
    else if (suitCount === 1 && honor) { yaku.push({ name: '混一色', han: 3 }); han += 3; }
    return { yaku: yaku, han: han, fu: 25 };
  }

  /* 番 + 符 → 基本点与得点（荣和口径：基本点 × 4，进位到百）。 */
  function pointsOf(han, fu) {
    if (han <= 0) return { points: 1000, limit: '' };
    for (var i = 0; i < LIMITS.length; i++) {
      if (han >= LIMITS[i].han) {
        return { points: LIMITS[i].base * 4, limit: LIMITS[i].name };
      }
    }
    var base = fu * Math.pow(2, 2 + han), limit = '';
    if (base > 2000) { base = 2000; limit = '满贯'; }   // 4 番 40 符以上并到满贯
    return { points: Math.ceil(base * 4 / 100) * 100, limit: limit };
  }

  /* 和牌评分。tiles 为 14 张手牌，winKind 是和牌张的种类（省缺时取最后一张）。
     返回 null 表示没和；否则 { form, yaku, han, fu, points, limit, yakuman }。
     十三幺 / 七对子 / 标准型都算一遍，按高点法取分最高的那套
     （例如 11223344556677m 既是七对子也是二杯口+一杯口，要取后者）。 */
  function scoreHand(tiles, winKind) {
    if (tiles.length % 3 !== 2) return null;
    var counts = countKinds(tiles);
    var win = winKind === undefined ? kindOf(tiles[tiles.length - 1]) : winKind;
    var best = null;
    /* 高点法：先比点数，同分比番数（同番再比符）。 */
    function keep(cand) {
      if (!cand) return;
      if (!best || cand.points > best.points ||
          (cand.points === best.points && (cand.han > best.han ||
            (cand.han === best.han && cand.fu > best.fu)))) best = cand;
    }

    if (kokushiShanten(counts) === -1) {
      keep(result('十三幺', [named13('国士无双')], 13, 0, true));
    }
    var chiitoi = scoreChiitoi(counts);
    if (chiitoi) {
      if (chiitoi.yakuman) keep(result('七对子', chiitoi.yakuman.map(named13), 13, 25, true));
      else keep(result('七对子', chiitoi.yaku, chiitoi.han, chiitoi.fu, false));
    }
    var splits = meldSplits(counts);
    for (var i = 0; i < splits.length; i++) {
      var waits = waitOptions(splits[i], win);
      for (var j = 0; j < waits.length; j++) {
        var got = scoreSplit(splits[i], waits[j], win);
        if (!got) continue;
        if (got.yakuman) keep(result('标准胡', got.yakuman.map(named13), 13, 0, true));
        else {
          var yaku = got.yaku.length ? got.yaku : [{ name: '底和', han: 0 }];
          keep(result('标准胡', yaku, got.han, got.fu, false));
        }
      }
    }
    return best;

    function named13(name) { return { name: name, han: 13 }; }
    function result(form, yaku, han, fu, yakuman) {
      var p = pointsOf(han, fu);
      var limit = p.limit;
      if (yakuman) limit = yaku.length > 1 ? '役满（不叠加）' : '役满';
      else if (han >= 13) limit = '累计役满';
      return { form: form, yaku: yaku, han: han, fu: fu, points: p.points, limit: limit, yakuman: !!yakuman };
    }
  }

  /* 一行摘要，给界面与播报用：3 番 30 符 3900 点 / 役满 32000 点。 */
  function scoreText(score) {
    if (!score) return '';
    var tail = '　' + score.points + ' 点';
    if (score.yakuman) return score.limit + tail;
    if (score.han <= 0) return '0 番 ' + score.fu + ' 符' + tail;
    return score.han + ' 番 ' + score.fu + ' 符' + tail + (score.limit ? '（' + score.limit + '）' : '');
  }

  var api = {
    KINDS: KINDS, COPIES: COPIES, TOTAL: TOTAL, SUITS: SUITS, ORPHAN_KINDS: ORPHAN_KINDS,
    kindOf: kindOf, copyOf: copyOf, tileOf: tileOf, kindOfTile: kindOfTile,
    suitOf: suitOf, rankOf: rankOf, isHonor: isHonor, isTerminal: isTerminal, isOrphan: isOrphan,
    label: label, fullName: fullName, labelOfId: labelOfId, fullNameOfId: fullNameOfId,
    makeWall: makeWall, countKinds: countKinds, sortHand: sortHand,
    removeFirst: removeFirst, countsKey: countsKey,
    shanten: shanten, shantenOfCounts: shantenOfCounts, shantenText: shantenText,
    standardShanten: standardShanten, chiitoiShanten: chiitoiShanten, kokushiShanten: kokushiShanten,
    winForm: winForm, tileGain: tileGain, ukeire: ukeire,
    scoreHand: scoreHand, scoreText: scoreText, pointsOf: pointsOf, meldSplits: meldSplits,
    discardRanking: discardRanking, discardOrder: discardOrder, worstTile: worstTile, hazard: hazard
  };
  root.SquekEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
