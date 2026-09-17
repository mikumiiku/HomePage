/* GNU Go Worker integration, GPL-3.0-or-later; vendor/gnugo/COPYING. */
'use strict';
var version = new URL(self.location.href).search;
var vendor = new URL('../../vendor/gnugo/', self.location.href);
importScripts('go-engine.js' + version, 'go-ai.js' + version, new URL('gnugo.js' + version, vendor).href);
var enginePromise;
self.onmessage = async function (event) {
  var request = event.data;
  function send(data) { self.postMessage(Object.assign({ game: request.game, request: request.request }, data)); }
  try {
    if (!enginePromise) enginePromise = createGnuGo({
      locateFile: function (name) { return new URL(name + version, vendor).href; },
      print: function () {}, printErr: function () {}
    });
    var engine = await enginePromise;
    send({ status: 'ready' });
    send(self.GoAI.choose(engine, request));
  } catch (error) {
    send({ error: '围棋引擎暂不可用，请重试。' });
  }
};
