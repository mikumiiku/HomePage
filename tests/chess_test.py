"""International chess browser regressions. Only isolated browser contexts are used."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('CHESS_BASE','http://127.0.0.1:8043')
OUT=Path('/tmp/chess-verification');OUT.mkdir(exist_ok=True)
KEY='homepage:e1:chess:main'
errors=[]
def fixture(moves=None,mode='local',color='w'):
 s=dict(mode=mode,level='normal',color=color)
 return dict(v=1,t=1,d=dict(best=dict(wins=0),stats=dict(games=0,wins=0,draws=0),settings=s,session=dict(settings=s,moves=moves or [],result=None,settled=False)))
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000})
 page=ctx.new_page();page.on('pageerror',lambda e: errors.append(str(e)))
 def seed(value):
  page.goto(BASE+'/game/chess');page.evaluate('([key,value])=>localStorage.setItem(key,value)',[KEY,json.dumps(value) if not isinstance(value,str) else value]);page.reload()
 def sq(s):return page.locator('[data-square="'+s+'"]')
 def move(a,b):sq(a).click();sq(b).click()
 def saved():return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).d',KEY)
 page.goto(BASE+'/games/');expect(page.locator('a[href="/game/chess"]')).to_be_visible();page.goto(BASE+'/game/chess')
 expect(page.locator('.chess-cell')).to_have_count(64);expect(page.locator('#chess-board img')).to_have_count(32)
 assert page.evaluate('Array.from(document.querySelectorAll("#chess-board img")).every(i=>i.complete&&i.naturalWidth>0)')
 page.screenshot(path=str(OUT/'desktop-light.png'),full_page=True)
 sq('e2').click();expect(sq('e4')).to_have_class(__import__('re').compile('possible'));sq('e5').click();assert page.locator('#chess-history button').count()==0
 move('e2','e4');page.wait_for_function('document.querySelectorAll("#chess-history button").length===2');assert len(saved()['session']['moves'])==2
 page.reload();expect(page.locator('#chess-history button')).to_have_count(2);page.locator('#chess-undo').click();expect(page.locator('#chess-history button')).to_have_count(0)
 # Keyboard selection and movement.
 sq('e2').focus();page.keyboard.press('Enter');page.keyboard.press('ArrowUp');page.keyboard.press('Enter');page.wait_for_function('document.querySelectorAll("#chess-history button").length===2')
 page.locator('#chess-history button').first.click();expect(page.locator('#chess-status')).to_contain_text('查看');page.locator('#chess-live').click()
 # Cancel confirmation and ensure game survives.
 page.locator('#chess-new').click();expect(page.locator('#chess-confirm')).to_be_visible();page.keyboard.press('Escape');expect(page.locator('#chess-history button')).to_have_count(2)
 with page.expect_download() as download:page.locator('#chess-export').click()
 assert download.value.suggested_filename.endswith('.pgn')
 # Local castling.
 seed(fixture(['e4','e5','Nf3','Nc6','Bc4','Nf6']));move('e1','g1');expect(sq('g1')).to_have_attribute('aria-label','g1 白方王');expect(sq('f1')).to_have_attribute('aria-label','f1 白方车')
 seed(fixture(['e4','a6','e5','d5']));move('e5','d6');expect(sq('d5')).to_have_attribute('aria-label','d5 空格')
 # Legal promotion reached from starting position.
 promotion=['a4','h5','a5','h4','a6','h3','axb7','hxg2']
 seed(fixture(promotion));move('b7','a8');expect(page.locator('#chess-promotion')).to_be_visible();page.screenshot(path=str(OUT/'promotion.png'))
 page.keyboard.press('Escape');assert len(saved()['session']['moves'])==8
 sq('a8').click();page.locator('#chess-promotion-options button').last.click();expect(sq('a8')).to_have_attribute('aria-label','a8 白方马');page.reload();expect(sq('a8')).to_have_attribute('aria-label','a8 白方马')
 # Checkmate and single settlement.
 seed(fixture(['f3','e5','g4']));move('d8','h4');expect(page.locator('#chess-status')).to_have_text('黑方获胜');assert saved()['stats']['games']==1
 page.reload();assert saved()['stats']['games']==1;expect(page.locator('#chess-undo')).to_be_disabled()
 seed(fixture(['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1']));move('f6','g8');expect(page.locator('#chess-status')).to_have_text('本局和棋')
 # Resign, then black-side computer opening.
 seed(fixture());page.locator('#chess-resign').click();page.locator('#chess-accept').click();expect(page.locator('#chess-status')).to_have_text('黑方获胜');page.reload();expect(page.locator('#chess-status')).to_have_text('黑方获胜')
 seed(fixture(mode='ai',color='b'));page.wait_for_function('document.querySelectorAll("#chess-history button").length===1');assert page.locator('.chess-cell').first.get_attribute('data-square')=='h1'
 # Storage conflict prevents writes.
 other=ctx.new_page();other.goto(BASE+'/game/chess');other.evaluate('(key)=>{const d=JSON.parse(localStorage.getItem(key));d.t++;localStorage.setItem(key,JSON.stringify(d));}',KEY)
 expect(page.locator('#chess-reload')).to_be_visible();expect(page.locator('#chess-new')).to_be_disabled();page.locator('#chess-reload').click();expect(page.locator('#chess-new')).to_be_enabled();other.close()
 for bad in ['{bad-json',dict(v=99,t=1,d=fixture()['d'])]:
  seed(bad);expect(page.locator('#chess-backup')).to_be_visible();original=page.evaluate('(key)=>localStorage.getItem(key)',KEY);move('e2','e4');page.wait_for_function('document.querySelectorAll("#chess-history button").length===2');assert page.evaluate('(key)=>localStorage.getItem(key)',KEY)==original
 # Responsive layouts, dark and reduced motion. Also inspect the sibling board.
 seed(fixture())
 for width,height in [(1440,1000),(1024,768),(768,1024),(390,844),(320,740),(844,390)]:
  page.set_viewport_size(dict(width=width,height=height));assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(width,height)
  box=page.locator('#chess-board').bounding_box();assert abs(box['width']-box['height'])<2
  if width==390:
   page.screenshot(path=str(OUT/'mobile-light.png'),full_page=True);page.evaluate("App.theme.set('dark')");page.screenshot(path=str(OUT/'mobile-dark.png'),full_page=True);page.evaluate("App.theme.set('light')")
 page.set_viewport_size(dict(width=1440,height=1000));page.evaluate("App.theme.set('dark')");page.screenshot(path=str(OUT/'desktop-dark.png'),full_page=True)
 page.emulate_media(reduced_motion='reduce');assert page.locator('#chess-board img').first.evaluate('(el)=>getComputedStyle(el).transitionDuration')=='0s'
 page.locator('#chess-mode').click();page.screenshot(path=str(OUT/'select-open.png'));page.keyboard.press('Escape')
 page.goto(BASE+'/game/go');page.screenshot(path=str(OUT/'sibling-go.png'))
 assert not errors,errors
 browser.close()
print('PASS: entry, assets, AI, illegal moves, keyboard, restore, undo, review, export, confirmation, castling, en passant, promotion, mate, draw, resign, black side, conflict, corrupt/future saves, 6 viewports, themes, reduced motion; no browser errors')
