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
  /* —— 弃牌评分 ——
     无役不能和之后，「打掉哪张最不亏」不能只看向听与有效牌：还要看这张牌
     是不是做役的本钱（役牌对子、断幺九的中张、一色苗头上的同花牌）。 */
  function yakuWorth(hand, kind, opts) {
    var ctx = windCtx(opts);
    var c = countKinds(hand), k, worth = 0;
    if (yakuhaiHan(kind, ctx)) worth += c[kind] >= 2 ? 30 : 12;
    var orphans = 0, total = 0, suits = [0, 0, 0];
    for (k = 0; k < KINDS; k++) {
      if (!c[k]) continue;
      if (isOrphanKind(k)) orphans++;
      if (k < 27) { suits[(k / 9) | 0] += c[k]; total += c[k]; }
    }
    if (!isOrphanKind(kind) && orphans <= 2) worth += 6;      // 手牌干净，断幺九有戏
    if (kind < 27) {
      if (total && suits[(kind / 9) | 0] / total >= 0.7) worth += 8;
    } else if (total && Math.max(suits[0], suits[1], suits[2]) / total >= 0.7) {
      worth += 4;                                             // 一色苗头时字牌也有用
    }
    return worth;
  }
  function discardRanking(hand, seen, opts) {
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
      out.push({ kind: kind, name: fullName(kind), shanten: left, ukeire: accept, worth: yakuWorth(hand, kind, opts) });
    }
    /* 向听优先；同向听时打「有效牌 + 役种价值」最低的那张。 */
    out.sort(function (a, b) {
      if (a.shanten !== b.shanten) return a.shanten - b.shanten;
      var av = a.ukeire + a.worth, bv = b.ukeire + b.worth;
      if (av !== bv) return av - bv;
      return b.kind - a.kind;
    });
    return out;
  }
  /* 按手牌下标给出「打掉它有多亏」的排序（越靠前越该打）。 */
  function discardOrder(hand, seen, opts) {
    var rank = discardRanking(hand, seen, opts);
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
  function worstTile(hand, seen, opts) {
    var order = discardOrder(hand, seen, opts);
    var kind = kindOf(hand[order[0]]);
    /* 返回该种类里最靠右的那张，保证多次调用结果稳定。 */
    var pick = -1;
    for (var i = 0; i < hand.length; i++) if (kindOf(hand[i]) === kind) pick = i;
    return { index: pick, kind: kind, name: fullName(kind) };
  }
  /* 场上某张牌对当前手牌的提示等级：2 = 有役能直接和牌，1 = 前进一歩，0 = 无关。
     opts 同 scoreHand（场风 / 自风 / 明刻），省缺表示无风无碰。 */
  function hazard(hand, kind, opts) {
    var probe = hand.slice();
    probe.push(tileOf(kind, 0));
    if (canWin(probe, kind, opts)) return 2;
    return tileGain(hand, kind) >= 1 ? 1 : 0;
  }

  /* ============================================================
   * 番种与符点
   *
   * 规则口径（东风局；没有吃，但可以碰）：
   *  - 场风固定东；自风每局在四家里随机分配。役牌 = 三元牌 / 场风 / 自风，
   *    每个 1 番，场风与自风重合（连风）记 2 番。
   *  - 手里没碰过时恒为门前清，碰出来的刻子记明刻：明刻不参与三暗刻与四暗刻，
   *    碰过之后平和 / 一杯口 / 二杯口 / 七对子不成立，三色同顺、一气通贯、
   *    混全带幺九、纯全带幺九、混一色、清一色的番数降到副露口径。
   *  - 没有自摸与荣和的区分，因此不设门前清自摸和，也不计门清荣和加符，
   *    门前清直接给一个固定的 10 符。
   *  - 无役不能和：scoreHand 仍会返回 0 番的结果供界面解释，由调用方按 han > 0 判定。
   *  - 多个役满同时成立时不叠加，统一按一个役满 32000 点计。
   * ============================================================ */
  var DRAGON_FROM = 31;                         // 中 发 白
  var WIND_FROM = 27, WIND_TO = 30;             // 东 南 西 北
  var GREEN = { 19: 1, 20: 1, 21: 1, 23: 1, 25: 1, 32: 1 };   // 2/3/4/6/8条 与 发
  var LIMITS = [
    { han: 13, name: '役满', base: 8000 },
    { han: 11, name: '三倍满', base: 6000 },
    { han: 8, name: '倍满', base: 4000 },
    { han: 6, name: '跳满', base: 3000 },
    { han: 5, name: '满贯', base: 2000 }
  ];
  function isDragon(kind) { return kind >= DRAGON_FROM; }
  function isWind(kind) { return kind >= WIND_FROM && kind <= WIND_TO; }
  function isOrphanKind(kind) { return isHonor(kind) || isTerminal(kind); }
  function runRank(start) { return start % 9 + 1; }

  /* 场风 / 自风 / 明刻（碰出来的刻子）。roundWind 固定东，seatWind 每局随机分配，
     没有风时传 -1。openKinds 里每出现一个种类，就有一个该种类的刻子按明刻计。 */
  var NO_WIND = -1;
  function windCtx(opts) {
    opts = opts || {};
    var seat = opts.seatWind === undefined ? NO_WIND : opts.seatWind;
    var field = opts.roundWind === undefined ? NO_WIND : opts.roundWind;
    return { seatWind: seat, roundWind: field, openKinds: opts.openKinds || [], open: (opts.openKinds || []).length > 0 };
  }
  /* 某个种类的牌作役牌时的番数：三元牌 1 番；场风与自风各 1 番，两个都是（连风）记 2 番。 */
  function yakuhaiHan(kind, ctx) {
    if (isDragon(kind)) return 1;
    if (!isWind(kind)) return 0;
    var seat = ctx.seatWind === kind, field = ctx.roundWind === kind;
    if (seat && field) return 2;
    return (seat || field) ? 1 : 0;
  }
  /* 役牌雀头的符：三元 +2；场风或自风 +2，连风 +4。 */
  function yakuhaiPairFu(kind, ctx) {
    if (isDragon(kind)) return 2;
    if (!isWind(kind)) return 0;
    return (ctx.seatWind === kind ? 2 : 0) + (ctx.roundWind === kind ? 2 : 0);
  }

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

  /* 单套「四面子 + 一雀头」的役与符。winKind 是和牌张的种类，ctx 是场风/自风/明刻。 */
  function scoreSplit(split, win, winKind, ctx) {
    var melds = split.melds, pair = split.pair, i, m;
    var kinds = [pair, pair], runs = [], triplets = [], tripletFu = [], tripletAnko = [], openLeft = ctx.openKinds.slice();
    for (i = 0; i < 4; i++) {
      m = melds[i];
      if (m.run) {
        runs.push(m.start);
        kinds.push(m.start, m.start + 1, m.start + 2);
      } else {
        triplets.push(m.kind);
        kinds.push(m.kind, m.kind, m.kind);
        /* 碰过的刻子记明刻：每个种类最多只有一个刻子，所以分配是唯一的。 */
        var at = openLeft.indexOf(m.kind);
        var isOpen = at >= 0;
        if (isOpen) openLeft.splice(at, 1);
        var base = isOrphanKind(m.kind) ? 4 : 2;
        tripletFu.push(isOpen ? base : base * 2);
        tripletAnko.push(!isOpen);
      }
    }
    var each = function (fn) {
      for (var j = 0; j < kinds.length; j++) if (!fn(kinds[j])) return false;
      return true;
    };
    var windTriplets = triplets.filter(isWind);
    var dragonTriplets = triplets.filter(isDragon);
    var anko = 0;
    for (i = 0; i < tripletAnko.length; i++) if (tripletAnko[i]) anko++;
    var menzen = !ctx.open;

    /* —— 役满 —— */
    var yakuman = [];
    if (each(isHonor)) yakuman.push('字一色');
    if (each(function (k) { return !isHonor(k) && isTerminal(k); })) yakuman.push('清老头');
    if (each(function (k) { return GREEN[k]; })) yakuman.push('绿一色');
    if (dragonTriplets.length === 3) yakuman.push('大三元');
    if (windTriplets.length === 4) yakuman.push('大四喜');
    else if (windTriplets.length === 3 && isWind(pair)) yakuman.push('小四喜');
    if (anko === 4) yakuman.push('四暗刻');
    if (menzen && isNineGates(kinds)) yakuman.push('九莲宝灯');
    if (yakuman.length) return { yakuman: yakuman };

    /* —— 通常役 —— */
    var yaku = [], han = 0;
    function add(name, h) { yaku.push({ name: name, han: h }); han += h; }

    if (each(function (k) { return !isOrphanKind(k); })) add('断幺九', 1);
    if (menzen && runs.length === 4 && yakuhaiHan(pair, ctx) === 0 && win.name === '两面') add('平和', 1);

    var runAt = {}, doubled = 0;
    runs.forEach(function (st) { runAt[st] = (runAt[st] || 0) + 1; });
    Object.keys(runAt).forEach(function (st) { if (runAt[st] >= 2) doubled++; });
    if (menzen && doubled >= 2) add('二杯口', 3);
    else if (menzen && doubled === 1) add('一杯口', 1);

    for (i = 0; i < runs.length; i++) {
      var st = runs[i];
      if (st < 9 && runAt[st + 9] && runAt[st + 18]) { add('三色同顺', menzen ? 2 : 1); break; }
    }
    for (i = 0; i < 3; i++) {
      if (runAt[i * 9] && runAt[i * 9 + 3] && runAt[i * 9 + 6]) { add('一气通贯', menzen ? 2 : 1); break; }
    }
    var tripletAt = {};
    triplets.forEach(function (k) { tripletAt[k] = 1; });
    for (i = 0; i < 9; i++) {
      if (tripletAt[i] && tripletAt[i + 9] && tripletAt[i + 18]) { add('三色同刻', 2); break; }
    }
    if (anko === 3) add('三暗刻', 2);
    if (triplets.length === 4) add('对对和', 2);
    triplets.forEach(function (k, idx) {
      var h = yakuhaiHan(k, ctx);
      if (h) add(fullName(k), h);
    });
    if (dragonTriplets.length === 2 && isDragon(pair)) add('小三元', 2);

    var hasHonor = !each(function (k) { return !isHonor(k); });
    var meldsAllOrphan = melds.every(function (x) {
      return x.run ? runRank(x.start) === 1 || runRank(x.start) === 7 : isOrphanKind(x.kind);
    }) && isOrphanKind(pair);
    /* 混老头只可能出在七对子（全是幺九牌的四个刻子已经是四暗刻役满，上面就返回了）。 */
    if (meldsAllOrphan && runs.length > 0) {
      if (hasHonor) add('混全带幺九', menzen ? 2 : 1);
      else add('纯全带幺九', menzen ? 3 : 2);
    }
    var suits = {}, honor = 0;
    kinds.forEach(function (k) { if (isHonor(k)) honor = 1; else suits[(k / 9) | 0] = 1; });
    var suitCount = Object.keys(suits).length;
    if (suitCount === 1 && !honor) add('清一色', menzen ? 6 : 5);
    else if (suitCount === 1 && honor) add('混一色', menzen ? 3 : 2);

    /* —— 符：底 20 + 门清 10 + 雀头 + 面子 + 待ち —— */
    var fu = 20 + (menzen ? 10 : 0) + yakuhaiPairFu(pair, ctx) + win.fu;
    for (i = 0; i < tripletFu.length; i++) fu += tripletFu[i];
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

  /* 番 + 符 → 基本点与得点（荣和口径：基本点 × 4，进位到百）。
     0 番（无役）按规则不能和，这里仍给出一个底分供界面解释。 */
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
     opts = { roundWind, seatWind, openKinds }，省缺表示没有风、也没有碰过的刻子。
     返回 null 表示牌型不成和；否则 { form, yaku, han, fu, points, limit, yakuman }。
     无役时 han 为 0——按规则不能和，由调用方按 han > 0 判定。
     十三幺 / 七对子 / 标准型都算一遍，按高点法取分最高的那套
     （例如 11223344556677m 既是七对子也是二杯口+一杯口，要取后者）。 */
  function scoreHand(tiles, winKind, opts) {
    if (tiles.length % 3 !== 2) return null;
    var ctx = windCtx(opts);
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

    /* 七对子与国士无双都是门前限定：碰过就不成立。 */
    if (!ctx.open && kokushiShanten(counts) === -1) {
      keep(result('十三幺', [named13('国士无双')], 13, 0, true));
    }
    var chiitoi = ctx.open ? null : scoreChiitoi(counts);
    if (chiitoi) {
      if (chiitoi.yakuman) keep(result('七对子', chiitoi.yakuman.map(named13), 13, 25, true));
      else keep(result('七对子', chiitoi.yaku, chiitoi.han, chiitoi.fu, false));
    }
    var splits = meldSplits(counts);
    for (var i = 0; i < splits.length; i++) {
      var waits = waitOptions(splits[i], win);
      for (var j = 0; j < waits.length; j++) {
        var got = scoreSplit(splits[i], waits[j], win, ctx);
        if (!got) continue;
        if (got.yakuman) keep(result('标准胡', got.yakuman.map(named13), 13, 0, true));
        else {
          var yaku = got.yaku.length ? got.yaku : [{ name: '无役', han: 0 }];
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

  /* 一行摘要，给界面与播报用：3 番 30 符 3900 点 / 役满 32000 点 / 无役不能和。 */
  function scoreText(score) {
    if (!score) return '';
    if (score.han <= 0) return '无役（不能和牌）';
    var tail = '　' + score.points + ' 点';
    if (score.yakuman) return score.limit + tail;
    return score.han + ' 番 ' + score.fu + ' 符' + tail + (score.limit ? '（' + score.limit + '）' : '');
  }

  /* 能不能和：牌型成和且有役。AI 与和牌判定都用它。 */
  function canWin(tiles, winKind, opts) {
    var s = scoreHand(tiles, winKind, opts);
    return !!s && s.han > 0 ? s : null;
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
    canWin: canWin, yakuhaiHan: yakuhaiHan, isDragon: isDragon, isWind: isWind, yakuWorth: yakuWorth,
    DRAGON_FROM: DRAGON_FROM, WIND_FROM: WIND_FROM, WIND_TO: WIND_TO,
    discardRanking: discardRanking, discardOrder: discardOrder, worstTile: worstTile, hazard: hazard
  };
  root.SquekEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
