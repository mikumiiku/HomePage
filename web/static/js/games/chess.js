(function (M, E) {
  'use strict';
  var stage=M.stage('chess'), save=M.savegame('chess'), source=new URL(document.currentScript.src), ver=source.search;
  var key=M.store.PREFIX+'chess:main', data, game, selected=null, flipped=false, review=null, busy=false, worker=null, timer=null, serial=0, readonly=false, conflict=false, before=null;
  var names={k:'王',q:'后',r:'车',b:'象',n:'马',p:'兵'}, colors={w:'白方',b:'黑方'}, levels={easy:'轻松',normal:'标准',hard:'深入'};
  stage.closest('.game-shell').classList.add('chess-shell'); stage.classList.add('chess-stage'); document.getElementById('hud').hidden=true;
  function icon(name) { return '<span class="ti" aria-hidden="true" style="--icon:url(/static/vendor/bootstrap-icons/'+name+'.svg'+ver+')"></span>'; }
  stage.innerHTML=`
    <div class="chess-notice" id="chess-notice" role="status" hidden><span id="chess-notice-text"></span><button class="btn" id="chess-reload" hidden>加载最新进度</button><button class="btn" id="chess-backup" hidden>导出原存档</button></div>
    <div class="chess-layout"><section class="chess-play" aria-label="国际象棋对局">
      <div class="chess-player" id="chess-top-player"></div>
      <div class="chess-frame"><div id="chess-ranks" class="chess-ranks" aria-hidden="true"></div><div id="chess-board" class="chess-board" role="group" aria-label="国际象棋棋盘" aria-describedby="chess-help"></div><div id="chess-files" class="chess-files" aria-hidden="true"></div></div>
      <div class="chess-player" id="chess-bottom-player"></div>
      <p class="chess-help" id="chess-help">点击棋子查看可走位置，再点击目标格。</p>
    </section><aside class="chess-sidebar" aria-label="对局设置和棋谱">
      <section class="chess-current"><div class="chess-status-heading"><span class="chess-live-dot" aria-hidden="true"></span><span id="chess-kind"></span><span id="chess-count"></span></div><h2 id="chess-status" role="status" aria-live="polite"></h2><p id="chess-detail"></p>
      <div class="chess-actions"><button class="btn" id="chess-undo">${icon('arrow-counterclockwise')}悔棋</button><button class="btn" id="chess-flip">${icon('arrow-down-up')}翻转棋盘</button><button class="btn" id="chess-resign">认输</button><button class="btn" id="chess-export">导出棋谱</button></div></section>
      <section class="chess-new-section"><h3>新局设置</h3><div class="chess-fields"><label for="chess-mode">对战方式</label><select id="chess-mode"><option value="ai">人机对战</option><option value="local">同屏双人</option></select><label for="chess-level">电脑难度</label><select id="chess-level"><option value="easy">轻松</option><option value="normal">标准</option><option value="hard">深入</option></select><label for="chess-color">我的执棋</label><select id="chess-color"><option value="w">白棋先手</option><option value="b">黑棋后手</option></select></div><button class="btn primary" id="chess-new">开始新局</button><p class="chess-small">更改选项后，开始新局生效</p></section>
      <section class="chess-history-section"><div class="chess-history-heading"><h3>本局棋谱</h3><button class="btn" id="chess-live" hidden>返回对局</button></div><p class="chess-small" id="chess-empty">尚未走棋，白方先行。</p><div class="chess-history" id="chess-history" aria-label="棋谱，点击走法查看局面"></div></section>
      <details class="chess-rules"><summary>规则与操作</summary><p>白方先行，将死对方国王获胜。支持王车易位、吃过路兵，以及兵到达底线后升变为后、车、象或马。</p><p>本游戏采用休闲对局规则：逼和、子力不足、三次重复局面或连续五十回合没有吃子及兵移动时，自动判和。</p><p>方向键移动焦点，Enter 或空格选择与走棋，Esc 取消选择。人机悔棋撤回你的一手及电脑回应，双人撤回一手；终局后可查看棋谱。</p><p>电脑在本机计算，无需账号。难度表示搜索深度，不对应等级分。</p><p id="chess-stats"></p><p class="chess-small">棋子：<a href="https://commons.wikimedia.org/wiki/User:Cburnett/GFDL_images/Chess" rel="noopener">Colin M. L. Burnett</a>（<a href="https://creativecommons.org/licenses/by-sa/3.0/" rel="noopener">CC BY-SA 3.0</a>）；规则：<a href="/static/vendor/chess/LICENSE">chess.js（BSD-2-Clause）</a>。</p></details>
    </aside></div>
    <dialog class="chess-dialog" id="chess-confirm" aria-labelledby="chess-confirm-title"><h2 id="chess-confirm-title"></h2><p id="chess-confirm-copy"></p><div class="chess-actions"><button class="btn" id="chess-cancel" autofocus>继续对局</button><button class="btn primary" id="chess-accept"></button></div></dialog>
    <dialog class="chess-dialog" id="chess-promotion" aria-labelledby="chess-promotion-title"><h2 id="chess-promotion-title">选择升变棋子</h2><p>兵已到达底线，选择要变成的棋子。</p><div class="chess-promotion-options" id="chess-promotion-options"></div><button class="btn" id="chess-promotion-cancel">取消走棋</button></dialog>`;
  function el(id) { return document.getElementById('chess-'+id); }
  function raw() { try { return localStorage.getItem(key); } catch(e) { return null; } }
  function defaults() { return {best:{wins:0},stats:{games:0,wins:0,draws:0},settings:{mode:'ai',level:'normal',color:'w'},session:null}; }
  function validSettings(s) { return s && ['ai','local'].includes(s.mode) && Object.hasOwn(levels,s.level) && ['w','b'].includes(s.color); }
  function validate(d) {
    if (!d || !validSettings(d.settings) || !d.best || !d.stats) throw Error('存档结构无效');
    [d.best.wins,d.stats.games,d.stats.wins,d.stats.draws].forEach(function(n) { if (!Number.isSafeInteger(n)||n<0) throw Error('战绩无效'); });
    if (d.session === null) return;
    var s=d.session; if (!s || !validSettings(s.settings) || typeof s.settled!=='boolean') throw Error('对局无效');
    var g=E.replay(s.moves), actual=E.result(g);
    if (s.result) {
      if (!['w','b',null].includes(s.result.winner)) throw Error('胜方无效');
      if (s.result.reason==='认输') { if (actual || s.result.winner!==(g.turn()==='w'?'b':'w')) throw Error('认输无效'); }
      else if (JSON.stringify(s.result)!==JSON.stringify(actual)) throw Error('结果无效');
    } else if (actual) throw Error('结果缺失');
    if (s.settled!==Boolean(s.result)) throw Error('战绩状态无效');
  }
  function notice(text, reload, backup) { el('notice').hidden=false; el('notice-text').textContent=text; el('reload').hidden=!reload; el('backup').hidden=!backup; }
  function stop() { serial++; clearTimeout(timer); if(worker) worker.terminate(); worker=null; busy=false; }
  function checkConflict() {
    if (!readonly && raw()!==before) { conflict=true; stop(); notice('其他标签页已更新棋局，请加载最新进度后继续。',true,false); }
    return conflict;
  }
  function persist() {
    if (readonly || checkConflict()) return;
    if (save.save(data)) before=raw(); else notice('进度未能保存。你可以继续对局，或导出棋谱备份。',false,false);
  }
  function load() {
    stop(); readonly=false; conflict=false; before=raw(); el('notice').hidden=true;
    try {
      var st=save.load(); if (st.fromFuture || (before && st.isNew)) throw Error('存档版本较新或内容损坏');
      if(before) { var envelope=JSON.parse(before); if(envelope.v!==1) throw Error('存档版本无效'); }
      validate(st.data); data=st.data;
    } catch(error) { readonly=true; data=defaults(); notice('原存档无法读取，已保留。当前为临时对局，可导出原存档备份。',false,true); }
    if (!data.session) data.session={settings:Object.assign({},data.settings),moves:[],result:null,settled:false};
    game=E.replay(data.session.moves); flipped=data.session.settings.color==='b' && data.session.settings.mode==='ai'; selected=null; review=null;
    ['mode','level','color'].forEach(function(k) { el(k).value=data.settings[k]; }); settingsChanged();
    if(M.store.backendKind()==='memory') notice('浏览器无法保存数据，刷新后进度会丢失。可导出棋谱备份。',false,false);
    render(); think();
  }
  function piece(p) { return p ? '<img draggable="false" alt="" src="/static/img/chess/'+p.color+p.type.toUpperCase()+'.svg'+ver+'">' : ''; }
  function player(color, target, shown) {
    var s=data.session.settings, active=shown.turn()===color, who=s.mode==='local'?'同屏玩家':s.color===color?'你':'电脑 · '+levels[s.level];
    var taken=shown.history({verbose:true}).filter(function(m) {return m.color===color && m.captured;});
    el(target).classList.toggle('active',active);
    el(target).innerHTML='<span class="chess-avatar">'+piece({color:color,type:'k'})+'</span><div class="chess-player-name"><b>'+colors[color]+'</b><span>'+who+'</span></div><div class="chess-captured" aria-label="已吃掉 '+taken.length+' 枚棋子">'+taken.map(function(m) {return piece({color:color==='w'?'b':'w',type:m.captured});}).join('')+'</div><span class="chess-player-turn">'+(active && !data.session.result?'行棋中':'')+'</span>';
  }
  function render() {
    var s=data.session, shown=review===null?game:E.replay(s.moves.slice(0,review)), last=shown.history({verbose:true}).slice(-1)[0], focus=el('board').contains(document.activeElement)?document.activeElement.dataset.square:null;
    var legal=selected && review===null ? game.moves({square:selected,verbose:true}) : [], files=flipped?'hgfedcba':'abcdefgh', ranks=flipped?'12345678':'87654321';
    el('board').innerHTML='';
    for(var row=0;row<8;row++) for(var col=0;col<8;col++) {
      var square=files[col]+ranks[row], p=shown.get(square), reachable=legal.some(function(m){return m.to===square;}), cell=document.createElement('button');
      cell.type='button'; cell.dataset.square=square; cell.className='chess-cell '+((row+col)%2?'dark':'light'); cell.tabIndex=square===(focus||'e2')?0:-1;
      if(last && (last.from===square||last.to===square)) cell.classList.add('last');
      if(square===selected) cell.classList.add('selected');
      if(reachable) cell.classList.add(p?'capture':'possible');
      if(p&&p.type==='k'&&p.color===shown.turn()&&shown.in_check()) cell.classList.add('check');
      cell.setAttribute('aria-label',square+' '+(p?colors[p.color]+names[p.type]:'空格')+(reachable?'，可以走到这里':'')+(square===selected?'，已选中':''));
      cell.setAttribute('aria-pressed',String(square===selected)); cell.innerHTML=piece(p); el('board').appendChild(cell);
    }
    if(!el('board').querySelector('[tabindex="0"]')) el('board').firstElementChild.tabIndex=0;
    if(focus) el('board').querySelector('[data-square="'+focus+'"]').focus({preventScroll:true});
    el('files').innerHTML=Array.from(files).map(function(f){return '<span>'+f+'</span>';}).join(''); el('ranks').innerHTML=Array.from(ranks).map(function(r){return '<span>'+r+'</span>';}).join('');
    player(flipped?'w':'b','top-player',shown); player(flipped?'b':'w','bottom-player',shown);
    el('kind').textContent=s.settings.mode==='ai'?'人机对战':'同屏双人'; el('count').textContent='第 '+(Math.floor(shown.history().length/2)+1)+' 回合';
    var result=s.result;
    el('status').textContent=review!==null?'查看第 '+review+' 手':result?(result.winner?colors[result.winner]+'获胜':'本局和棋'):busy?'电脑正在思考':colors[game.turn()]+'行棋'+(game.in_check()?' · 将军':'');
    el('detail').textContent=review!==null?'查看棋谱期间不能走棋。':result?result.reason:game.in_check()?'国王受到攻击，请先解除将军。':selected?'已选择 '+selected+'，标记处为合法走法。':'选择棋子，开始下一步。';
    el('undo').disabled=conflict||!!result||review!==null||!s.moves.length||(s.settings.mode==='ai' && !game.history({verbose:true}).some(function(m){return m.color===s.settings.color;}));
    el('resign').disabled=conflict||!!result||review!==null||busy;
    el('new').disabled=conflict; el('export').disabled=!s.moves.length; el('live').hidden=review===null;
    el('empty').hidden=!!s.moves.length;
    el('history').innerHTML='';
    for(var i=0;i<s.moves.length;i+=2) {
      var line=document.createElement('div'); line.className='chess-history-row'; var number=document.createElement('span'); number.textContent=(i/2+1)+'.'; line.appendChild(number);
      for(var j=i;j<Math.min(i+2,s.moves.length);j++) { var b=document.createElement('button'); b.type='button'; b.textContent=s.moves[j]; b.dataset.ply=j+1; b.setAttribute('aria-label','查看第 '+(j+1)+' 手 '+s.moves[j]); if((review===null?s.moves.length:review)===j+1) b.className='current'; line.appendChild(b); }
      el('history').appendChild(line);
    }
    if(review===null) el('history').scrollTop=el('history').scrollHeight;
    el('stats').textContent='已完成 '+data.stats.games+' 局 · 人机获胜 '+data.stats.wins+' 局 · 和棋 '+data.stats.draws+' 局。';
  }
  function settle(result) {
    if (!result || data.session.settled) return;
    data.session.result=result; data.session.settled=true; data.stats.games++;
    if(!result.winner) data.stats.draws++;
    if(data.session.settings.mode==='ai' && result.winner===data.session.settings.color) {data.stats.wins++; data.best.wins=data.stats.wins;}
  }
  function commit(move) {
    if(checkConflict() || data.session.result || review!==null) return;
    var made=game.move(move); if(!made) return;
    data.session.moves.push(made.san); selected=null; settle(E.result(game)); persist(); render(); think();
  }
  function think() {
    if(conflict||data.session.result||review!==null||data.session.settings.mode!=='ai'||game.turn()===data.session.settings.color) return;
    stop(); busy=true; render(); var id=serial;
    function fallback() {
      if(id!==serial) return; stop(); notice('电脑搜索暂不可用，已改用快速走法。',false,false);
      var moves=game.moves({verbose:true}); moves.sort(function(a,b){return Number(!!b.captured)-Number(!!a.captured);});
      if(moves.length) commit(moves[0]);
    }
    try {
      worker=new Worker(new URL('chess-worker.js'+ver,source));
      worker.onmessage=function(event) { if(event.data.id!==serial) return; var move=event.data.move; stop(); if(game.moves().includes(move)) commit(move); else {render();notice('电脑未返回有效走法，请悔棋或开始新局。',false,false);} };
      worker.onerror=fallback; timer=setTimeout(fallback,5000); worker.postMessage({id:id,moves:data.session.moves,level:data.session.settings.level});
    } catch(error) {fallback();}
  }
  function choose(square) {
    if(conflict||busy||review!==null||data.session.result||checkConflict()) return;
    var p=game.get(square);
    if(selected===square) {selected=null;render();return;}
    if(selected) {
      var options=game.moves({square:selected,verbose:true}).filter(function(m){return m.to===square;});
      if(options.length) {
        if(options[0].promotion) {
          el('promotion-options').innerHTML='';
          ['q','r','b','n'].forEach(function(type) {var b=document.createElement('button'); b.className='btn'; b.innerHTML=piece({color:game.turn(),type:type})+'<span>'+names[type]+'</span>'; b.onclick=function(){var from=selected;el('promotion').close();commit({from:from,to:square,promotion:type});};el('promotion-options').appendChild(b);});
          el('promotion').showModal();return;
        }
        commit(options[0]); return;
      }
    }
    selected=p&&p.color===game.turn()?square:null; render();
  }
  el('board').onclick=function(event) {var cell=event.target.closest('[data-square]'); if(cell) choose(cell.dataset.square);};
  el('board').onkeydown=function(event) {
    var cell=event.target.closest('[data-square]'); if(!cell) return;
    var buttons=Array.from(el('board').children), index=buttons.indexOf(cell), next=index;
    if(event.key==='ArrowLeft') next=Math.max(0,index-1); else if(event.key==='ArrowRight') next=Math.min(63,index+1); else if(event.key==='ArrowUp') next=Math.max(0,index-8); else if(event.key==='ArrowDown') next=Math.min(63,index+8); else if(event.key==='Escape'){selected=null;render();return;} else return;
    event.preventDefault(); cell.tabIndex=-1;buttons[next].tabIndex=0;buttons[next].focus();
  };
  el('undo').onclick=function() {
    if(el('undo').disabled||checkConflict()) return; stop(); var s=data.session;
    do {game.undo();s.moves.pop();} while(s.settings.mode==='ai' && s.moves.length && game.turn()!==s.settings.color);
    selected=null;persist();render();think();
  };
  el('flip').onclick=function(){flipped=!flipped;render();};
  el('history').onclick=function(event) {var b=event.target.closest('[data-ply]'); if(!b) return;stop();selected=null;review=Number(b.dataset.ply);render();el('live').focus();};
  el('live').onclick=function(){review=null;render();think();};
  function confirmAction(title,copy,action) {
    el('confirm-title').textContent=title+'？';el('confirm-copy').textContent=copy;el('accept').textContent=title;
    el('accept').onclick=function(){el('confirm').close();action();};el('confirm').showModal();
  }
  el('cancel').onclick=function(){el('confirm').close();};
  el('promotion-cancel').onclick=function(){el('promotion').close();};
  function start() {
    if(checkConflict()) return; stop(); data.settings=Object.assign({},data.settings,{mode:el('mode').value,level:el('level').value,color:el('color').value});
    data.session={settings:Object.assign({},data.settings),moves:[],result:null,settled:false};game=new Chess();review=null;selected=null;flipped=data.settings.mode==='ai'&&data.settings.color==='b';persist();render();think();
  }
  el('new').onclick=function(){if(data.session.moves.length&&!data.session.result) confirmAction('开始新局','当前棋局将被替换，未完成的对局不计战绩。',start);else start();};
  el('resign').onclick=function(){confirmAction('确认认输','认输后本局结束，'+colors[game.turn()==='w'?'b':'w']+'获胜。',function(){if(checkConflict())return;stop();settle({winner:game.turn()==='w'?'b':'w',reason:'认输'});persist();render();});};
  function settingsChanged(){var local=el('mode').value==='local';el('level').disabled=local;el('color').disabled=local;}
  el('mode').onchange=settingsChanged;
  function download(text,name){var url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
  el('export').onclick=function(){var g=E.replay(data.session.moves),r=data.session.result;g.header('Event','主页国际象棋','Result',r?(r.winner==='w'?'1-0':r.winner==='b'?'0-1':'1/2-1/2'):'*');download(g.pgn(),'国际象棋.pgn');};
  el('backup').onclick=function(){download(before||'','国际象棋原存档.json');};el('reload').onclick=load;
  window.addEventListener('storage',function(event){if(event.key===key||event.key===null){checkConflict();render();}});
  window.addEventListener('pagehide',stop);
  window.addEventListener('pageshow',function(event){if(event.persisted){checkConflict();render();think();}});
  load();
})(window.App,window.ChessGame);
