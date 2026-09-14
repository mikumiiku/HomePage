#!/usr/bin/env python3
"""Viewport fit, unchanged site chrome, settings modal and actual gameplay."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE=os.environ.get('GOMOKU_BASE','http://127.0.0.1:8035')
PROD=os.environ.get('GOMOKU_CHROME_BASE','http://127.0.0.1:8023')
OUT=Path('/tmp/gomoku-controls-verification');OUT.mkdir(exist_ok=True)
errors=[]; results=[]

def measure(page):
    return page.evaluate('''() => {
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};
      return {board:rect(document.querySelector('.gm-board-frame')),stage:rect(document.querySelector('#stage')),
        info:rect(document.querySelector('.gm-players')),header:rect(document.querySelector('.site-header')),back:rect(document.querySelector('.back-link')),
        body:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},viewport:{width:innerWidth,height:innerHeight},side:document.querySelector('#stage').classList.contains('gm-side-info')};
    }''')

def fitted(page):
    page.wait_for_function("document.querySelector('.gm-board-frame').offsetWidth > 50")
    page.wait_for_timeout(100)
    m=measure(page); b=m['board']; v=m['viewport']; st=m['stage']
    assert abs(b['width']-b['height'])<1.1,m
    assert b['right']<=v['width']+.5 and b['y']>=m['back']['bottom'],m
    assert m['body']['width']<=v['width'],m
    for selector in ['#gm-black','#gm-white','#gm-status','#gm-open-settings']:
        r=page.locator(selector).bounding_box()
        assert r['y']+r['height']<=b['y'],(selector,r,b)
    if m['side']:
        expected=max(240,min(st['width']-304,st['height']-82))
        if v['height']>500:
            assert b['bottom']<=v['height']+.5,m
            assert m['body']['height']<=v['height']+1,m
    else:
        expected=min(st['width'],max(240,v['height']-24))
    assert abs(b['width']-expected)<2,m
    for selector in ['#gm-mode','#gm-new','#gm-undo']:
        target=page.locator(selector)
        assert target.is_visible()
        assert not target.evaluate('(e)=>!!e.closest("dialog")')
    for selector in ['#gm-new','#gm-undo','#gm-hint','#gm-mode','#gm-level','#gm-color']:
        if page.locator(selector).is_visible():
            assert page.locator(selector).bounding_box()['height']>=44
    return m

with sync_playwright() as p:
    browser=p.chromium.launch(args=['--no-sandbox','--disable-dev-shm-usage'])
    for width,height in [(1920,1080),(1440,900),(1280,720),(1024,768),(768,768),(768,1024),(375,812),(320,568),(844,390),(568,320)]:
        ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<900,reduced_motion='reduce')
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(PROD+'/game/gomoku')
        old=page.evaluate('''() => ['.site-header','.back-link','#theme-toggle','.brand','.site-nav'].map(s=>{let r=document.querySelector(s).getBoundingClientRect();return [s,r.x,r.y,r.width,r.height]})''')
        page.goto(BASE+'/game/gomoku')
        new=page.evaluate('''() => ['.site-header','.back-link','#theme-toggle','.brand','.site-nav'].map(s=>{let r=document.querySelector(s).getBoundingClientRect();return [s,r.x,r.y,r.width,r.height]})''')
        for a,b in zip(old,new):
            assert a[0]==b[0]
            assert all(abs(x-y)<1 for x,y in zip(a[1:],b[1:])),(width,height,a,b)
        m=fitted(page)
        assert page.locator('#gm-mode').is_visible()
        assert page.locator('#gm-open-settings').is_visible()
        page.locator('#gm-open-settings').click()
        expect(page.locator('#gm-settings-dialog')).to_be_visible()
        expect(page.locator('#gm-close-settings')).to_be_focused()
        # Fixed header remains in viewport while long settings scroll internally.
        page.locator('.gm-settings-scroll').evaluate('(e)=>e.scrollTop=e.scrollHeight')
        expect(page.locator('#gm-close-settings')).to_be_in_viewport()
        page.screenshot(path=str(OUT/f'settings-{width}x{height}.png'))
        page.keyboard.press('Escape')
        expect(page.locator('#gm-open-settings')).to_be_focused()
        after=fitted(page);assert after['board']==m['board']
        page.locator('#theme-toggle').click()
        expect(page.locator('html')).to_have_attribute('data-theme','dark')
        fitted(page)
        page.screenshot(path=str(OUT/f'board-{width}x{height}-dark.png'))
        page.locator('#theme-toggle').click()
        if (width,height) in [(1440,900),(375,812),(844,390)]:page.screenshot(path=str(OUT/f'board-{width}x{height}-light.png'))
        results.append({'viewport':[width,height],'board':m['board']['width'],'side':m['side']})
        print('PASS viewport + unchanged chrome + modal',width,height,flush=True)
        ctx.close()
    ctx=browser.new_context(viewport={'width':1280,'height':900},reduced_motion='reduce')
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+'/game/gomoku')
    page.locator('#gm-mode').select_option('local');page.locator('#gm-open-settings').click();page.locator('#gm-confirm-setting').check();page.locator('#gm-close-settings').click()
    page.locator('#gm-new').click();expect(page.locator('#gm-settings-dialog')).not_to_be_visible()
    page.locator('#gm-cell-112').click();page.locator('#gm-confirm').click()
    assert page.locator('.gm-cell.black').count()==1
    page.locator('#gm-undo').click()
    expect(page.locator('#gm-settings-dialog')).not_to_be_visible();assert page.locator('.gm-cell.black').count()==0
    page.locator('#gm-cell-112').click();page.locator('#gm-confirm').click()
    page.locator('#gm-new').click()
    expect(page.locator('#gm-dialog')).to_be_visible();page.keyboard.press('Escape')
    expect(page.locator('#gm-new')).to_be_focused();page.locator('#gm-new').click();page.locator('#gm-accept-new').click()
    expect(page.locator('#gm-settings-dialog')).not_to_be_visible()
    expect(page.locator('#gm-new')).to_be_focused()
    # Disable confirmation then dynamically resize, including orientation changes.
    page.locator('#gm-open-settings').click();page.locator('#gm-confirm-setting').uncheck();page.locator('#gm-close-settings').click()
    for w,h in [(375,812),(812,375),(1280,720),(640,450),(1920,1080)]:
        page.set_viewport_size({'width':w,'height':h});page.evaluate('scrollTo(0,0)');fitted(page)
    print('PASS direct controls, new-game confirmation, modal focus and live resizing',flush=True)
    page.goto(BASE+'/games/')
    assert not page.locator('body').evaluate('(e)=>e.classList.contains("is-gomoku")')
    expect(page.locator('.site-header')).to_be_visible();expect(page.locator('.site-footer')).to_be_visible()
    ctx.close();browser.close()
assert not errors, errors
(OUT/'report.json').write_text(json.dumps({'viewports':results,'errors':errors},ensure_ascii=False,indent=2))
print('All layout checks passed')
