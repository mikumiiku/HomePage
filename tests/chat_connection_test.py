"""Connect, select model/effort, migrate old data, and reject stale connection results."""
import json, os, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
BASE=os.environ.get('CHAT_BASE','http://127.0.0.1:8036')
chat_requests=[]
class Service(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def reply(self,value,status=200):
  self.send_response(status)
  for k,v in {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Content-Type':'application/json'}.items():self.send_header(k,v)
  self.end_headers()
  try:self.wfile.write(json.dumps(value).encode())
  except (BrokenPipeError,ConnectionResetError):pass
 def do_OPTIONS(self):self.reply({})
 def do_GET(self):
  if self.headers.get('Authorization')=='Bearer bad':self.reply({},401);return
  if '/slow/' in self.path:time.sleep(1.5)
  if '/empty/' in self.path:self.reply({'data':[]});return
  if '/malformed/' in self.path:self.reply({'models':[]});return
  self.reply({'data':[{'id':'z-model'},{'id':'a-model'},{'id':'a-model'},None,{'id':''}, {'id':'long-model-'+'x'*140}]})
 def do_POST(self):
  body=json.loads(self.rfile.read(int(self.headers['Content-Length'])));chat_requests.append(body)
  self.reply({'choices':[{'message':{'content':'测试完成'}}]})
server=ThreadingHTTPServer(('127.0.0.1',8092),Service)
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox']);ctx=b.new_context(viewport={'width':1365,'height':900},color_scheme='dark')
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE+'/home')
 assert page.get_by_label('思考等级',exact=True).is_disabled()
 page.get_by_label('模型',exact=True).select_option('__connect__')
 page.get_by_label('Base URL',exact=True).fill('http://localhost:8092/v1')
 page.get_by_label('API Key',exact=True).fill('secret')
 page.get_by_role('button',name='连接',exact=True).click()
 page.wait_for_function("document.querySelector('#chat-model-status').textContent.includes('连接成功')")
 assert page.locator('#chat-profile-select optgroup option').count()==3
 assert page.locator('#chat-model-status').inner_text()=='连接成功 · 3 个模型'
 assert page.get_by_label('API Key',exact=True).get_attribute('type')=='password'
 page.screenshot(path='/tmp/chat-settings-connected.png',full_page=True)
 page.get_by_role('button',name='完成',exact=True).click()
 assert page.locator('#chat-profile-select option:checked').inner_text()=='a-model'
 options=page.locator('#chat-profile-select optgroup option').evaluate_all('(nodes)=>nodes.map(n=>({label:n.textContent,value:n.value}))')
 page.get_by_label('模型',exact=True).select_option(next(o['value'] for o in options if o['label']=='z-model'))
 for effort in ['low','medium','high','xhigh','max','']:
  page.get_by_label('思考等级',exact=True).select_option(effort)
  page.locator('#chat-input').fill('effort '+(effort or 'default'))
  page.get_by_role('button',name='发送',exact=True).click()
  page.wait_for_function("document.querySelector('#chat-stop').hidden")
  assert chat_requests[-1]['model']=='z-model'
  assert chat_requests[-1].get('reasoning_effort','')==effort
  if not effort:assert 'reasoning_effort' not in chat_requests[-1]
 page.get_by_label('思考等级',exact=True).select_option('high');page.reload()
 assert page.get_by_label('思考等级',exact=True).input_value()=='high'
 assert page.locator('#chat-profile-select option:checked').inner_text()=='z-model'
 page.get_by_role('button',name='设置',exact=True).click()
 original=page.evaluate("localStorage.getItem('homepage:e1:app:chat')")
 page.get_by_label('API Key',exact=True).fill('bad');page.get_by_role('button',name='重新连接',exact=True).click()
 page.wait_for_function("!document.querySelector('#chat-config-error').hidden")
 assert '密钥无效' in page.locator('#chat-config-error').inner_text()
 assert page.evaluate("localStorage.getItem('homepage:e1:app:chat')")==original
 page.get_by_label('API Key',exact=True).fill('secret')
 for route,expected in [('empty','没有返回可用模型'),('malformed','有效的模型列表')]:
  page.get_by_label('Base URL',exact=True).fill('http://localhost:8092/'+route)
  page.get_by_role('button',name='重新连接',exact=True).click()
  page.wait_for_function("!document.querySelector('#chat-config-error').hidden")
  assert expected in page.locator('#chat-config-error').inner_text()
  assert page.evaluate("localStorage.getItem('homepage:e1:app:chat')")==original
 page.get_by_label('Base URL',exact=True).fill('http://localhost:8092/slow')
 page.get_by_role('button',name='重新连接',exact=True).click()
 page.get_by_label('API Key',exact=True).fill('changed-during-request')
 page.wait_for_timeout(1800)
 assert page.evaluate("localStorage.getItem('homepage:e1:app:chat')")==original
 assert not page.locator('#chat-connect').is_disabled()
 page.evaluate("window.connectionTestTimer=window.setTimeout;window.setTimeout=(fn,ms,...args)=>window.connectionTestTimer(fn,ms===20000?80:ms,...args)")
 page.get_by_role('button',name='连接',exact=True).click()
 page.wait_for_function("document.querySelector('#chat-config-error').textContent.includes('超过 20 秒')")
 assert page.evaluate("localStorage.getItem('homepage:e1:app:chat')")==original
 page.evaluate('window.setTimeout=window.connectionTestTimer')
 page.get_by_role('button',name='关闭设置',exact=True).click();page.get_by_role('button',name='放弃修改',exact=True).click()
 page.get_by_role('button',name='设置',exact=True).click()
 page.locator('#chat-preferences summary').click();page.get_by_label('连接名称（可选）',exact=True).fill('我的模型服务')
 page.get_by_role('button',name='保存设置',exact=True).click()
 assert page.locator('#chat-config-select option:checked').inner_text()=='我的模型服务'
 page.get_by_role('button',name='完成',exact=True).click()
 # A second service owns its own model group even when IDs are identical.
 page.get_by_role('button',name='设置',exact=True).click();page.get_by_role('button',name='添加连接',exact=True).click()
 page.get_by_label('Base URL',exact=True).fill('http://localhost:8092/v2');page.get_by_label('API Key',exact=True).fill('second-secret')
 page.get_by_role('button',name='连接',exact=True).click()
 page.wait_for_function("document.querySelector('#chat-model-status').textContent.includes('连接成功')")
 assert page.locator('#chat-profile-select optgroup').count()==2
 page.get_by_role('button',name='删除连接',exact=True).click()
 page.locator('#chat-confirm-yes').click()
 assert page.locator('#chat-profile-select optgroup').count()==1
 assert page.get_by_label('API Key',exact=True).input_value()=='secret'
 page.get_by_role('button',name='完成',exact=True).click()
 long_option=next(o['value'] for o in options if o['label'].startswith('long-model'))
 page.get_by_label('模型',exact=True).select_option(long_option)
 for theme in ['light','dark']:
  page.evaluate('(theme)=>App.theme.set(theme)',theme)
  for width,height in [(320,740),(390,844),(768,900),(1365,900)]:
   page.set_viewport_size({'width':width,'height':height})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   for sel in ['#chat-profile-select','#chat-effort-select','#chat-send']:
    box=page.locator(sel).bounding_box();assert box['x']>=0 and box['x']+box['width']<=width
 page.set_viewport_size({'width':390,'height':844})
 page.get_by_role('button',name='打开历史对话',exact=True).click();page.get_by_role('button',name='设置',exact=True).click()
 assert page.get_by_label('Base URL',exact=True).is_visible()
 page.screenshot(path='/tmp/chat-settings-mobile-v2.png',full_page=True)
 page.get_by_role('button',name='完成',exact=True).click();page.get_by_role('button',name='关闭历史对话',exact=True).click()
 page.screenshot(path='/tmp/chat-picker-mobile.png',full_page=True)
 # Explicit v1 migration: preserve key, thread, selected model, and custom fields.
 old={'v':1,'t':1,'d':{'best':{},'stats':{},'settings':{'selected':'old','profiles':[{'id':'old','name':'旧连接','base':'http://localhost:8092/v1','key':'old-secret','model':'legacy-model','system':'','temperature':'','custom':'keep'}]},'session':{'active':'thread','threads':[{'id':'thread','title':'旧对话','time':1,'draft':'旧草稿','messages':[]}]}}}
 migration=b.new_context();mp=migration.new_page()
 mp.add_init_script('localStorage.setItem("homepage:e1:app:chat",'+json.dumps(json.dumps(old))+')');mp.goto(BASE+'/home')
 assert mp.locator('#chat-profile-select option:checked').inner_text()=='legacy-model'
 assert mp.locator('#chat-input').input_value()=='旧草稿'
 mp.get_by_label('思考等级',exact=True).select_option('max')
 saved=mp.evaluate('JSON.parse(localStorage.getItem("homepage:e1:app:chat"))')
 assert saved['v']==2 and saved['d']['settings']['profiles'][0]['custom']=='keep'
 assert saved['d']['settings']['profiles'][0]['key']=='old-secret'
 assert saved['d']['settings']['profiles'][0]['models']==['legacy-model']
 assert not errors,errors
 print('PASS: connect/autopopulate/dedup, all five reasoning levels + default, model selection/persistence, invalid key/empty/malformed responses, cancel stale connection, preferences, long model names, light/dark/mobile, v1 migration')
 b.close()
server.shutdown()
