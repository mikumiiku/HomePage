const assert = require('node:assert/strict');
const {Chess} = require('../web/static/vendor/chess/chess.js');
const E = require('../web/static/js/games/chess-engine.js');
function perft(g,n){if(!n)return 1;let total=0;for(const m of g.moves()){g.move(m);total+=perft(g,n-1);g.undo();}return total;}
assert.equal(perft(new Chess(),3),8902,'standard starting position perft');
let g = E.replay(['e4','e5','Nf3','Nc6','Bc4','Nf6','O-O']);
assert.equal(g.get('g1').type,'k');assert.equal(g.get('f1').type,'r');
g=E.replay(['e4','a6','e5','d5','exd6']);assert.equal(g.get('d5'),null);assert.equal(g.get('d6').type,'p');
g=new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');assert.equal(g.moves({verbose:true}).filter(m=>m.from==='a7').length,4);g.move({from:'a7',to:'a8',promotion:'n'});assert.equal(g.get('a8').type,'n');
assert.deepEqual(E.result(E.replay(['f3','e5','g4','Qh4#'])),{winner:'b',reason:'将死'});
assert.equal(E.result(new Chess('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1')).reason,'逼和');
assert.equal(E.result(new Chess('7k/8/8/8/8/8/8/K7 w - - 0 1')).reason,'子力不足');
assert.equal(E.result(E.replay(['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8'])).reason,'三次重复局面');
assert.equal(E.result(new Chess('7k/8/8/8/8/8/8/KR6 w - - 100 51')).reason,'五十回合规则');
g=new Chess('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1');assert(!g.moves({square:'e2'}).some(m=>m.startsWith('Rd')),'pinned rook cannot expose king');
g=new Chess('4k3/8/8/8/8/5r2/8/4K2R w K - 0 1');assert(!g.moves().includes('O-O'),'cannot castle through check');
assert.throws(()=>E.replay(['e5']));assert.throws(()=>E.replay(['f3','e5','g4','Qh4#','a3']));
console.log('chess rules: perft 8902, castling, en passant, four promotions, checkmate, draws, pins, invalid replay passed');
