"""Authentic production RAF + mouse/keyboard regressions, with/without Pointer Lock."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('SANDSTRIKE_BASE','http://127.0.0.1:8034')
with sync_playwright() as p:
    browser=p.chromium.launch(args=['--no-sandbox','--enable-unsafe-swiftshader'])
    for fallback in ([False] if os.environ.get('SANDSTRIKE_INPUT_MODE')=='locked' else [True] if os.environ.get('SANDSTRIKE_INPUT_MODE')=='fallback' else [True,False]):
        context=browser.new_context(viewport={'width':850,'height':800})
        if fallback: context.add_init_script('HTMLCanvasElement.prototype.requestPointerLock=undefined;')
        page=context.new_page(); errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/game/sandstrike'); page.get_by_role('button',name='开始训练').wait_for()
        page.wait_for_load_state('networkidle')
        assert page.locator('.fps-viewport .overlay .fps-primary').count()==1
        page.locator('.fps-primary').select_option('sniper');page.locator('.fps-canvas').scroll_into_view_if_needed();page.get_by_role('button',name='开始训练').click()
        print('Started '+('fallback' if fallback else 'lock mode'),flush=True)
        if not fallback: assert page.evaluate('document.pointerLockElement === document.querySelector(".fps-canvas")'),'Pointer lock was not acquired'
        canvas=page.locator('.fps-canvas');r=canvas.bounding_box()
        x,y=r['x']+r['width']/2,r['y']+r['height']/2
        page.mouse.click(x,y,button='right')
        page.wait_for_function('!document.querySelector(".fps-scope").hidden')
        page.wait_for_timeout(180)
        assert page.locator('.fps-scope').is_visible(), 'Right release must preserve scope'
        page.mouse.click(x,y)
        page.wait_for_function('document.querySelector(".fps-ammo").textContent === "4"')
        page.wait_for_function('!document.querySelector(".fps-scope").hidden')
        page.mouse.click(x,y)
        page.wait_for_function('document.querySelector(".fps-ammo").textContent === "3"')
        print('Scoped shots passed',flush=True)
        page.keyboard.press('2');page.keyboard.press('Space')
        page.wait_for_function('document.querySelector(".fps-ammo").textContent === "11"')
        page.wait_for_timeout(400)
        assert page.locator('.fps-ammo').inner_text()=='11','Semiauto must not fire twice per press'
        page.keyboard.press('c');page.wait_for_function('document.querySelector(".fps-posture").textContent === "蹲伏"')
        assert page.evaluate('''()=>{const e=new KeyboardEvent('keydown',{code:'KeyW',ctrlKey:true,bubbles:true,cancelable:true});document.querySelector('.fps-canvas').dispatchEvent(e);return e.defaultPrevented;}''')
        page.keyboard.press('Escape');page.get_by_role('button',name='继续游戏').wait_for()
        page.locator('.fps-primary').select_option('rifle');page.get_by_role('button',name='继续游戏').click()
        for _ in range(3):
            before=int(page.locator('.fps-ammo').inner_text())
            page.mouse.click(x,y)
            page.wait_for_function(f'Number(document.querySelector(".fps-ammo").textContent) < {before}')
            page.wait_for_timeout(180)
        before=int(page.locator('.fps-ammo').inner_text());page.mouse.down()
        page.wait_for_function(f'Number(document.querySelector(".fps-ammo").textContent) <= {before-2}')
        page.mouse.up()
        page.mouse.click(x,y,button='right');page.wait_for_function('document.querySelector(".fps-aim").getAttribute("aria-pressed")==="true"')
        page.mouse.click(x,y,button='right');page.wait_for_function('document.querySelector(".fps-aim").getAttribute("aria-pressed")==="false"')
        assert page.evaluate('''()=>{const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});document.querySelector('.fps-canvas').dispatchEvent(e);return e.defaultPrevented;}''')
        assert page.evaluate('document.querySelector(".fps-viewport").contains(document.querySelector(".fps-toolbar"))')
        page.keyboard.press('Escape')
        if fallback:page.screenshot(path='/tmp/fps-rework-desktop.png',full_page=True)
        assert not errors,errors
        print('PASS real mouse/RAF: '+('fallback' if fallback else 'pointer-lock available'),flush=True)
        context.close()
    browser.close()
