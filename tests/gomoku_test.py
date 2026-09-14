#!/usr/bin/env python3
"""Real-browser Gomoku flows. Independent contexts, no production storage.
GOMOKU_BASE=http://127.0.0.1:8035 python3 tests/gomoku_test.py
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('GOMOKU_BASE', 'http://127.0.0.1:8035')
OUT = Path('/tmp/gomoku-verification')
OUT.mkdir(exist_ok=True)
KEY = 'homepage:e1:gomoku:main'
results, errors = [], []
SETTINGS = dict(mode='ai', level='normal', color='black', confirm=False, numbers=False)

def fixture(moves=None, mode='ai', human=1, result=None, settled=False, assisted=False, level='normal'):
    settings = dict(SETTINGS, mode=mode, level=level, color='black' if human == 1 else 'white')
    return dict(best=dict(streak=0), stats=dict(buckets={}), settings=settings,
                session=dict(id='fixture', settings=settings.copy(), human=human, moves=moves or [],
                             assisted=assisted, result=result, settled=settled))

def saved(page):
    return page.evaluate('(k) => JSON.parse(localStorage.getItem(k)).d', KEY)

def count(page):
    return page.locator('.gm-cell.black, .gm-cell.white').count()

def setup(browser, data=None, width=1280, mobile=False, init=None, raw=None):
    ctx = browser.new_context(viewport=dict(width=width, height=900), has_touch=mobile, is_mobile=mobile,
                              reduced_motion='reduce')
    if init:
        ctx.add_init_script(init)
    page = ctx.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
    page.goto(BASE + '/')
    if raw is not None or data is not None:
        value = raw if raw is not None else json.dumps(dict(v=1, t=1, d=data))
        page.evaluate('([k,v]) => localStorage.setItem(k,v)', [KEY, value])
    page.goto(BASE + '/game/gomoku')
    expect(page.locator('#gm-board')).to_be_visible()
    return ctx, page

def close_settings(page):
    if page.locator('#gm-settings-dialog').evaluate('(e)=>e.open'):
        page.locator('#gm-close-settings').click()

def in_settings(page, selector):
    target = page.locator(selector)
    if target.evaluate('(e)=>!!e.closest("#gm-settings-dialog")'):
        if not page.locator('#gm-settings-dialog').evaluate('(e)=>e.open'):
            page.locator('#gm-open-settings').click()
    else:
        close_settings(page)
    return target

def click(page, i):
    close_settings(page)
    page.locator(f'#gm-cell-{i}').click()

def done(name):
    results.append(name)
    print('PASS', name, flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage'])
    ctx, page = setup(browser)
    assert count(page) == 0
    assert saved(page)['settings'] == SETTINGS
    assert page.locator('.gm-cell[tabindex="0"]').count() == 1
    page.locator('#gm-cell-112').focus()
    page.keyboard.press('ArrowRight')
    page.keyboard.press('Enter')
    page.wait_for_function("document.querySelectorAll('.gm-cell.black,.gm-cell.white').length === 2")
    assert saved(page)['session']['moves'][0] == 113
    page.reload()
    assert count(page) == 2
    in_settings(page, '#gm-undo').click()
    assert count(page) == 0 and saved(page)['session']['assisted']
    done('defaults, keyboard, real Worker, reload and full-turn undo')
    in_settings(page, '#gm-hint').click()
    expect(page.locator('.gm-cell.suggested')).to_have_count(1)
    assert count(page) == 0 and saved(page)['session']['assisted']
    in_settings(page, '#gm-confirm-setting').check()
    click(page, 112)
    click(page, 113)
    assert count(page) == 0
    page.locator('#gm-confirm').click()
    page.wait_for_function("document.querySelectorAll('.gm-cell.black,.gm-cell.white').length === 2")
    assert saved(page)['session']['moves'][0] == 113
    in_settings(page, '#gm-new').click()
    expect(page.locator('#gm-dialog')).to_be_visible()
    page.keyboard.press('Escape')
    expect(page.locator('#gm-new')).to_be_focused()
    assert count(page) == 2
    in_settings(page, '#gm-new').click()
    page.locator('#gm-accept-new').click()
    assert count(page) == 0
    done('hint is non-mutating, confirmation preview and restart dialog focus')
    ctx.close()

    # Real worker opening for white, both random results, all levels.
    for level in ['easy', 'normal', 'hard']:
        f = fixture(human=2, level=level)
        ctx, page = setup(browser, f)
        page.wait_for_function("document.querySelectorAll('.gm-cell.black').length === 1")
        assert saved(page)['session']['moves'] == [112]
        assert page.locator('#gm-undo').is_disabled()
        assert page.locator('#gm-white-name').inner_text() == '你'
        in_settings(page, '#gm-color').select_option('random')
        page.evaluate('Math.random = () => 0.25')
        in_settings(page, '#gm-new').click(); page.locator('#gm-accept-new').click()
        assert saved(page)['session']['human'] == 1
        page.evaluate('Math.random = () => 0.75')
        in_settings(page, '#gm-new').click()
        page.wait_for_function("document.querySelectorAll('.gm-cell.black').length === 1")
        assert saved(page)['session']['human'] == 2
        ctx.close()
    done('all difficulty settings, white opening and both random colors')

    # A maliciously late worker result simulates dispatch after termination.
    delayed = '''window.Worker = class {
      constructor(){window.gmWorkers=(window.gmWorkers||[]);window.gmWorkers.push(this)}
      postMessage(r){this.r=r} terminate(){this.terminated=true}
    }'''
    ctx, page = setup(browser, init=delayed)
    click(page,112)
    expect(page.locator('#gm-status')).to_contain_text('思考')
    in_settings(page, '#gm-undo').click()
    page.evaluate("() => {const w=window.gmWorkers[0];w.onmessage({data:{game:w.r.game,request:w.r.request,move:113}})}")
    assert count(page)==0
    click(page,112)
    in_settings(page, '#gm-new').click(); page.locator('#gm-accept-new').click()
    page.evaluate("() => {const w=window.gmWorkers[1];w.onmessage({data:{game:w.r.game,request:w.r.request,move:113}})}")
    assert count(page)==0
    click(page,112)
    page.reload()
    assert count(page)==1
    page.evaluate("() => {const w=window.gmWorkers[0];w.onmessage({data:{game:w.r.game,request:w.r.request,move:113}})}")
    assert count(page)==2
    done('late worker result after undo/restart ignored; pending AI restored on refresh')
    ctx.close()

    near_win=[0,30,1,31,2,32,3,33]
    ctx, page = setup(browser, fixture(near_win,mode='local'))
    click(page,4)
    expect(page.locator('#gm-status')).to_have_text('黑棋获胜')
    expect(page.locator('.gm-line')).to_be_visible()
    assert page.locator('#gm-win-line').evaluate("e => !e.hasAttribute('hidden') && getComputedStyle(e).display !== 'none' && parseFloat(getComputedStyle(e).strokeWidth) > 0")
    assert saved(page)['stats']['buckets']['local']['wins']==1
    assert page.locator('#gm-undo').is_disabled()
    click(page,5); assert count(page)==9
    for _ in range(2): page.reload()
    assert saved(page)['stats']['buckets']['local']['wins']==1
    in_settings(page, '#gm-review').click()
    page.locator('[data-review="first"]').click(); assert count(page)==0
    page.locator('[data-review="next"]').click(); assert count(page)==1
    page.locator('[data-review="last"]').click(); assert count(page)==9
    page.locator('[data-review="prev"]').click(); assert count(page)==8
    page.locator('[data-review="exit"]').click(); assert count(page)==9
    assert saved(page)['session']['moves']==near_win+[4]
    in_settings(page, '#gm-numbers').check()
    assert page.locator('#gm-cell-4 .gm-stone').inner_text()=='9'
    close_settings(page)
    page.screenshot(path=str(OUT/'desktop-win-light.png'), full_page=True)
    close_settings(page)
    page.locator('#theme-toggle').click()
    expect(page.locator('html')).to_have_attribute('data-theme','dark')
    page.screenshot(path=str(OUT/'desktop-win-dark.png'), full_page=True)
    done('local win, visible winning line, immutable review, numbers and one-time settlement')
    ctx.close()

    ctx, page = setup(browser, fixture(near_win,mode='local'))
    in_settings(page, '#gm-undo').click(); assert count(page)==7
    click(page,33); click(page,4)
    assert saved(page)['stats']['buckets']['local']['assisted']==1
    assert saved(page)['stats']['buckets']['local']['wins']==0
    done('local undo is one move and assisted games counted separately')
    ctx.close()

    # Complete actual player move, then restore ended games for both result perspectives.
    ctx,page=setup(browser,fixture(near_win))
    click(page,4)
    assert saved(page)['best']['streak']==1
    assert saved(page)['stats']['buckets']['ai:normal']['wins']==1
    done('unassisted human win updates best streak')
    ctx.close()
    for result, human, field in [(1,2,'losses'),(0,1,'draws')]:
        if result==0:
            b=[i for i in range(225) if (i%15+2*(i//15))%4<2]
            w=[i for i in range(225) if (i%15+2*(i//15))%4>=2]
            moves=[v for n,k in enumerate(b) for v in ([k,w[n]] if n<len(w) else [k])]
        else: moves=near_win+[4]
        ctx,page=setup(browser,fixture(moves,human=human,result=result))
        assert saved(page)['stats']['buckets']['ai:normal'][field]==1
        assert saved(page)['session']['settled']
        ctx.close()
    done('restored loss and full-board draw settled correctly')

    ctx,page=setup(browser,fixture(mode='local'))
    second=ctx.new_page(); second.goto(BASE+'/game/gomoku')
    click(page,112)
    expect(second.locator('#gm-reload')).to_be_visible()
    click(second,113); assert count(second)==0
    second.locator('#gm-reload').click(); assert count(second)==1
    click(second,113)
    expect(page.locator('#gm-reload')).to_be_visible()
    assert saved(page)['session']['moves']==[112,113]
    done('cross-tab conflict freezes writes and reload resumes shared state')
    ctx.close()

    for bad in ['{bad-json', json.dumps(dict(v=99,t=1,d=fixture())),
                json.dumps(dict(v=1,t=1,d=fixture([112,112])))]:
        ctx,page=setup(browser,raw=bad,init='window.Worker = class { constructor(){throw new Error("unavailable")} }')
        expect(page.locator('#gm-export')).to_be_visible()
        with page.expect_download() as download:
            page.locator('#gm-export').click()
        assert Path(download.value.path()).read_text()==bad
        click(page,112)
        page.wait_for_function("document.querySelectorAll('.gm-cell.black,.gm-cell.white').length === 2")
        assert page.evaluate('(k)=>localStorage.getItem(k)',KEY)==bad
        ctx.close()
    done('corrupt/future/illegal saves preserved and exported; temporary game works')

    ctx,page=setup(browser,init='window.Worker = class { constructor(){throw new Error("unavailable")} }')
    click(page,112)
    page.wait_for_function("document.querySelectorAll('.gm-cell.black,.gm-cell.white').length === 2")
    expect(page.locator('#gm-notice')).to_contain_text('快速搜索')
    done('Worker construction failure falls back and completes the turn')
    ctx.close()

    ctx,page=setup(browser,fixture(mode='local'))
    page.evaluate("() => { Storage.prototype.setItem = function(){throw new DOMException('full','QuotaExceededError')}; }")
    click(page,112); assert count(page)==1
    expect(page.locator('#gm-notice')).to_contain_text('无法保存')
    done('quota failure keeps live game and displays persistence error')
    ctx.close()
    ctx,page=setup(browser,init="Storage.prototype.setItem = function(){throw new DOMException('denied','SecurityError')}")
    expect(page.locator('#gm-notice')).to_contain_text('未开放本地存储')
    click(page,112)
    page.wait_for_function("document.querySelectorAll('.gm-cell.black,.gm-cell.white').length === 2")
    done('disabled storage supports an in-memory game')
    ctx.close()

    for width in [320,375,768]:
        ctx,page=setup(browser,fixture(mode='local'),width=width,mobile=True)
        box=page.locator('#gm-cell-112').bounding_box()
        page.touchscreen.tap(box['x']+box['width']/2,box['y']+box['height']/2)
        assert count(page)==1
        # Real CDP touch scroll through the board must cancel the pointer gesture.
        cdp=ctx.new_cdp_session(page)
        box=page.locator('#gm-cell-100').bounding_box()
        x,y=box['x']+box['width']/2,box['y']+box['height']/2
        cdp.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(x=x,y=y)]))
        cdp.send('Input.dispatchTouchEvent',dict(type='touchMove',touchPoints=[dict(x=x,y=y-70)]))
        cdp.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
        assert count(page)==1
        in_settings(page, '#gm-confirm-setting').check()
        close_settings(page)
        page.locator('#gm-cell-113').scroll_into_view_if_needed()
        box=page.locator('#gm-cell-113').bounding_box()
        page.touchscreen.tap(box['x']+box['width']/2,box['y']+box['height']/2)
        assert count(page)==1
        page.locator('#gm-confirm').click(); assert count(page)==2
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow {width}'
        page.screenshot(path=str(OUT/f'mobile-{width}-light.png'),full_page=True)
        close_settings(page)
        page.locator('#theme-toggle').click()
        page.screenshot(path=str(OUT/f'mobile-{width}-dark.png'),full_page=True)
        ctx.close()
    done('320/375/768 touch, real scroll cancellation, confirmation and both themes')

    ctx,page=setup(browser,fixture(mode='local'))
    page.evaluate('''() => {
      const c=document.querySelector('#gm-cell-112'),r=c.getBoundingClientRect();
      const props={bubbles:true,pointerType:'touch',isPrimary:true,button:0,clientX:r.x+r.width/2,clientY:r.y+r.height/2};
      c.dispatchEvent(new PointerEvent('pointerdown',{...props,pointerId:1}));
      c.dispatchEvent(new PointerEvent('pointerdown',{...props,pointerId:2,isPrimary:false}));
      c.dispatchEvent(new PointerEvent('pointerup',{...props,pointerId:2,isPrimary:false}));
      c.dispatchEvent(new PointerEvent('pointerup',{...props,pointerId:1}));
      c.dispatchEvent(new PointerEvent('pointerdown',{...props,pointerId:3}));
      c.dispatchEvent(new PointerEvent('pointercancel',{...props,pointerId:3}));
      c.dispatchEvent(new PointerEvent('pointerup',{...props,pointerId:3}));
    }''')
    assert count(page)==0
    in_settings(page, '#gm-mode').click(); page.keyboard.press('Escape')
    assert page.locator('#gm-mode').is_visible()
    done('multi-touch and pointer cancellation do not place stones; native select opens')
    for path in ['/', '/games/', '/game/2048', '/about']:
        response=page.goto(BASE+path)
        assert response.status==200
        assert not page.locator('script[src*="gomoku"]').count()
        if path=='/games/':
            expect(page.locator('a.placard[href="/game/gomoku"]')).to_be_visible()
            page.screenshot(path=str(OUT/'games-list.png'),full_page=True)
    done('home, catalog, existing game and about routes regressions')
    ctx.close()
    browser.close()

assert not errors, errors
(OUT/'report.json').write_text(json.dumps(dict(passed=results,errors=errors),ensure_ascii=False,indent=2))
print(f'{len(results)} browser scenarios passed; evidence: {OUT}')
