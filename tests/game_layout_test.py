"""Shared game viewport and control hierarchy regression; isolated browser storage."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE = os.environ.get('GAME_BASE', 'http://127.0.0.1:8034')
OUT = Path('/tmp/game-layout-verification'); OUT.mkdir(exist_ok=True)
GAMES = ['chess', 'gomoku', 'go', '2048', 'snake', 'squek', 'memory', 'minesweeper', 'tetris', 'swipe']
errors, results = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    context = browser.new_context(device_scale_factor=0.5)
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: print(m.text,flush=True) if m.type=='error' else None)
    def geometry(game, width, height):
        value = page.evaluate('''() => {
          const b = document.querySelector('.gm-board-frame,.go-board-frame,.chess-frame,.board2048,.mine-grid,.mem-grid,.tetris-wrap,.swipe-tile,.fps-viewport,.canvas-frame');
          const r = b.getBoundingClientRect();
          return {x:r.x,y:r.y,w:r.width,h:r.height,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight};
        }''')
        assert value['sw'] <= width and value['sh'] <= height, (game, width, height, value)
        assert value['w'] > 60 and value['h'] > 60, (game, value)
        assert value['x'] >= -1 and value['y'] >= -1 and value['x'] + value['w'] <= width + 1 and value['y'] + value['h'] <= height + 1, (game, width, height, value)
        if game in ['chess','gomoku','go','2048','squek','memory','minesweeper','swipe']:
            assert abs(value['x'] + value['w']/2 - width/2) <= 2, (game, value)
        results.append(dict(game=game, viewport=[width,height], geometry=value))
    for width,height in [(1440,900),(390,844),(844,390),(320,568)]:
        page.set_viewport_size(dict(width=width,height=height))
        for game in GAMES:
            page.goto(BASE+'/game/'+game, wait_until='domcontentloaded')
            print(game,width,height,flush=True)
            page.wait_for_selector('.gm-board-frame,.go-board-frame,.chess-frame,.board2048,.mine-grid,.mem-grid,.tetris-wrap,.swipe-tile,.fps-viewport,.canvas-frame', state='attached')
            page.wait_for_timeout(250)
            if game in ['memory','minesweeper']:
                page.locator('.overlay .choices button').first.click()
            elif game in ['snake','squek','tetris','swipe']:
                page.locator('.overlay .choices button').first.click()
            page.wait_for_timeout(150)
            geometry(game,width,height)
            if game != 'sandstrike':
                trigger = page.locator('#gm-open-settings,#go-open-settings,button[aria-controls="game-settings"]')
                trigger.click()
                dialog = page.locator('dialog[open]')
                expect(dialog).to_be_visible()
                assert dialog.bounding_box()['height'] <= height
                if game in ['chess','gomoku','go']:
                    expect(dialog.locator('select').first).to_be_visible()
                page.keyboard.press('Escape')
                expect(dialog).to_have_count(0)
                expect(trigger).to_be_focused()
            if width == 390 or (width == 844 and game in ['go','chess','tetris']):
                page.screenshot(path=str(OUT/f'{game}-{width}.png'))
    # Real chess play, undo, settings changes, history navigation and keyboard focus.
    page.set_viewport_size(dict(width=390,height=844));page.goto(BASE+'/game/chess')
    page.locator('[data-square="e2"]').click();page.locator('[data-square="e4"]').click()
    page.wait_for_function('document.querySelectorAll("#chess-history button").length===2')
    page.locator('#chess-undo').click();expect(page.locator('#chess-history button')).to_have_count(0)
    page.locator('button[aria-controls="game-settings"]').click()
    page.locator('#chess-mode').select_option('local');page.locator('#chess-new').click()
    if page.locator('#chess-confirm').is_visible(): page.locator('#chess-accept').click()
    page.locator('[data-square="e2"]').focus();page.keyboard.press('Enter');page.keyboard.press('ArrowUp');page.keyboard.press('Enter')
    expect(page.locator('#chess-history button')).to_have_count(1)
    page.locator('button[aria-controls="game-settings"]').click();page.locator('#chess-history button').click()
    expect(page.locator('#chess-live')).to_be_visible();page.locator('#chess-live').click()
    for game,prefix in [('gomoku','gm'),('go','go')]:
        page.goto(BASE+'/game/'+game)
        page.locator(f'#{prefix}-open-settings').click()
        page.locator(f'#{prefix}-mode').select_option('local')
        page.locator(f'#{prefix}-new').click()
        accept=page.locator(f'#{prefix}-accept-new' if game=='go' else '#gm-accept-new')
        if accept.count() and accept.is_visible():accept.click()
        if page.locator('dialog[open]').count():page.keyboard.press('Escape')
        page.locator(f'.{prefix}-cell').nth(40).click()
        expect(page.locator(f'.{prefix}-cell.black')).to_have_count(1)
        page.locator(f'#{prefix}-undo').click();expect(page.locator(f'.{prefix}-cell.black')).to_have_count(0)
    # Temporary Go controls must also fit after selecting a point or scoring.
    page.goto(BASE+'/game/go');page.locator('#go-open-settings').click()
    page.locator('#go-mode').select_option('local');page.locator('#go-confirm-setting').select_option('always')
    page.locator('#go-new').click()
    if page.locator('#go-accept-new').is_visible():page.locator('#go-accept-new').click()
    page.locator('.go-cell').nth(40).click();expect(page.locator('#go-confirm')).to_be_visible()
    page.wait_for_timeout(150);geometry('go',390,844)
    page.locator('#go-confirm').click();page.locator('#go-pass').click();page.locator('#go-pass').click()
    expect(page.locator('#go-scoring')).to_be_visible();page.wait_for_timeout(150);geometry('go',390,844)
    page.goto(BASE+'/game/snake');page.locator('.overlay button').click()
    page.locator('button[aria-controls="game-settings"]').click()
    assert page.evaluate('App.gamePaused()')
    page.keyboard.press('Escape');assert not page.evaluate('App.gamePaused()')
    page.locator('button[aria-label="暂停游戏"]').click();assert page.evaluate('App.gamePaused()')
    page.locator('button[aria-label="继续游戏"]').click();assert not page.evaluate('App.gamePaused()')
    # Resize an active game and switch theme, keeping the same board/state.
    page.goto(BASE+'/game/go');page.evaluate("App.theme.set('dark')")
    page.set_viewport_size(dict(width=844,height=390));page.wait_for_timeout(200)
    geometry('go',844,390);page.screenshot(path=str(OUT/'go-dark-landscape.png'))
    # WebGL uses a fresh browser and resizes one scene, avoiding GPU resource
    # retention from repeatedly navigating a software-rendered scene on CI.
    browser.close()
    browser = p.chromium.launch(args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport=dict(width=850,height=720), device_scale_factor=0.5)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE+'/game/sandstrike')
    page.wait_for_selector('.fps-viewport', timeout=45000)
    for width,height in [(1440,900),(390,844),(844,390),(320,568)]:
        page.set_viewport_size(dict(width=width,height=height));page.wait_for_timeout(250)
        geometry('sandstrike',width,height)
        page.screenshot(path=str(OUT/f'sandstrike-{width}.png'))
    assert not errors, errors
    (OUT/'report.json').write_text(json.dumps(dict(cases=results,errors=errors),ensure_ascii=False,indent=2))
    browser.close()
print(f'PASS: {len(results)} viewport cases; settings, focus, pause, chess moves and undo, theme/rotation')
