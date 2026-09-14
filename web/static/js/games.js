/* 首页：卡片显示本地最佳成绩 + 「最近在玩」条 */
(function (M) {
  'use strict';

  /* 1) 每张卡片上的「本地最佳」。选择器只锚定 data-game-id，与列表结构解耦 */
  document.querySelectorAll('[data-game-id]').forEach(function (card) {
    var id = card.dataset.gameId;
    var line = card.querySelector('[data-best]');
    if (!id || !line) return;
    var text = '';
    try { text = M.store.bestText(id, 'main') || ''; } catch (e) { /* 未登记的游戏不显示 */ }
    line.textContent = text ? '本地最佳 ' + text : '本地最佳 —';
  });

  /* 2) 最近在玩 */
  var strip = document.getElementById('recent-strip');
  var list = document.getElementById('recent-list');
  if (!strip || !list) return;

  var games = {};
  (window.GAMES_META || []).forEach(function (g) { games[g.id] = g; });

  var recent = (M.store.getActivity().recent || []).filter(function (x) {
    return x && x.g && games[x.g];
  });
  if (!recent.length) { strip.hidden = true; return; }

  recent.slice(0, 5).forEach(function (x) {
    var g = games[x.g];
    var a = document.createElement('a');
    a.className = 'recent-item';
    a.href = '/game/' + g.id;
    var name = document.createElement('span');
    name.textContent = g.title;
    var when = document.createElement('span');
    when.className = 'when';
    when.textContent = M.fmt.ago(x.t);
    a.appendChild(name); a.appendChild(when);
    list.appendChild(a);
  });
  strip.hidden = false;
})(window.App);
