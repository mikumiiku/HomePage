'use strict';
var version = new URL(self.location.href).search;
importScripts('gomoku-engine.js' + version, 'gomoku-ai.js' + version);
self.onmessage = function (event) {
  var request = event.data;
  try {
    var result = self.GomokuAI.choose(request.moves, request.level);
    self.postMessage({ game: request.game, request: request.request, move: result.move });
  } catch (e) {
    self.postMessage({ game: request.game, request: request.request, error: '搜索失败' });
  }
};
