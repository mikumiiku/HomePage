'use strict';
const assert = require('node:assert/strict');
const E = require('../web/static/js/games/gomoku-engine.js');
const AI = require('../web/static/js/games/gomoku-ai.js');
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }
const i = (x,y) => y*15+x;
function interleave(black, white) { return black.flatMap((p,n) => n < white.length ? [p,white[n]] : [p]); }
test('empty board and center opening', () => { assert.equal(E.replay([]).turn,1); assert.equal(AI.choose([], 'normal', {budget:30}).move,112); });
for (const [dx,dy] of E.dirs) test(`line ${dx},${dy}`, () => {
  const b=E.empty(), sx=dx === 1 && dy === -1 ? 0 : 2, sy=dy === -1 ? 14 : 0;
  for(let k=0;k<5;k++) b[i(sx+dx*k,sy+dy*k)]=1;
  assert.equal(E.line(b,i(sx,sy)).length,5);
});
test('overline and broken line', () => {
  const b=E.empty(); [0,1,2,3,4,5].forEach(x=>b[x]=2); assert.equal(E.line(b,3).length,6); b[2]=0; assert.equal(E.line(b,3).length,0);
});
test('invalid moves and no wraparound', () => {
  for(const moves of [[-1],[225],[1.5],[1,1]]) assert.throws(()=>E.replay(moves));
  const b=E.empty(); [13,14,15,16,17].forEach(x=>b[x]=1); assert.equal(E.line(b,15).length,0);
});
const won=interleave([0,1,2,3,4],[30,31,32,33]);
test('terminal and undo by replay', () => { assert.equal(E.replay(won).result,1); assert.equal(E.play(won,40),null); assert.throws(()=>E.replay(won.concat(40))); assert.equal(E.replay(won.slice(0,-1)).result,null); });
// Pattern has horizontal runs <= 2, alternating verticals and diagonal runs <= 2.
const drawBoard=Array.from({length:225},(_,p)=>((p%15+2*Math.floor(p/15))%4<2?1:2));
const black=drawBoard.flatMap((c,p)=>c===1?[p]:[]), white=drawBoard.flatMap((c,p)=>c===2?[p]:[]);
test('full board draw', () => {
  assert.equal(black.length,113); assert.equal(white.length,112);
  const moves=interleave(black,white); assert.equal(E.replay(moves).result,0);
});
for (const level of ['easy','normal','hard']) {
  test(`${level} immediate win before blocking`, () => {
    const moves=interleave([0,1,2,3],[30,31,32,33]); assert.equal(AI.choose(moves,level).move,4);
  });
  test(`${level} forced block`, () => {
    const moves=interleave([0,1,2,3],[30,32,45]); assert.equal(AI.choose(moves,level).move,4);
  });
  test(`${level} legal and bounded`, () => {
    const moves=[112,113,97,127,98,128]; const before=JSON.stringify(moves), now=performance.now();
    const r=AI.choose(moves,level,{budget:50,random:()=>0});
    assert(E.play(moves,r.move)); assert(performance.now()-now<350); assert.equal(JSON.stringify(moves),before);
  });
}
test('block broken four', () => { const moves=interleave([30,31,33,34],[0,2,4]); assert.equal(AI.choose(moves,'hard').move,32); });
test('double threat chooses a legal block', () => { const moves=interleave([31,32,33,34],[0,2,4]); assert([30,35].includes(AI.choose(moves,'normal').move)); });
test('fixed seed is reproducible', () => { const moves=[112,113,97]; assert.equal(AI.choose(moves,'easy',{budget:1000,random:()=>.4}).move,AI.choose(moves,'easy',{budget:1000,random:()=>.4}).move); });
test('open four is preferred as a forced win', () => {
  const moves=interleave([111,112,113],[0,2,4]);
  assert([110,114].includes(AI.choose(moves,'hard',{budget:500}).move));
});
(async()=>{
  const moves=interleave([0,1,2,3],[30,32,45]);
  const move=await new Promise(resolve=>AI.fallback(moves,resolve));
  assert.equal(move,4);
  let called=false;
  const cancel=AI.fallback(moves,()=>{called=true});cancel();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(called,false);
  console.log('PASS fallback tactical priority and cancellation');
  console.log(`${count + 1} total engine/search tests passed`);
})().catch(error=>{console.error(error);process.exitCode=1});
