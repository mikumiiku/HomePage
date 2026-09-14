const {endpoint, models, complete} = await import('./chat-client.js'+new URL(import.meta.url).search);
const M = window.App, $ = id => document.getElementById('chat-' + id);
const loaded = M.store.load('app','chat');
let data = loaded.data, controller = null, modelController = null, pending = false, follow = true;
let editing = '', dirty = false, conflict = loaded.fromFuture, writeTimer = null, confirmAction = null, returnFocus = null;
const app = document.querySelector('.chat-app'), scroll = $('scroll');
const icon = name => '<i class="ti" style="--icon:url(/static/vendor/bootstrap-icons/'+name+'.svg)" aria-hidden="true"></i>';
const uid = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);
const active = () => data.session.threads.find(t=>t.id===data.session.active);
const profile = () => data.settings.profiles.find(p=>p.id===data.settings.selected);
function storageError(message) { $('storage-error').hidden=false; $('storage-error').textContent=message; }
function save() {
  clearTimeout(writeTimer);
  if(conflict) return false;
  const ok=M.store.save('app','chat',data);
  if(!ok) storageError('浏览器存储空间不足，本次修改尚未保存。请先导出对话，再删除不需要的历史记录。');
  return ok;
}
function scheduleSave(){clearTimeout(writeTimer);writeTimer=setTimeout(save,500);}
function status(text){$('status').textContent=text;}
function notice(text){M.toast(text);}
function fail(text){$('error').hidden=false;$('error').querySelector('span').textContent=text;$('retry').hidden=!active()?.messages.some(m=>m.role==='user');}
function usable(){if(conflict){notice('本页数据已过期，请刷新后继续；可先导出当前对话。');return false;}return true;}
function ensureThread(){
  let thread=active();
  if(!thread){thread={id:uid(),title:'新对话',time:Date.now(),draft:'',messages:[]};data.session.threads.unshift(thread);data.session.active=thread.id;}
  return thread;
}
function history(){
  const nav=$('history');nav.replaceChildren();
  if(!data.session.threads.length){const p=document.createElement('p');p.className='chat-history-empty';p.innerHTML=icon('chat-left-text')+'<span>暂无对话记录</span><span>开始新对话，记录会显示在这里。</span>';nav.append(p);}
  data.session.threads.forEach(t=>{
    const row=document.createElement('div');row.className='chat-history-row'+(t.id===data.session.active?' active':'');
    const b=document.createElement('button');b.type='button';b.className='chat-history-name';b.textContent=t.title;b.title=t.title;b.setAttribute('aria-current',String(t.id===data.session.active));
    b.onclick=()=>{if(!usable())return;stop();data.session.active=t.id;save();render();closeHistory();$('input').focus();};
    const d=document.createElement('button');d.type='button';d.className='chat-icon';d.innerHTML=icon('trash');d.setAttribute('aria-label','删除对话：'+t.title);
    d.onclick=()=>confirm('删除对话','删除“'+t.title+'”？此浏览器中的这段对话将被移除。','删除对话',()=>{stop();data.session.threads=data.session.threads.filter(x=>x.id!==t.id);if(data.session.active===t.id)data.session.active=data.session.threads[0]?.id||'';save();render();});
    row.append(b,d);nav.append(row);
  });
}
function profileOptions(){
  const select=$('profile-select');select.replaceChildren();
  if(!data.settings.profiles.length)select.add(new Option('选择模型',''));
  data.settings.profiles.forEach(p=>{
    const group=document.createElement('optgroup');group.label=p.name;
    p.models.forEach(model=>group.append(new Option(model,JSON.stringify([p.id,model]))));select.append(group);
  });
  select.add(new Option('连接模型服务…','__connect__'));
  const p=profile();select.value=p?JSON.stringify([p.id,p.model]):'';
  select.title=p?p.model:'请先在设置中连接模型服务';
  $('provider-label').textContent=p?p.name+' / '+p.model:'尚未连接模型服务';
  $('effort-select').value=p?.reasoning||'';
  select.disabled=pending||conflict;$('effort-select').disabled=pending||conflict||!p;
}
function markdown(text){
  const clean=DOMPurify.sanitize(marked.parse(text),{
    ALLOWED_TAGS:['p','br','strong','em','del','s','blockquote','ul','ol','li','pre','code','h1','h2','h3','h4','h5','h6','hr','table','thead','tbody','tr','th','td','a'],
    ALLOWED_ATTR:['href','title','start'],ALLOW_DATA_ATTR:false
  });
  const template=document.createElement('template');template.innerHTML=clean;
  template.content.querySelectorAll('a').forEach(a=>{try{const u=new URL(a.getAttribute('href'));if(!['https:','http:'].includes(u.protocol))throw 0;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';}catch{a.removeAttribute('href');}});
  return template.content;
}
async function copy(text){
  try {
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
    else {const field=document.createElement('textarea');field.value=text;field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();const ok=document.execCommand('copy');field.remove();if(!ok)throw 0;}
    notice('已复制');
  }catch{notice('无法自动复制，请选择文本后复制。');}
}
function messageNode(m,index,thread){
  const article=document.createElement('article');article.className='chat-message '+m.role;article.dataset.message=m.id;
  const heading=document.createElement('div');heading.className='chat-message-heading';
  const label=document.createElement('strong');label.textContent=m.role==='user'?'你':m.model||'助手';heading.append(label);article.append(heading);
  if(m.reasoning){const details=document.createElement('details');details.className='chat-reasoning';const summary=document.createElement('summary');summary.textContent='思考过程';const pre=document.createElement('pre');pre.textContent=m.reasoning;details.append(summary,pre);article.append(details);}
  const body=document.createElement('div');body.className='chat-body';
  if(m.role==='user')body.textContent=m.content;else if(m.content)body.append(markdown(m.content));else body.textContent=m.state==='streaming'?'正在等待回复…':m.state==='stopped'?'已停止生成。':'暂未收到回复。';
  article.append(body);
  const state=document.createElement('div');state.className='chat-message-state';state.textContent=({streaming:'正在生成',stopped:'已停止，已保留收到的内容',error:'回复未完成'})[m.state]||'';article.append(state);
  if(m.state!=='streaming'){
    const actions=document.createElement('div');actions.className='chat-message-actions';
    const c=document.createElement('button');c.type='button';c.className='chat-text';c.innerHTML=icon('copy')+'复制';c.onclick=()=>copy(m.content);actions.append(c);
    if(m.role==='assistant'&&index===thread.messages.length-1){const retry=document.createElement('button');retry.type='button';retry.className='chat-text';retry.innerHTML=icon('arrow-clockwise')+'重新生成';retry.disabled=pending;retry.onclick=()=>send(true);actions.append(retry);}
    article.append(actions);
  }
  return article;
}
// Keep completed messages and disclosure elements mounted while streaming.
let renderedThread='', scrollFrame=0, lastScrollTop=0;
function atBottom(){return scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<24;}
function syncScroll(){
  cancelAnimationFrame(scrollFrame);
  scrollFrame=requestAnimationFrame(()=>{
    if(follow)scroll.scrollTop=scroll.scrollHeight;
    lastScrollTop=scroll.scrollTop;
    $('jump').hidden=atBottom()||!active()?.messages.length;
  });
}
function messages(){
  const thread=active(),container=$('messages');
  const threadID=thread?.id||'';
  if(renderedThread!==threadID){container.replaceChildren();renderedThread=threadID;follow=true;}
  $('welcome').hidden=!!thread?.messages.length;
  const hadMessages=app.classList.contains('has-messages');
  app.classList.toggle('has-messages',!!thread?.messages.length);
  if(hadMessages!==app.classList.contains('has-messages'))resizeInput();
  const existing=new Map([...container.children].map(node=>[node.dataset.message,node]));
  thread?.messages.forEach((m,i)=>{
    let node=existing.get(m.id);existing.delete(m.id);
    const signature=[m.content,m.reasoning,m.state,i===thread.messages.length-1,i===thread.messages.length-1&&pending];
    if(!node){node=messageNode(m,i,thread);container.append(node);}
    else if(signature.some((value,index)=>value!==node._rendered?.[index])){
      const fresh=messageNode(m,i,thread);
      const parts=[...fresh.children],keep=new Set(parts.map(part=>part.className));
      for(const child of [...node.children])if(!keep.has(child.className))child.remove();
      parts.forEach((part,index)=>{
        const old=[...node.children].find(child=>child.className===part.className);
        if(old?.classList.contains('chat-reasoning')){
          if(old.querySelector('pre').textContent!==m.reasoning)old.querySelector('pre').textContent=m.reasoning;
        }else if(old){
          if(old.outerHTML!==part.outerHTML)old.replaceWith(part);
        }else node.insertBefore(part,node.children[index]||null);
      });
    }
    node._rendered=signature;
  });
  for(const node of existing.values())node.remove();
  syncScroll();
}
function render(){
  history();profileOptions();$('title').textContent=active()?.title||'新对话';
  $('input').value=active()?.draft||'';resizeInput();follow=true;messages();
  $('error').hidden=true;status('');busyUI();
}
function busyUI(){
  $('send').hidden=pending;$('stop').hidden=!pending;$('send').disabled=!$('input').value.trim()||conflict;
  $('profile-select').disabled=pending||conflict;$('effort-select').disabled=pending||conflict||!profile();$('sidebar-settings').disabled=pending;
  $('messages').setAttribute('aria-busy',String(pending));
}
function resizeInput(){const t=$('input');t.style.height='0px';t.style.height=Math.min(140,Math.max(28,t.scrollHeight))+'px';syncScroll();}
function stop(){if(controller)controller.abort();}
async function send(retry=false){
  if(pending||!usable())return;
  const p=profile();if(!p){openSettings();return;}
  let thread=active();
  const content=$('input').value.trim();
  if(!retry&&!content)return;
  if(retry&&!thread?.messages.some(m=>m.role==='user'))return;
  thread=ensureThread();
  if(retry){while(thread.messages.length&&thread.messages.at(-1).role==='assistant')thread.messages.pop();}
  else {
    if(thread.messages.length>=500){fail('这段对话已达到 500 条消息，请新建对话。');return;}
    thread.messages.push({id:uid(),role:'user',content,time:Date.now()});
    if(thread.title==='新对话')thread.title=content.replace(/\s+/g,' ').slice(0,30);
    thread.draft='';$('input').value='';resizeInput();
  }
  const requestMessages=thread.messages.filter(m=>m.content&&m.state!=='error').map(m=>({role:m.role,content:m.content}));
  if(p.system)requestMessages.unshift({role:'system',content:p.system});
  const reply={id:uid(),role:'assistant',content:'',reasoning:'',model:p.model,state:'streaming',time:Date.now()};
  thread.messages.push(reply);thread.time=Date.now();save();
  $('title').textContent=thread.title;
  pending=true;controller=new AbortController();const requestController=controller;
  let timedOut=false;
  const timeout=setTimeout(()=>{timedOut=true;requestController.abort();},180000);
  $('error').hidden=true;follow=true;history();messages();busyUI();$('input').focus();status('正在生成回复…');
  let paintTime=0;
  try{
    await complete({...p},requestMessages,{signal:requestController.signal,onDelta:(text,reasoning)=>{
      reply.content+=text;reply.reasoning+=reasoning;
      if(reply.content.length+reply.reasoning.length>200000){requestController.abort();return;}
      scheduleSave();
      if(performance.now()-paintTime>65&&data.session.active===thread.id){paintTime=performance.now();messages();}
    }});
    reply.state='done';if(data.session.active===thread.id)status('回复完成');
  }catch(e){
    reply.state=e.name==='AbortError'?'stopped':'error';
    if(data.session.active===thread.id){
      if(timedOut){reply.state='error';fail('等待回复超过 3 分钟，已停止。可以重试。');status('请求超时');}
      else if(e.name==='AbortError')status('已停止生成，保留了收到的内容。');
      else {fail(e.message);status('回复未完成，可以重试。');}
    }
  }finally{
    clearTimeout(timeout);pending=false;controller=null;save();
    if(data.session.active===thread.id)messages();
    profileOptions();busyUI();
  }
}
function closeHistory(){app.classList.remove('history-open');$('open-history').setAttribute('aria-expanded','false');}
function confirm(title,text,label,action){
  if(!usable())return;
  returnFocus=document.activeElement;confirmAction=action;$('confirm-title').textContent=title;$('confirm-text').textContent=text;$('confirm-yes').textContent=label;$('confirm').showModal();$('confirm-no').focus();
}
function closeConfirm(){const actionFocus=returnFocus;$('confirm').close();confirmAction=null;if(actionFocus?.isConnected)actionFocus.focus();}
$('confirm-no').onclick=closeConfirm;
$('confirm-yes').onclick=()=>{const action=confirmAction;closeConfirm();action?.();};
$('confirm').addEventListener('cancel',()=>{confirmAction=null;});
let settingsOpener=null;
function formProfile(){
  const existing=data.settings.profiles.find(p=>p.id===editing);
  return {...existing,id:editing||uid(),name:$('config-name').value.trim(),base:$('config-base').value.trim().replace(/\/+$/,''),key:$('config-key').value.trim(),model:existing?.model||'',models:existing?.models||[],reasoning:existing?.reasoning||'',system:$('config-system').value.trim(),temperature:$('config-temp').value};
}
function cancelConnection(){
  modelController?.abort();modelController=null;
  $('connect').disabled=false;$('connect').textContent='连接';$('settings-form').setAttribute('aria-busy','false');
}
function connectionStatus(title,description,connected=false){
  $('model-status').textContent=title;$('model-preview').textContent=description;
  $('connection-status').classList.toggle('connected',connected);
}
function fillProfile(id){
  cancelConnection();editing=id;const p=data.settings.profiles.find(x=>x.id===id);
  for(const field of ['name','base','key','system']){
    $('config-'+field).value=p?.[field]||'';$('config-'+field).removeAttribute('aria-invalid');
  }
  $('config-temp').value=p?.temperature??'';$('config-temp').removeAttribute('aria-invalid');
  $('config-select').value=id;$('delete-profile').hidden=!id;
  $('config-error').hidden=true;dirty=false;
  $('config-key').type='password';$('key-toggle').setAttribute('aria-pressed','false');$('key-toggle').setAttribute('aria-label','显示密钥');$('key-toggle').innerHTML=icon('eye');
  $('connect').textContent=p?'重新连接':'连接';
  $('save-preferences').disabled=!p;
  connectionStatus(p?'已保存 '+p.models.length+' 个模型':'尚未连接',p?'重新连接可刷新模型列表。':'填写地址和密钥后点击连接。',!!p);
}
function configOptions(){
  const s=$('config-select');s.replaceChildren(new Option('新连接',''));
  data.settings.profiles.forEach(p=>s.add(new Option(p.name,p.id)));
  $('saved-connections').hidden=!data.settings.profiles.length;
}
function openSettings(){
  if(!usable()||pending)return;settingsOpener=document.activeElement;configOptions();fillProfile(data.settings.selected);
  $('settings').showModal();$('config-base').focus();
}
function closeSettings(force=false){
  const close=()=>{cancelConnection();$('settings').close();(settingsOpener?.isConnected?settingsOpener:$('sidebar-settings')).focus();};
  if(dirty&&!force){confirm('放弃修改','当前设置尚未保存，是否放弃这些修改？','放弃修改',close);return;}
  close();
}
function configError(text,field){
  $('config-error').textContent=text;$('config-error').hidden=false;
  if(field){$(field).setAttribute('aria-invalid','true');$(field).setAttribute('aria-describedby','chat-config-error');$(field).focus();}
}
function validateProfile(p){
  try{endpoint(p.base,'models');}catch(e){configError(e.message,'config-base');return false;}
  if(p.temperature!==''&&(!Number.isFinite(Number(p.temperature))||Number(p.temperature)<0||Number(p.temperature)>2)){
    configError('温度应为 0 到 2，或留空。','config-temp');return false;
  }
  if(!p.name)p.name=new URL(p.base).hostname;
  return true;
}
function commitProfile(p){
  if(!usable()){configError('另一个标签页已修改设置，请刷新后重试。');return false;}
  const previous=structuredClone(data.settings),i=data.settings.profiles.findIndex(x=>x.id===p.id);
  if(i<0)data.settings.profiles.push(p);else data.settings.profiles[i]=p;data.settings.selected=p.id;
  if(!save()){
    data.settings=previous;configError('浏览器未能保存设置，请先导出对话并检查可用空间。');return false;
  }
  editing=p.id;dirty=false;configOptions();$('config-select').value=p.id;$('delete-profile').hidden=false;
  $('save-preferences').disabled=false;profileOptions();busyUI();return true;
}
$('sidebar-settings').onclick=openSettings;
$('settings-close').onclick=()=>closeSettings();$('settings-cancel').onclick=()=>closeSettings();
$('settings').addEventListener('cancel',e=>{e.preventDefault();closeSettings();});
$('settings-form').addEventListener('input',e=>{
  if(e.target===$('config-select'))return;
  dirty=true;e.target.removeAttribute('aria-invalid');$('config-error').hidden=true;
  if(modelController){cancelConnection();connectionStatus('连接已取消','设置已修改，请重新连接。');}
  const p=data.settings.profiles.find(x=>x.id===editing);
  const credentialsChanged=!p||p.base!==$('config-base').value.trim().replace(/\/+$/,'')||p.key!==$('config-key').value.trim();
  $('save-preferences').disabled=credentialsChanged;
  if(credentialsChanged)connectionStatus('尚未连接此服务','点击连接后获取并保存模型列表。');
});
$('settings-form').addEventListener('submit',async e=>{
  e.preventDefault();if(e.isComposing||!usable()||modelController)return;
  const p=formProfile();if(!validateProfile(p))return;
  const ctl=new AbortController();modelController=ctl;let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;ctl.abort();},20000);
  $('connect').disabled=true;$('connect').textContent='连接中…';$('config-error').hidden=true;
  $('save-preferences').disabled=true;$('settings-form').setAttribute('aria-busy','true');
  connectionStatus('正在连接…','正在获取服务商的模型列表。');
  try{
    const list=await models(p,ctl.signal);
    if(modelController!==ctl||ctl.signal.aborted||!$('settings').open)return;
    if(!list.length)throw new Error('连接成功，但服务商没有返回可用模型。请检查密钥的模型权限或 Base URL。');
    p.models=list;if(!list.includes(p.model))p.model=list[0];
    if(!commitProfile(p)){connectionStatus('连接成功，但未保存','请处理上方提示后重试。');return;}
    connectionStatus('连接成功 · '+list.length+' 个模型','模型列表已更新，可关闭设置后直接选择。',true);
    notice('已连接，模型列表已更新');
  }catch(error){
    if(modelController!==ctl)return;
    const message=timedOut?'连接超过 20 秒，请检查地址和网络后重试。':error.message;
    if(error.name!=='AbortError'||timedOut){configError(message);connectionStatus('连接失败','原有连接和模型列表已保留。');}
  }finally{
    clearTimeout(timer);
    if(modelController===ctl){
      modelController=null;$('connect').disabled=false;$('connect').textContent=editing?'重新连接':'连接';
      $('settings-form').setAttribute('aria-busy','false');
      const current=data.settings.profiles.find(x=>x.id===editing);
      $('save-preferences').disabled=!current||current.base!==p.base||current.key!==p.key;
    }
  }
});
$('settings-form').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.isComposing||e.keyCode===229))e.preventDefault();});
$('save-preferences').onclick=()=>{
  if(modelController||!usable())return;const p=formProfile(),existing=data.settings.profiles.find(x=>x.id===editing);
  if(!existing||p.base!==existing.base||p.key!==existing.key)return configError('地址或密钥已修改，请点击连接。');
  if(!validateProfile(p))return;
  if(commitProfile(p)){$('config-error').hidden=true;notice('设置已保存');}
};
function changeConfig(id){
  if(dirty){confirm('放弃修改','切换连接会丢弃尚未保存的修改。','放弃修改',()=>fillProfile(id));$('config-select').value=editing;}
  else fillProfile(id);
}
$('config-select').onchange=e=>changeConfig(e.target.value);$('add-profile').onclick=()=>{changeConfig('');};
$('key-toggle').onclick=()=>{const show=$('config-key').type==='password';$('config-key').type=show?'text':'password';$('key-toggle').setAttribute('aria-pressed',String(show));$('key-toggle').setAttribute('aria-label',show?'隐藏密钥':'显示密钥');$('key-toggle').innerHTML=icon(show?'eye-slash':'eye');};
$('delete-profile').onclick=()=>{
  const p=data.settings.profiles.find(p=>p.id===editing);if(!p)return;
  confirm('删除连接','删除“'+p.name+'”及此浏览器保存的密钥和模型列表？对话记录会保留。','删除连接',()=>{
    cancelConnection();const previous=structuredClone(data.settings);
    data.settings.profiles=data.settings.profiles.filter(x=>x.id!==p.id);
    if(data.settings.selected===p.id)data.settings.selected=data.settings.profiles[0]?.id||'';
    if(!save()){data.settings=previous;return configError('删除未保存，请检查浏览器存储空间后重试。');}
    dirty=false;configOptions();fillProfile(data.settings.selected);profileOptions();busyUI();notice('已删除连接');
  });
};
$('new').onclick=()=>{
  if(!usable())return;
  if(data.session.threads.length>=100){notice('已保存 100 段对话，请导出并删除不需要的记录后继续。');return;}
  stop();data.session.active='';save();render();closeHistory();$('input').focus();
};
$('profile-select').onchange=e=>{
  if(e.target.value==='__connect__'){profileOptions();openSettings();return;}
  if(!usable()||pending){profileOptions();return;}
  let selection;try{selection=JSON.parse(e.target.value);}catch{profileOptions();return;}
  const p=data.settings.profiles.find(x=>x.id===selection[0]);if(!p||!p.models.includes(selection[1]))return;
  const previous=structuredClone(data.settings);data.settings.selected=p.id;p.model=selection[1];
  if(!save())data.settings=previous;profileOptions();
};
$('effort-select').onchange=e=>{
  const p=profile();if(!p||pending||!usable()){profileOptions();return;}
  const before=p.reasoning;p.reasoning=e.target.value;if(!save())p.reasoning=before;profileOptions();
};
$('input').addEventListener('input',()=>{if(!usable())return;ensureThread().draft=$('input').value;scheduleSave();resizeInput();busyUI();});
$('input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();send();}});
$('compose').onsubmit=e=>{e.preventDefault();send();};$('stop').onclick=stop;$('retry').onclick=()=>send(true);
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{$('input').value=b.dataset.prompt;$('input').dispatchEvent(new Event('input'));$('input').focus();});
scroll.addEventListener('scroll',()=>{
  const top=scroll.scrollTop;
  if(atBottom())follow=true;
  else if(top<lastScrollTop-2)follow=false;
  lastScrollTop=top;
  $('jump').hidden=atBottom();
});
scroll.addEventListener('wheel',e=>{if(e.deltaY<0)follow=false;},{passive:true});
let touchY=0;
scroll.addEventListener('touchstart',e=>{touchY=e.touches[0].clientY;},{passive:true});
scroll.addEventListener('touchmove',e=>{if(e.touches[0].clientY>touchY+3)follow=false;touchY=e.touches[0].clientY;},{passive:true});
scroll.addEventListener('keydown',e=>{if(['ArrowUp','PageUp','Home'].includes(e.key))follow=false;});
$('jump').onclick=()=>{follow=true;syncScroll();};
new ResizeObserver(()=>syncScroll()).observe(scroll);
$('messages').addEventListener('toggle',e=>{if(e.target.matches('.chat-reasoning')){follow=false;syncScroll();}},true);
$('open-history').onclick=()=>{app.classList.add('history-open');$('open-history').setAttribute('aria-expanded','true');$('close-history').focus();};
$('close-history').onclick=()=>{closeHistory();$('open-history').focus();};
$('export').onclick=()=>{
  // Export conversations only: connection URLs and credentials never enter this file.
  const content=JSON.stringify({format:'homepage-chat',version:1,threads:data.session.threads},null,2);
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='AI对话-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('已导出对话，不包含模型密钥');
};
$('import').onclick=()=>{if(usable())$('import-file').click();};
$('import-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{
    if(file.size>8*1024*1024)throw new Error('文件超过 8 MB，请分批导入。');
    const incoming=JSON.parse(await file.text());
    if(incoming.format!=='homepage-chat'||incoming.version!==1||!Array.isArray(incoming.threads)||incoming.threads.length>100)throw new Error('请选择本站导出的对话文件。');
    if(data.session.threads.length+incoming.threads.length>100)throw new Error('导入后超过 100 段对话，请先清理不需要的记录。');
    const threads=incoming.threads.map(t=>{
      if(!t||typeof t.title!=='string'||!Array.isArray(t.messages)||t.messages.length>500)throw new Error('文件中的对话格式无效。');
      return {id:uid(),title:t.title.slice(0,60),time:Date.now(),draft:typeof t.draft==='string'?t.draft.slice(0,100000):'',messages:t.messages.map(m=>{
        if(!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>200000)throw new Error('文件中的消息格式无效。');
        return {id:uid(),role:m.role,content:m.content,reasoning:typeof m.reasoning==='string'?m.reasoning.slice(0,200000):'',model:typeof m.model==='string'?m.model.slice(0,200):'',state:['done','error','stopped'].includes(m.state)?m.state:'done',time:Date.now()};
      })};
    });
    confirm('导入对话','将添加 '+threads.length+' 段对话，已有记录和模型配置不会被覆盖。','导入对话',()=>{const old=[...data.session.threads];data.session.threads.push(...threads);if(!save()){data.session.threads=old;return;}history();notice('已导入 '+threads.length+' 段对话');});
  }catch(e){notice(e instanceof SyntaxError?'文件不是有效的 JSON 对话存档。':e.message);}
};
window.addEventListener('storage',e=>{if(e.key===M.store.PREFIX+'app:chat'){conflict=true;stop();cancelConnection();storageError('另一个标签页已修改对话。为避免覆盖，本页已暂停保存；可先导出当前记录，然后刷新。');busyUI();}});
window.addEventListener('pagehide',()=>{stop();modelController?.abort();for(const t of data.session.threads)for(const m of t.messages)if(m.state==='streaming')m.state='stopped';save();});
if(loaded.fromFuture)storageError('此浏览器的数据来自更新版本，当前页面只读，请更新页面后使用。');
if(loaded.backend==='memory')storageError('当前浏览器禁止本地存储，关闭页面后记录和密钥会丢失。请及时导出对话。');
for(const t of data.session.threads)for(const m of t.messages)if(m.state==='streaming')m.state='stopped';
render();
