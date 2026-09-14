#!/usr/bin/env python3
"""沙城突击浏览器回归。仅在测试响应中注入内部控制，不向正式游戏暴露调试接口。
运行：SANDSTRIKE_BASE=http://127.0.0.1:8034 python3 tests/sandstrike_test.py
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get('SANDSTRIKE_BASE', 'http://127.0.0.1:8034')
OUT = Path('/tmp/sandstrike-checks')
OUT.mkdir(exist_ok=True)
SOURCE = (Path(__file__).resolve().parents[1] / 'web/static/js/games/sandstrike.js').read_text()
# Software rendering on CI is slow; mechanics tests step the actual game simulation
# directly and render screenshots on demand. The production file is never modified.
HOOK = '''
    window.fpsTest = {
      snapshot: () => ({ state, health, ammo: bag().ammo, reserve: bag().reserve, active, grenades, crouching: isCrouching(), cooldown: bag().cooldown, thrown: thrown.length, fov: camera.fov, y: player.y, score, round, remaining, kills, headshots, reloadTime, x: player.x, z: player.z, yaw, pitch }),
      held: key => keys.has(key),
      // Freezes the given enemies so AI fire cannot interfere with input-timing checks.
      pin: (...indexes) => indexes.forEach(i => { if (enemies[i]) enemies[i].cooldown = 999; }),
      face: value => { yaw = value; pitch = 0; camera.rotation.set(pitch, yaw, 0); camera.updateMatrixWorld(true); },
      // Clears radio cooldown and suppresses the first-contact bark, so the subtitle
      // assertions below cannot race against AI chatter from the live render loop.
      radioReset: () => { radioLineTime = 0; contacted = true; },
      radio: text => radio(text),
      // Fires real enemy bullets from (x,z) until one connects, then reports the marker
      // state that updateBullets produced. Exercises the whole damage path, not a helper.
      damageFrom: (x, z, attempts) => {
        const e = enemies[0];
        e.group.position.set(x, 0, z); e.group.updateMatrixWorld(true);
        e.aimPoint.set(player.x, player.y - 0.4, player.z);
        for (let i = 0; i < attempts; i++) {
          health = 100; hitDirTime = 0;
          const marker = document.querySelector('.fps-hitdir');
          marker.classList.remove('on');
          enemyBullet(e, false);
          for (let s = 0; s < 12 && bullets.length; s++) updateBullets(0.1);
          bullets.forEach(b => { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); });
          bullets.length = 0;
          if (hitDirTime > 0) return { angle: marker.style.getPropertyValue('--hitdir-angle'), label: marker.getAttribute('aria-label') };
        }
        return null;
      },
      equip, reload, throwGrenade,
      aim: value => { aiming = value; },
      visible: index => visibleToEnemy(enemies[index]),
      explodeAt: (x,y,z) => explode(new T.Vector3(x,y,z)),
      projectile: () => thrown.map(p => ({x:p.mesh.position.x,y:p.mesh.position.y,z:p.mesh.position.z,fuse:p.fuse})),
      crouch: value => { crouchToggle = value; update(0.1); },
      model: () => ({arms: enemies[0].arms.every(arm => arm.every(Boolean)), head: !!enemies[0].head, animations:Object.keys(enemies[0].actions), skinned:enemies[0].body.getObjectByProperty('isSkinnedMesh',true) !== undefined}),
      tick: dt => update(dt),
      fire: shoot,
      position: (x, z) => { player.set(x, 1.65, z); camera.position.copy(player); },
      target: (index, x, z, head) => {
        const e = enemies[index]; e.group.position.set(x, 0, z); e.cooldown = 999;
        e.group.updateMatrixWorld(true);
        const target = head && e.head ? e.head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,0.07,0)) : new T.Vector3(x,1.12,z);
        const dy = target.y - player.y;
        yaw = Math.atan2(-(target.x - player.x), -(target.z - player.z));
        pitch = Math.atan2(dy, Math.hypot(target.x - player.x, target.z - player.z));
        camera.rotation.set(pitch, yaw, 0); camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
      },
      enemy: i => ({ hp: enemies[i].hp, alive: enemies[i].alive, x: enemies[i].group.position.x, z: enemies[i].group.position.z }),
      // Measures the real hit rate of enemy fire at a given range against a still player.
      // Drives enemyBullet/updateBullets directly so the result is independent of AI pacing.
      accuracy: (distance, shots, firstShot) => {
        if (!enemies.length) return 0;
        const e = enemies[0];
        e.group.position.set(player.x, 0, player.z - distance);
        e.group.updateMatrixWorld(true);
        e.aimPoint.set(player.x, player.y - 0.4, player.z);
        let hits = 0;
        for (let i = 0; i < shots; i++) {
          e.magazine = 12; health = 100;
          enemyBullet(e, firstShot);
          for (let s = 0; s < 12 && bullets.length; s++) updateBullets(0.1);
          bullets.forEach(b => { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); });
          bullets.length = 0;
          if (health < 100) hits++;
        }
        return hits / shots;
      },
      blocked, buildFlow, path: (x,z) => flow.get(navKey(x,z)),
      timeOut: () => { remaining = 0.01; update(0.02); },
      lowHealth: () => { health = 1; explode(player.clone()); },
      draw: () => { renderFrame(); drawRadar(); },
    };
'''
INJECTED = SOURCE.replace('    raf = requestAnimationFrame(render);\n  }', HOOK + '\n  }')
# CI has no GPU and little RAM. This only lowers test rendering cost; physics,
# real skeletal meshes, hit tests and production source remain unchanged.
INJECTED = INJECTED.replace('renderer.shadowMap.enabled = true;', 'renderer.shadowMap.enabled = false;')
INJECTED = INJECTED.replace("renderer.setPixelRatio(Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1 : 1.5));", 'renderer.setPixelRatio(0.65);')

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 850, 'height': 720})
    context.add_init_script("""HTMLCanvasElement.prototype.requestPointerLock = undefined;
      if (!localStorage.getItem('homepage:e1:sandstrike:main')) localStorage.setItem('homepage:e1:sandstrike:main', JSON.stringify({v:1,t:1,d:{best:{score:0},stats:{games:0,wins:0,kills:0,headshots:0},settings:{sound:true,keep:'preserved'}}}));""")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('**/static/js/games/sandstrike.js?*', lambda route: route.fulfill(body=INJECTED, content_type='text/javascript'))
    page.goto(BASE + '/game/sandstrike')
    page.get_by_role('button', name='开始训练').wait_for()
    if os.environ.get('SANDSTRIKE_SCREENSHOTS'): page.screenshot(path=str(OUT / 'desktop-menu.png'))
    page.get_by_role('button', name='开始训练').click()
    page.wait_for_function('window.fpsTest && fpsTest.snapshot().state === "playing"')
    assert page.locator('.fps-objective').inner_text() == '剩余敌人 4 · 0 分'
    assert page.evaluate('fpsTest.model()') == {'arms':True,'head':True,'animations':['Idle','Walk'],'skinned':True}
    page.locator('.fps-canvas').focus()
    page.keyboard.down('KeyW')
    page.evaluate('fpsTest.tick(0.2)')
    page.keyboard.up('KeyW')
    assert page.evaluate('fpsTest.snapshot().z') < 14
    # Solid collision and a reachable route around the cover.
    assert page.evaluate('fpsTest.blocked(-8,8)') is True
    page.evaluate('fpsTest.buildFlow()')
    assert page.evaluate('fpsTest.path(-12,-4)') is not None
    page.evaluate('fpsTest.position(0,14); fpsTest.target(0,0,8,false); fpsTest.fire()')
    assert page.evaluate('fpsTest.enemy(0).hp') == 66
    for _ in range(2):
        page.evaluate('fpsTest.tick(0.14); fpsTest.target(0,0,8,false); fpsTest.fire()')
    assert page.evaluate('fpsTest.snapshot().kills') == 1
    assert page.evaluate('fpsTest.snapshot().score') == 100
    page.locator('.fps-canvas').focus(); page.keyboard.press('r')
    page.evaluate('fpsTest.tick(1.7)')
    assert page.evaluate('fpsTest.snapshot().ammo') == 30
    assert page.evaluate('fpsTest.snapshot().reserve') == 87
    # Player shots cannot pass through a crate.
    page.evaluate('fpsTest.position(-8,14); fpsTest.target(1,-8,5,true); fpsTest.fire()')
    assert page.evaluate('fpsTest.enemy(1).hp') == 100
    # Enemy shots are also blocked; move into sight to verify damage.
    page.evaluate('fpsTest.target(1,-8,5,true)')
    page.evaluate('fpsTest.draw()')
    if os.environ.get('SANDSTRIKE_SCREENSHOTS'): page.screenshot(path=str(OUT / 'desktop-play.png'))
    page.locator('.fps-pause').click()
    before = page.evaluate('fpsTest.snapshot()')
    page.wait_for_timeout(100)
    assert page.evaluate('fpsTest.snapshot()') == before
    assert before['state'] == 'paused'
    page.get_by_role('button', name='继续游戏').click()
    # All three rounds, headshots, replenishment and exactly one final save.
    page.evaluate('fpsTest.position(0,14)')
    for wave, start_index in [(1, 1), (2, 0), (3, 0)]:
        for index in range(start_index, wave + 3):
            page.evaluate(f'fpsTest.tick(0.14); fpsTest.target({index},0,8,true); fpsTest.fire()')
            assert page.evaluate(f'fpsTest.enemy({index}).alive') is False
        if wave < 3:
            page.evaluate('fpsTest.tick(2.6)')
            assert page.evaluate('fpsTest.snapshot().round') == wave + 1
            assert page.evaluate('fpsTest.snapshot().ammo') == 30
    assert page.evaluate('fpsTest.snapshot().state') == 'ended'
    saved = page.evaluate('JSON.parse(localStorage.getItem("homepage:e1:sandstrike:main")).d')
    assert saved['stats'] == {'games': 1, 'wins': 1, 'kills': 15, 'headshots': 14}, saved
    assert saved['best']['score'] > 0
    page.locator('.fps-sound').click()
    assert page.evaluate('JSON.parse(localStorage.getItem("homepage:e1:sandstrike:main")).d.settings.sound') is False
    page.get_by_role('button', name='再玩一局').click()
    page.evaluate('fpsTest.timeOut()')
    assert page.evaluate('fpsTest.snapshot().state') == 'ended'
    assert page.evaluate('JSON.parse(localStorage.getItem("homepage:e1:sandstrike:main")).d.stats.games') == 2
    page.get_by_role('button', name='再玩一局').click()
    page.evaluate('fpsTest.position(0,14); fpsTest.target(0,0,8,false); fpsTest.lowHealth()')
    assert page.evaluate('fpsTest.snapshot().state') == 'ended'
    page.locator('#theme-toggle').click()
    if os.environ.get('SANDSTRIKE_SCREENSHOTS'): page.screenshot(path=str(OUT / 'desktop-dark.png'))
    page.reload()
    page.get_by_role('button', name='开始训练').wait_for()
    assert page.locator('.fps-sound').inner_text() == '开启音效'
    assert int(page.locator('#hud-best').inner_text()) == saved['best']['score']
    # Crouching changes height and movement speed; low cover blocks only the low stance.
    page.get_by_role('button', name='开始训练').click()
    page.evaluate('fpsTest.position(5,9); fpsTest.target(0,5,3,false)')
    assert page.evaluate('fpsTest.visible(0)') is True
    page.locator('.fps-canvas').focus(); page.keyboard.press('c'); page.evaluate('fpsTest.tick(0.1)')
    assert page.evaluate('fpsTest.snapshot().crouching') is True
    assert page.evaluate('fpsTest.snapshot().y') < 1.1
    assert page.evaluate('fpsTest.visible(0)') is False
    page.keyboard.down('w'); page.evaluate('fpsTest.tick(0.2)'); page.keyboard.up('w')
    assert 8.6 < page.evaluate('fpsTest.snapshot().z') < 8.8
    page.keyboard.press('c'); page.evaluate('fpsTest.tick(0.1)')
    assert page.evaluate('fpsTest.snapshot().y') > 1.6
    # Choose the primary in pause; scoped bolt-action shot, and holstering keeps its cycle.
    page.locator('.fps-pause').click(); page.locator('.fps-primary').select_option('sniper')
    assert page.evaluate('JSON.parse(localStorage.getItem("homepage:e1:sandstrike:main")).v') == 2
    assert page.evaluate('JSON.parse(localStorage.getItem("homepage:e1:sandstrike:main")).d.settings.keep') == 'preserved'
    page.get_by_role('button', name='继续游戏').click()
    page.evaluate('fpsTest.position(0,14); fpsTest.target(0,0,8,false); fpsTest.aim(true); fpsTest.tick(0.2)')
    assert page.locator('.fps-scope').is_visible()
    assert page.evaluate('fpsTest.snapshot().fov') == 20
    # Reacquire the faster moving target after the scope transition.
    page.evaluate('fpsTest.target(0,0,8,false); fpsTest.fire()')
    assert page.evaluate('fpsTest.snapshot().ammo') == 4
    assert page.evaluate('fpsTest.enemy(0).alive') is False
    page.evaluate('fpsTest.fire()'); assert page.evaluate('fpsTest.snapshot().ammo') == 4
    page.evaluate("fpsTest.equip('pistol'); fpsTest.tick(0.3); fpsTest.equip('sniper'); fpsTest.tick(0.3); fpsTest.fire()")
    assert page.evaluate('fpsTest.snapshot().ammo') == 4
    page.evaluate("fpsTest.equip('pistol'); fpsTest.tick(0.3); fpsTest.target(1,0,8,false); fpsTest.fire()")
    assert page.evaluate('fpsTest.enemy(1).hp') == 72
    assert page.evaluate('fpsTest.snapshot().ammo') == 11
    page.evaluate("fpsTest.equip('sniper'); fpsTest.tick(0.3)")
    assert page.evaluate('fpsTest.snapshot().ammo') == 4
    # Knife is short-range and consumes no rounds.
    page.evaluate("fpsTest.equip('knife'); fpsTest.tick(0.3); fpsTest.target(2,0,8,false); fpsTest.fire()")
    assert page.evaluate('fpsTest.enemy(2).hp') == 100
    page.evaluate('fpsTest.tick(0.6); fpsTest.target(2,0,12.4,false); fpsTest.fire()')
    assert page.evaluate('fpsTest.enemy(2).hp') == 35
    assert page.evaluate('fpsTest.snapshot().ammo') == 0
    # Shotgun pellet damage and per-shell reload can be interrupted without free ammo.
    page.locator('.fps-pause').click(); page.locator('.fps-primary').select_option('shotgun'); page.get_by_role('button',name='继续游戏').click()
    page.evaluate('fpsTest.target(2,14,-14,false); fpsTest.target(3,0,9,false); fpsTest.fire()')
    assert page.evaluate('fpsTest.enemy(3).hp') < 50
    assert page.evaluate('fpsTest.snapshot().ammo') == 7
    page.evaluate('fpsTest.tick(0.9); fpsTest.target(1,10,14,false); fpsTest.fire(); fpsTest.reload(); fpsTest.tick(0.61)')
    assert page.evaluate('fpsTest.snapshot().ammo') == 7
    assert page.evaluate('fpsTest.snapshot().reserve') == 31
    page.evaluate("fpsTest.equip('pistol'); fpsTest.tick(0.3); fpsTest.equip('shotgun'); fpsTest.tick(0.3)")
    assert page.evaluate('fpsTest.snapshot().ammo') == 7
    # Grenade blast obeys walls; direct exposure deals damage; self-damage is enabled.
    hp = page.evaluate('fpsTest.enemy(1).hp')
    page.evaluate('fpsTest.position(0,14); fpsTest.target(1,-8,5,false); fpsTest.explodeAt(-8,0.2,10)')
    assert page.evaluate('fpsTest.enemy(1).hp') == hp
    page.evaluate('fpsTest.explodeAt(-8,0.2,4.2)')
    assert page.evaluate('fpsTest.enemy(1).alive') is False
    page.evaluate('fpsTest.explodeAt(0,1,13)')
    assert page.evaluate('fpsTest.snapshot().health') < 100
    # A thrown grenade has a moving physical body and cannot be duplicated during cooldown.
    page.evaluate('fpsTest.throwGrenade(); fpsTest.throwGrenade()')
    assert page.evaluate('fpsTest.snapshot().grenades') == 1
    assert page.evaluate('fpsTest.snapshot().thrown') == 1
    initial = page.evaluate('fpsTest.projectile()[0]')
    page.evaluate('fpsTest.tick(0.2)')
    assert page.evaluate('fpsTest.projectile()[0].z') != initial['z']
    page.locator('.fps-pause').click(); frozen = page.evaluate('fpsTest.projectile()'); page.evaluate('fpsTest.tick(1)')
    assert page.evaluate('fpsTest.projectile()') == frozen
    page.get_by_role('button',name='继续游戏').click()
    page.evaluate('for(let i=0;i<40;i++) fpsTest.tick(0.05)')
    assert page.evaluate('fpsTest.snapshot().thrown') == 0
    # Re-selecting the weapon already in hand must not interrupt a reload.
    page.evaluate("fpsTest.equip('pistol'); fpsTest.tick(0.3); fpsTest.equip('shotgun'); fpsTest.tick(0.3)")
    assert page.evaluate('fpsTest.snapshot().ammo') == 7
    page.locator('.fps-canvas').focus()
    page.keyboard.press('r'); page.keyboard.press('Digit1')
    page.evaluate('fpsTest.tick(0.62)')
    assert page.evaluate('fpsTest.snapshot().ammo') == 8, page.evaluate('fpsTest.snapshot()')
    # Without pointer lock the mouse doubles as the look control:
    # a look-drag must not spend a round, a still click must fire exactly one.
    page.evaluate('fpsTest.position(0,14); fpsTest.pin(0,1,2,3); fpsTest.tick(0.1)')
    box = page.locator('.fps-canvas').bounding_box()
    cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    page.mouse.move(cx, cy); page.mouse.down()
    for step in range(10, 130, 10): page.mouse.move(cx + step, cy)
    page.mouse.up(); page.evaluate('fpsTest.tick(0.6)')
    assert page.evaluate('fpsTest.snapshot().ammo') == 8, '拖视不应消耗弹药'
    page.mouse.move(cx, cy); page.mouse.down(); page.mouse.up(); page.evaluate('fpsTest.tick(0.6)')
    assert page.evaluate('fpsTest.snapshot().ammo') == 7, '单击应当射击一次'
    # Enemy fire is range-dependent: close shots mostly land, long shots mostly miss,
    # and the opening round of a burst is deliberately looser than the rest.
    near, mid, far = (page.evaluate(f'fpsTest.accuracy({d}, 400)') for d in (5, 10, 25))
    assert near > mid > far, (near, mid, far)
    assert 0.52 <= near <= 0.85, near
    assert 0.35 <= mid <= 0.70, mid
    assert 0.13 <= far <= 0.42, far
    opening, follow = (page.evaluate(f'fpsTest.accuracy(15, 400, {b})') for b in ('true', 'false'))
    assert opening < follow - 0.12, (opening, follow)
    # Combat cues stay transient: with nothing happening, neither marker is on screen.
    assert not page.locator('.fps-radio').is_visible()
    assert not page.locator('.fps-hitdir').is_visible()
    # The damage marker places the threat on the ring by bearing, not by colour alone.
    page.evaluate('fpsTest.position(0,14); fpsTest.pin(0,1,2,3); fpsTest.face(0)')  # yaw 0 面向 -z，正右为 +x
    for x, z, expect, word in [(0, 4, 0, '正前方'), (10, 14, 90, '右侧'), (0, 24, 180, '正后方'), (-10, 14, 270, '左侧')]:
        got = page.evaluate(f'fpsTest.damageFrom({x}, {z}, 60)')
        assert got is not None, (x, z, '未命中')
        angle = float(got['angle'].rstrip('deg'))
        assert abs(angle - expect) < 4, (x, z, got)
        assert got['label'] == '受击方向：' + word, got
    assert page.locator('.fps-hitdir').evaluate('el => el.classList.contains("on")')
    page.evaluate('fpsTest.tick(1.4)')
    assert not page.locator('.fps-hitdir').evaluate('el => el.classList.contains("on")')
    # Radio lines are rate limited and clear themselves; they are the text alternative
    # for the positional audio that carries the same information. Asserted while paused:
    # the live AI loop would otherwise be free to emit its own chatter into this channel.
    page.locator('.fps-pause').click()
    page.evaluate('fpsTest.radioReset(); fpsTest.radio("测试通话")')
    radio = page.locator('.fps-radio')
    assert radio.evaluate('el => el.classList.contains("on")'), '字幕未激活'
    assert radio.evaluate('el => el.textContent') == '无线电：测试通话', radio.evaluate('el => el.outerHTML')
    page.wait_for_timeout(250)   # 等淡入结束再判可见性，不看过渡中间态
    assert radio.is_visible()
    page.evaluate('fpsTest.radio("被限流")')
    assert radio.evaluate('el => el.textContent') == '无线电：测试通话', '冷却期内不应覆盖'
    page.get_by_role('button', name='继续游戏').click()
    page.evaluate('fpsTest.tick(2.4)')
    assert not page.locator('.fps-radio').evaluate('el => el.classList.contains("on")'), '字幕状态应结束'
    page.wait_for_timeout(300)   # visibility 的离散过渡在 0.2s 后才生效
    assert not page.locator('.fps-radio').is_visible(), '字幕应自行消失'
    print('Enemy fire accuracy near/mid/far %.2f/%.2f/%.2f, opening shot %.2f vs %.2f PASS' % (near, mid, far, opening, follow), flush=True)
    print('Desktop: character, migration, crouch/cover, six weapons, bolt cycle, shells and grenades PASS', flush=True)
    print('Desktop mechanics, wins/losses and persistence: PASS', flush=True)
    page.goto(BASE + '/games/')
    assert page.locator('a[href="/game/sandstrike"]').count() >= 1
    context.close()
    # Mobile multitouch bindings and narrow layout.
    mobile = browser.new_context(viewport={'width':390, 'height':844}, is_mobile=True, has_touch=True)
    mp = mobile.new_page()
    mp.on('pageerror', lambda e: errors.append(str(e)))
    mp.route('**/static/js/games/sandstrike.js?*', lambda route: route.fulfill(body=INJECTED, content_type='text/javascript'))
    mp.goto(BASE + '/game/sandstrike')
    mp.get_by_role('button', name='开始训练').wait_for()
    mp.wait_for_load_state('networkidle')
    assert mp.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    mp.get_by_role('button', name='开始训练').tap()
    mp.wait_for_function('fpsTest.snapshot().state === "playing"')
    mp.wait_for_timeout(200)
    cdp = mobile.new_cdp_session(mp)
    button = mp.locator('[data-move="KeyW"]')
    button.scroll_into_view_if_needed()
    bounds = button.bounding_box()
    cdp.send('Input.dispatchTouchEvent', {'type':'touchStart', 'touchPoints':[{'x':bounds['x']+24,'y':bounds['y']+24}]})
    mp.wait_for_function('fpsTest.held("KeyW")')
    mp.evaluate('fpsTest.tick(0.2)')
    cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd', 'touchPoints':[]})
    assert mp.evaluate('fpsTest.snapshot().z') < 14, mp.evaluate('fpsTest.snapshot()')
    mp.locator('.fps-crouch').tap(); mp.evaluate('fpsTest.tick(0.1)')
    assert mp.evaluate('fpsTest.snapshot().crouching')
    mp.locator('[data-weapon="pistol"]').tap(); mp.evaluate('fpsTest.tick(0.3)')
    assert mp.evaluate('fpsTest.snapshot().active') == 'pistol'
    mp.locator('.fps-fire').tap()
    assert mp.evaluate('fpsTest.snapshot().ammo') == 11
    mp.locator('.fps-throw').tap(); assert mp.evaluate('fpsTest.snapshot().grenades') == 1
    mp.evaluate('fpsTest.draw()')
    if os.environ.get('SANDSTRIKE_SCREENSHOTS'): mp.screenshot(path=str(OUT / 'mobile-play.png'), full_page=True)
    mp.locator('.fps-pause').tap()
    assert mp.locator('.overlay-title').inner_text() == '游戏已暂停'
    print('Mobile movement, shooting and pause: PASS', flush=True)
    mp.set_viewport_size({'width':844,'height':390})
    if os.environ.get('SANDSTRIKE_SCREENSHOTS'): mp.screenshot(path=str(OUT / 'mobile-landscape.png'), full_page=True)
    assert mp.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert not errors, errors
    mobile.close(); browser.close()
    # No-WebGL must show a usable recovery action.
    bad = p.chromium.launch(args=['--no-sandbox', '--disable-webgl'])
    bp = bad.new_page()
    bp.goto(BASE + '/game/sandstrike')
    bp.get_by_role('button', name='重新加载', exact=True).wait_for()
    assert bp.locator('.overlay-title').inner_text() == '无法打开 3D 场景'
    bad.close()
    print(json.dumps({'result':'PASS', 'checks':['skinned soldier/arm rig','v1 migration','crouch cover','six weapons','scope/bolt cooldown','shotgun pellets/shell reload','grenade bounce/blast/self damage','movement','collision','navigation','body/head hits','wall occlusion','reload','pause/resume','three rounds','win/loss','save/reload','sound','theme','mobile controls/layout','WebGL fallback','enemy accuracy curve','damage direction','transient radio subtitle'], 'errors':errors, 'screenshots':str(OUT)}, ensure_ascii=False))
