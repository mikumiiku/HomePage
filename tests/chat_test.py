"""Browser-only chat: real CORS transport, fragmented SSE, no website POSTs."""
import json, threading, time, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('CHAT_BASE','http://127.0.0.1:8034')
requests=[]
class Model(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def cors(self,code=200,typ='application/json'):
  self.send_response(code);self.send_header('Access-Control-Allow-Origin','*');self.send_header('Access-Control-Allow-Headers','Authorization, Content-Type');self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS');self.send_header('Content-Type',typ);self.end_headers()
 def do_OPTIONS(self): self.cors(204)
 def do_GET(self):
  self.cors();self.wfile.write(json.dumps({'data':[{'id':'test-model'}]}).encode())
 def do_POST(self):
  d=json.loads(self.rfile.read(int(self.headers['Content-Length'])));requests.append((d,self.headers.get('Authorization')))
  q=d['messages'][-1]['content']
  if q=='ERROR':self.cors(401);self.wfile.write(b'{}');return
  self.cors(typ='text/event-stream')
  chunks=['你好，','这是**测试回复**。','\n\n'+chr(96)*3+'js\nconst ok = true;\n'+chr(96)*3+'\n','<img src="https://tracker.invalid/pixel" onerror="alert(1)">']
  try:
   for value in chunks if q!='SLOW' else ['慢速内容。']*30:
    frame=('data: '+json.dumps({'choices':[{'delta':{'content':value}}]},ensure_ascii=False)+'\r\n\r\n').encode()
    for i in range(0,len(frame),7): self.wfile.write(frame[i:i+7]);self.wfile.flush()
    time.sleep(.12 if q!='SLOW' else .35)
   self.wfile.write(b'data: [DONE]\n\n');self.wfile.flush()
  except (BrokenPipeError,ConnectionResetError):pass
server=ThreadingHTTPServer(('127.0.0.1',8091),Model);threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':1280,'height':900},accept_downloads=True)
 page=ctx.new_page();errors=[];site_posts=[];trackers=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:site_posts.append(r.url) if r.method=='POST' and r.url.startswith(BASE) else None)
 page.on('request',lambda r:trackers.append(r.url) if 'tracker.invalid' in r.url else None)
 page.goto(BASE+'/home');page.get_by_role('button',name='设置',exact=True).click()
 page.get_by_role('button',name='连接',exact=True).click();assert page.locator('#chat-config-error').is_visible()
 page.get_by_label('Base URL',exact=True).fill(BASE)
 page.get_by_role('button',name='连接',exact=True).click();assert '本站地址' in page.locator('#chat-config-error').inner_text()
 page.get_by_label('Base URL',exact=True).fill('http://localhost:8091/v1')
 page.get_by_label('API Key',exact=True).fill('test-browser-only-secret')
 assert page.locator('#chat-config-key').get_attribute('type')=='password'
 page.get_by_role('button',name='显示密钥',exact=True).click();assert page.locator('#chat-config-key').get_attribute('type')=='text'
 page.get_by_role('button',name='连接',exact=True).click();page.wait_for_function("document.querySelector('#chat-model-status').textContent.includes('连接成功')")
 page.get_by_role('button',name='完成',exact=True).click();page.wait_for_function("!document.querySelector('#chat-settings').open")
 page.locator('#chat-input').fill('你好');page.keyboard.press('Enter')
 page.wait_for_function("document.querySelector('#chat-status').textContent.includes('回复完成')")
 assert '测试回复' in page.locator('#chat-messages').inner_text()
 assert page.locator('#chat-title').inner_text()=='你好'
 assert page.locator('#chat-messages img').count()==0 and not trackers
 assert requests[-1][1]=='Bearer test-browser-only-secret'
 assert requests[-1][0]['messages']==[{'role':'user','content':'你好'}]
 page.screenshot(path='/tmp/chat-conversation.png',full_page=True)
 page.reload();page.wait_for_function("document.querySelector('#chat-messages').textContent.includes('测试回复')")
 assert page.locator('#chat-profile-select').input_value()
 n=len(requests);page.locator('#chat-input').fill('中文输入')
 page.locator('#chat-input').dispatch_event('keydown',{'key':'Enter','isComposing':True,'bubbles':True})
 page.wait_for_timeout(150);assert len(requests)==n
 page.locator('#chat-input').fill('SLOW');page.get_by_role('button',name='发送',exact=True).click()
 page.wait_for_function("document.querySelector('#chat-messages').textContent.includes('慢速内容')")
 page.get_by_role('button',name='停止生成',exact=True).click();page.wait_for_function("document.querySelector('#chat-stop').hidden")
 assert '已停止' in page.locator('#chat-messages').inner_text()
 page.locator('#chat-input').fill('ERROR');page.get_by_role('button',name='发送',exact=True).click()
 page.wait_for_function("!document.querySelector('#chat-error').hidden")
 assert '密钥无效' in page.locator('#chat-error').inner_text()
 users=page.locator('.chat-message.user').count();page.get_by_role('button',name='重试回复',exact=True).click()
 page.wait_for_function("!document.querySelector('#chat-error').hidden && document.querySelector('#chat-stop').hidden")
 assert page.locator('.chat-message.user').count()==users
 page.get_by_role('button',name='设置',exact=True).click()
 with page.expect_download() as download:page.get_by_role('button',name='导出对话',exact=True).click()
 saved=Path(download.value.path()).read_text()
 assert 'test-browser-only-secret' not in saved and 'localhost:8091' not in saved and '你好' in saved
 page.locator('#chat-import-file').set_input_files({'name':'chat.json','mimeType':'application/json','buffer':saved.encode()})
 page.locator('#chat-confirm-yes').click()
 assert page.locator('.chat-history-row').count()==2
 page.get_by_role('button',name='关闭设置',exact=True).click()
 page.get_by_role('button',name='新建对话',exact=True).click();assert page.get_by_role('heading',name='有什么想聊的？').is_visible()
 page.get_by_role('button',name='设置',exact=True).click();page.get_by_label('Base URL',exact=True).fill('http://localhost:8091/unsaved')
 page.get_by_role('button',name='关闭设置',exact=True).click();assert page.locator('#chat-confirm').evaluate('(e)=>e.open')
 page.get_by_role('button',name='放弃修改',exact=True).click()
 page.locator('#theme-toggle').click();page.screenshot(path='/tmp/chat-dark.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path='/tmp/chat-mobile.png',full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.get_by_role('button',name='打开历史对话',exact=True).click();assert page.locator('#chat-history').is_visible()
 page.get_by_role('button',name='关闭历史对话',exact=True).click()
 page.get_by_role('button',name='打开历史对话',exact=True).click()
 page.get_by_role('button',name='设置',exact=True).click();assert page.get_by_label('Base URL',exact=True).is_visible();page.screenshot(path='/tmp/chat-mobile-settings.png',full_page=True)
 page.get_by_role('button',name='完成',exact=True).click()
 page.evaluate("window.dispatchEvent(new StorageEvent('storage',{key:'homepage:e1:app:chat'}))")
 assert '另一个标签页' in page.locator('#chat-storage-error').inner_text()
 assert not site_posts,site_posts
 assert not errors,errors
 print('PASS: configuration, same-site endpoint rejected, browser-only CORS requests, fragmented UTF-8 SSE, Markdown/XSS, persistence, stop, retry, IME, export without keys, import, dirty dialog, mobile/dark, tab conflict; site POSTs:',site_posts,flush=True)
 b.close()
server.shutdown()
