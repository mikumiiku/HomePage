"""Conversation layout and streaming interaction regressions, using synthetic data only."""
import json, os, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
BASE=os.environ.get('CHAT_BASE','http://127.0.0.1:8036')
profile={'id':'p','name':'模型服务','base':'http://localhost:8093/v1','key':'','model':'glm-4.5-air','models':['glm-4.5-air'],'reasoning':'','system':'','temperature':''}
msgs=[{'id':'u','role':'user','content':'hello','time':1},{'id':'a','role':'assistant','content':'Hello! 👋 How can I assist you today? Feel free to ask any questions, share ideas, or let me know what you would like help with.','reasoning':'用户发来问候，简短回应即可。','model':'glm-4.5-air','state':'done','time':2}]
data={'v':2,'t':1,'d':{'best':{},'stats':{},'settings':{'profiles':[profile],'selected':'p'},'session':{'active':'t','threads':[{'id':'t','title':'hello','time':1,'draft':'','messages':msgs}]}}}
class Model(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def response_headers(self,typ='application/json'):
  self.send_response(200)
  for k,v in {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Content-Type':typ}.items():self.send_header(k,v)
  self.end_headers()
 def do_OPTIONS(self):self.response_headers()
 def do_POST(self):
  self.rfile.read(int(self.headers['Content-Length']));self.response_headers('text/event-stream')
  try:
   for i in range(90):
    delta={'reasoning_content':'检查布局。' if i<3 else '', 'content':('\n\n第 '+str(i)+' 段：这是用于验证滚动跟随和阅读位置的测试回复。')}
    self.wfile.write(('data: '+json.dumps({'choices':[{'delta':delta}]})+'\n\n').encode());self.wfile.flush();time.sleep(.065)
   self.wfile.write(b'data: [DONE]\n\n');self.wfile.flush()
  except (BrokenPipeError,ConnectionResetError):pass
server=ThreadingHTTPServer(('127.0.0.1',8093),Model);threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox']);ctx=b.new_context(viewport={'width':1536,'height':774},color_scheme='dark')
 ctx.add_init_script('if(!localStorage.getItem("homepage:e1:app:chat"))localStorage.setItem("homepage:e1:app:chat",'+json.dumps(json.dumps(data))+');')
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE+'/home');page.wait_for_function("document.querySelectorAll('.chat-message').length===2")
 page.wait_for_timeout(150)
 scroll=page.locator('#chat-scroll')
 assert scroll.evaluate('(e)=>e.scrollHeight<=e.clientHeight+1'),'A short exchange should not require scrolling'
 assert page.locator('#chat-compose').bounding_box()['height']<130
 assert page.locator('.chat-message.user .chat-body').bounding_box()['width']<200
 assert abs(scroll.bounding_box()['width']-page.locator('#chat-compose').bounding_box()['width'])<2
 page.screenshot(path='/tmp/chat-reviewed-desktop.png',full_page=True)
 page.evaluate("window.savedArticle=document.querySelector('[data-message=a]');window.savedBody=window.savedArticle.querySelector('.chat-body')")
 page.locator('#chat-input').fill('长回复');page.get_by_role('button',name='发送',exact=True).click()
 page.wait_for_function("document.querySelectorAll('.chat-reasoning').length===2")
 summary=page.locator('.chat-reasoning summary').last;summary.click()
 page.evaluate('window.savedSummary=document.activeElement')
 page.wait_for_timeout(250)
 assert page.locator('.chat-reasoning').last.evaluate('(e)=>e.open')
 assert page.evaluate('document.activeElement===window.savedSummary'), 'Streaming must preserve disclosure focus'
 assert page.evaluate('window.savedArticle===document.querySelector("[data-message=a]") && window.savedBody===window.savedArticle.querySelector(".chat-body")')
 page.wait_for_function("document.querySelector('#chat-scroll').scrollHeight>document.querySelector('#chat-scroll').clientHeight+200")
 scroll.evaluate('(e)=>e.scrollTop=0');page.wait_for_timeout(180)
 before=scroll.evaluate('(e)=>e.scrollTop');page.wait_for_timeout(220)
 assert abs(scroll.evaluate('(e)=>e.scrollTop')-before)<2,'Reading history must not snap to bottom'
 page.get_by_role('button',name='回到最新回复',exact=True).click()
 page.wait_for_function("document.querySelector('#chat-stop').hidden")
 page.wait_for_timeout(120)
 assert scroll.evaluate('(e)=>e.scrollHeight-e.scrollTop-e.clientHeight')<3,'Completed reply must remain in view'
 assert page.locator('#chat-jump').is_hidden()
 page.locator('#chat-input').fill('\n'.join(['长输入']*20));page.wait_for_timeout(120)
 assert page.locator('#chat-input').bounding_box()['height']<=140
 assert scroll.evaluate('(e)=>e.scrollHeight-e.scrollTop-e.clientHeight')<3
 page.locator('#chat-input').fill('');page.wait_for_timeout(80)
 for theme in ['light','dark']:
  page.evaluate('(theme)=>App.theme.set(theme)',theme)
  for w,h in [(1536,774),(1280,720),(768,900),(390,844),(320,568)]:
   page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(60)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   box=page.locator('#chat-compose').bounding_box();assert box['y']+box['height']<=h
   assert scroll.bounding_box()['height']>200
 page.screenshot(path='/tmp/chat-reviewed-mobile.png',full_page=True)
 page.get_by_role('button',name='打开历史对话',exact=True).click();page.get_by_role('button',name='设置',exact=True).click()
 page.locator('#chat-preferences summary').click()
 done=page.get_by_role('button',name='完成',exact=True).bounding_box()
 assert done['y']+done['height']<568,'Completion button must remain visible in a long settings form'
 page.locator('.chat-settings-content').evaluate('(e)=>e.scrollTop=e.scrollHeight')
 assert page.get_by_role('button',name='关闭设置',exact=True).is_visible()
 page.screenshot(path='/tmp/chat-reviewed-settings-mobile.png',full_page=True)
 page.get_by_role('button',name='完成',exact=True).click()
 page.get_by_role('button',name='关闭历史对话',exact=True).click()
 page.get_by_role('button',name='打开历史对话',exact=True).click()
 page.get_by_role('button',name='新建对话',exact=True).click()
 assert page.locator('#chat-jump').is_hidden()
 assert page.locator('#chat-status').inner_text()==''
 assert page.get_by_role('heading',name='有什么想聊的？').is_visible()
 assert not errors,errors
 print('PASS: short reply visible, aligned widths, compact input, stable message nodes, reasoning focus/open state, manual scroll retention, jump/follow to completion, input growth, themes/narrow screens, fixed settings actions, new-chat reset')
 b.close()
server.shutdown()
