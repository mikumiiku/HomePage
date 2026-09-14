'use strict';
var version = new URL(self.location.href).search;
importScripts('go-engine.js' + version, 'go-ai.js' + version);
self.onmessage = function (event) {
  var request = event.data;
  try {
    var result = self.GoAI.choose(request);
    self.postMessage({ game: request.game, request: request.request, move: result.move });
  } catch (error) {
    self.postMessage({ game: request.game, request: request.request, error: '搜索失败' });
  }
};
