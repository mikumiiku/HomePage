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
    discardRanking: discardRanking, discardOrder: discardOrder, worstTile: worstTile, hazard: hazard
  };
  root.SquekEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
