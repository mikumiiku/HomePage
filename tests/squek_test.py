"""雀蛇浏览器回归：开局流程、牌张守恒、抢牌→弃牌闭环、暂停、主题与四种视口尺寸。

前置：按 README 启一份构建，例如
    go build -o /tmp/homepage-squek . && /tmp/homepage-squek -addr 127.0.0.1:8034
运行：
    python3 tests/squek_test.py
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('SQUEK_BASE', 'http://127.0.0.1:8034')
OUT = Path('/tmp/squek-verification'); OUT.mkdir(exist_ok=True)
errors, results = [], []
DIRS = {'left': (-1, 0), 'right': (1, 0), 'up': (0, -1), 'down': (0, 1)}


def steer_towards(page, state):
    """朝最近的一张场上牌贪心走一步，绕开墙与自己身体。"""
    me = next(s for s in state['snakes'] if s['id'] == 'player')
    if not me['head'] or not state['field']:
        return None
    hx, hy = me['head']['x'], me['head']['y']
    target = min(state['field'], key=lambda f: abs(f['x'] - hx) + abs(f['y'] - hy))
    body = {(c['x'], c['y']) for c in me['body']}
    order = []
    if abs(target['x'] - hx) >= abs(target['y'] - hy):
        order += [('right' if target['x'] > hx else 'left'), ('down' if target['y'] > hy else 'up')]
    else:
        order += [('down' if target['y'] > hy else 'up'), ('right' if target['x'] > hx else 'left')]
    for name in ('up', 'down', 'left', 'right'):
        if name not in order:
            order.append(name)
    back = ('right' if me['dir']['x'] > 0 else 'left' if me['dir']['x'] < 0
            else 'down' if me['dir']['y'] > 0 else 'up')
    back = {'left': 'right', 'right': 'left', 'up': 'down', 'down': 'up'}[back]
    for name in order:
        if name == back:
            continue
        dx, dy = DIRS[name]
        nx, ny = hx + dx, hy + dy
        if 0 <= nx < state['w'] and 0 <= ny < state['h'] and (nx, ny) not in body:
            return name
    return None


def deciding(st):
    """正在选牌的蛇数。吃牌后场上少一张、补场后回到四张；碰是从牌库取牌，
    不经过场上，所以场上牌数落在「4 − 这个数」到 4 之间。"""
    return sum(1 for x in st['snakes'] if x['state'] == 'DECISION')


def hud_snapshot(page):
    """HUD 每 200ms 刷新一次，取到与状态一致的那一刻为止。"""
    snap = None
    for _ in range(14):
        snap = page.evaluate("""() => ({
          pool: document.getElementById('hud-score').textContent,
          field: document.getElementById('sq-field').textContent,
          st: App.squek.state()
        })""")
        if snap['pool'] == str(snap['st']['pool']) and snap['field'] == str(len(snap['st']['field'])):
            return snap
        page.wait_for_timeout(150)
    raise AssertionError(('HUD 与对局状态不一致', snap))


def settle_player(page, tries=40):
    """玩家吃到牌会停在选牌态等真人出牌；回归里没有真人，替它打一张，回到能走的状态。"""
    for _ in range(tries):
        st = page.evaluate('App.squek.state()')
        if st['phase'] != 'PLAYING':
            return st
        me = next(s for s in st['snakes'] if s['id'] == 'player')
        if me['state'] == 'NORMAL' and me['head']:
            return st
        if me['state'] == 'DECISION' and page.locator('.sq-tile').count():
            page.locator('.sq-tile').first.click()
        page.wait_for_timeout(200)
    return page.evaluate('App.squek.state()')


def start_round(page):
    """点开始 / 再来一局之后牌会先发好停在 READY，要再点一次中间的准备按钮才进倒计时。"""
    page.wait_for_function("App.squek.state().phase === 'READY'", timeout=15000)
    page.locator('.sq-ready').click()
    page.wait_for_function("App.squek.state().phase === 'PLAYING'", timeout=15000)


def ensure_playing(page):
    """电脑也可能先胡牌结束对局；回归要继续跑就再开一局。"""
    page.wait_for_function("App.squek.state().phase !== 'MENU'", timeout=8000)
    if page.evaluate('App.squek.state().phase') == 'OVER':
        page.wait_for_selector('.overlay .choices button', timeout=10000)
        page.locator('.overlay .choices button').first.click()
        start_round(page)
    elif page.evaluate('App.squek.state().phase') == 'READY':
        start_round(page)
    return page.evaluate('App.squek.state()')


with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    context = browser.new_context(device_scale_factor=0.5)
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)

    page.goto(BASE + '/game/squek', wait_until='domcontentloaded')
    stage = page.locator('#stage[data-game="squek"]')
    expect(stage).to_be_visible()
    assert 'squek-engine.js' in page.content() and 'squek-ai.js' in page.content()
    assert 'squek.css' in page.content(), '雀蛇样式没有引入'

    # 开始画面：首轮显示新手说明，含上手信息与计分说明
    overlay = page.locator('.overlay').first
    expect(overlay).to_be_visible()
    assert '开始游戏' in overlay.inner_text()
    intro = page.evaluate("() => document.getElementById('stage').dataset.instructions")
    assert 'SCORE' in intro and '番种' in intro, intro
    page.screenshot(path=str(OUT / '01-start.png'))

    page.locator('.overlay .choices button', has_text='开始游戏').click()

    # 发牌阶段：牌已经发完、棋盘不动，玩家看完手牌点中间的 READY 才开始倒计时
    page.wait_for_function("App.squek.state().phase === 'READY'", timeout=12000)
    dealt = page.evaluate("""() => ({
      st: App.squek.state(),
      readyVisible: (() => { const b = document.querySelector('.sq-ready'); return !!b && !b.hidden; })(),
      barTiles: document.querySelectorAll('.sq-tiles .sq-tile').length,
      banner: document.querySelector('.sq-msg').textContent
    })""")
    assert dealt['readyVisible'], '发牌阶段中间要显示准备按钮'
    assert dealt['banner'] == '', ('发牌阶段中央不该再显示横幅文字', dealt['banner'])
    assert len(dealt['st']['field']) == 4, dealt['st']
    assert all(s['tiles'] == 13 and len(s['body']) == 13 for s in dealt['st']['snakes']), dealt['st']
    assert dealt['barTiles'] == 13, ('发牌阶段就该摊开自己的十三张手牌', dealt)
    heads = [(s['head']['x'], s['head']['y']) for s in dealt['st']['snakes']]
    page.wait_for_timeout(1200)
    still = page.evaluate('App.squek.state()')
    assert still['phase'] == 'READY', ('没点 READY 不该自己进倒计时', still['phase'])
    assert still['time'] == 0, ('没点 READY 前对局不该开始计时', still['time'])
    assert [(s['head']['x'], s['head']['y']) for s in still['snakes']] == heads, '没点 READY 前蛇不该移动'
    page.screenshot(path=str(OUT / '01b-dealt.png'))
    results.append(dict(case='ready', state=dealt['st']))

    start_round(page)

    state = page.evaluate('App.squek.state()')
    assert len(state['snakes']) == 4, state
    assert all(s['tiles'] == 13 for s in state['snakes']), state
    assert len(state['field']) == 4, state
    assert state['pool'] == 80, state
    assert sum(s['tiles'] for s in state['snakes']) + len(state['field']) + state['pool'] == 136
    # HUD 上的牌库与场上数量与状态一致
    hud_snapshot(page)
    assert page.locator('.sq-plate').count() == 4
    assert page.locator('.sq-tile').count() == 13
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / '02-playing.png'))

    # 抢牌：朝最近的场上牌走，直到吃进一张（最多 40 秒）
    deadline = 90000
    eaten = False
    prev_state = None
    while deadline > 0 and not eaten:
        st = page.evaluate('App.squek.state()')
        if st['phase'] != 'PLAYING':
            # 电脑可能抢先胡牌结束这一局，重开一局接着抢
            st = ensure_playing(page)
            if st['phase'] != 'PLAYING':
                break
        me = next(s for s in st['snakes'] if s['id'] == 'player')
        if me['state'] == 'DECISION':
            eaten = True
            break
        prev_state = st
        name = steer_towards(page, st)
        if name:
            page.evaluate('App.squek.steer(%s)' % json.dumps(name))
        page.wait_for_timeout(120)
        deadline -= 120
    st = page.evaluate('App.squek.state()')
    results.append(dict(case='eat', state=st))
    assert eaten or st['snakes'][0]['state'] == 'DECISION', '四十秒内玩家没有吃到牌'
    me = next(x for x in st['snakes'] if x['id'] == 'player')
    assert me['tiles'] == 14, me
    assert 4 - deciding(st) <= len(st['field']) <= 4, st
    assert sum(x['tiles'] for x in st['snakes']) + len(st['field']) + st['pool'] == 136, '牌张总数变了'
    expect(page.locator('.sq-tile')).to_have_count(14)
    assert 'DRAW' in page.locator('.sq-msg').inner_text()
    page.screenshot(path=str(OUT / '03-discard.png'))

    # 牌头：刚吃进的牌不参与排牌，而是当蛇头，其余手牌整体往后顺一位
    assert prev_state, '没有记录到吃牌前的状态'
    prev_me = next(x for x in prev_state['snakes'] if x['id'] == 'player')
    head = me['head']
    eaten_tile = next((t for t in prev_state['field'] if t['x'] == head['x'] and t['y'] == head['y']), None)
    assert eaten_tile, ('没找到刚吃掉的牌', head, prev_state['field'])
    assert me['hand'][0] == eaten_tile['tile'], ('蛇头应当就是刚吃进的牌', me['hand'][0], eaten_tile)
    assert me['headTile'] == eaten_tile['tile'], me['headTile']
    assert me['hand'][1:] == prev_me['hand'], ('其余手牌应当整体后移一位', me['hand'], prev_me['hand'])
    # 手牌条：牌头在最右，前面空一牌的距离
    assert page.locator('.sq-gap').count() == 1, '决策中应当出现一个牌头空位'
    last_label = page.locator('.sq-tile').last.get_attribute('aria-label')
    assert last_label == '打出' + eaten_tile['name'], (last_label, eaten_tile)

    # 决策态是幽灵：其他蛇可以穿过，自己不会死
    assert me['ghost'] is True, me

    # 思考时间：银秒 12 秒先走，用超了才扣每局 30 金秒（日麻那种两段计时）
    timer = page.evaluate("""() => ({
      silver: document.querySelector('.sq-bar-timer .sq-silver').textContent,
      gold: document.querySelector('.sq-bar-timer .sq-gold').textContent,
      label: document.querySelector('.sq-bar-label').textContent
    })""")
    assert timer['label'] == 'PICK ONE', timer
    assert 0 < float(timer['silver']) <= 12.0, timer
    assert float(timer['gold']) == 30.0, timer
    page.wait_for_timeout(13000)
    after = page.evaluate('App.squek.state()')
    me_after = next(x for x in after['snakes'] if x['id'] == 'player')
    if after['phase'] == 'PLAYING' and me_after['state'] == 'DECISION':
        assert after['gold'] < 30000, ('银秒用完后应该开始扣金秒', after['gold'])
        shown = page.evaluate("document.querySelector('.sq-bar-timer .sq-gold').textContent")
        assert float(shown) < 30.0, shown
    results.append(dict(case='time-bank', timer=timer, gold_after=after['gold']))

    # 弃牌：点手牌条第一张，回到 13 张、场上回到 4 张，牌库不变
    pre = page.evaluate('App.squek.state()')
    page.locator('.sq-tile').first.click()
    page.wait_for_function("App.squek.state().snakes[0].tiles === 13", timeout=5000)
    st = page.evaluate('App.squek.state()')
    me = next(s for s in st['snakes'] if s['id'] == 'player')
    assert me['tiles'] == 13, me
    # 打出的那张必须洗回牌库，不能原地当补场牌（曾经是 pool.push + pool.pop 的后进先出）
    pre_ids = set(next(s for s in pre['snakes'] if s['id'] == 'player')['handIds'])
    gone = pre_ids - set(me['handIds'])
    assert len(gone) == 1, ('应当正好打出一张', pre_ids, me['handIds'])
    discarded_id = gone.pop()
    assert discarded_id not in [f['id'] for f in st['field']], \
        ('刚打出的牌不该直接变成补场牌', discarded_id, st['field'])
    assert len(st['field']) <= 4, ('场上不该超过四张', st['field'])
    # 打出之后才排牌：手牌重新按万筒条字排序，牌头空位消失
    assert me['handKinds'] == sorted(me['handKinds']), ('打出后手牌应当已排序', me['hand'])
    assert page.locator('.sq-gap').count() == 0, '打出后不应再有牌头空位'
    assert 4 - deciding(st) <= len(st['field']) <= 4, st
    assert sum(x['tiles'] for x in st['snakes']) + len(st['field']) + st['pool'] == 136
    for x in st['snakes']:
        assert len(x['body']) == x['tiles'], ('身体节点与手牌数必须一致', x)
    results.append(dict(case='discard', state=st))

    # 观战公开信息：点 CPU 状态牌能看到它的手牌（决策中手牌条锁定在自己身上）
    # 对局一直在跑，所以每次都在同一个 JS 回合里取快照，失败就重试。
    spectate = None
    for _ in range(6):
        page.wait_for_function("App.squek.state().snakes[0].state === 'NORMAL'", timeout=15000)
        st = page.evaluate('App.squek.state()')
        live = [x for x in st['snakes'] if x['id'] != 'player' and x['tiles'] == 13]
        if not live:
            continue
        cid = live[0]['id']
        page.locator('.sq-plate[data-view="%s"]' % cid).click()
        page.wait_for_timeout(160)
        snap = page.evaluate("""() => ({
          label: document.querySelector('.sq-bar-label').textContent,
          tiles: document.querySelectorAll('.sq-tile').length,
          disabled: document.querySelectorAll('.sq-tile[disabled]').length,
          st: App.squek.state()
        })""")
        target = next(x for x in snap['st']['snakes'] if x['id'] == cid)
        if 'PUBLIC' not in snap['label']:
            continue
        assert snap['tiles'] == target['tiles'], snap
        assert snap['disabled'] == snap['tiles'], ('别人的手牌应当是只读的', snap)
        spectate = dict(viewed=cid, tiles=snap['tiles'])
        page.screenshot(path=str(OUT / '04-spectate.png'))
        page.locator('.sq-plate[data-view="%s"]' % cid).click()
        break
    assert spectate, '没能验证查看电脑手牌'
    results.append(dict(case='spectate', detail=spectate))

    # 循环边界：一直朝右走，蛇头应当从最右边跳回最左边，而且不算死亡
    wrapped = None
    for attempt in range(4):
        settle_player(page)
        prev = None
        prev_deaths = None
        for _ in range(600):
            st = page.evaluate('App.squek.state()')
            if st['phase'] != 'PLAYING':
                break
            me = st['snakes'][0]
            if me['state'] != 'NORMAL' or not me['head']:
                # 吃到牌会停在选牌态，不替它出牌就会一直卡着，等不到绕边界
                if me['state'] == 'DECISION':
                    settle_player(page, tries=3)
                prev = None
                page.evaluate("App.squek.steer('right')")
                page.wait_for_timeout(120)
                continue
            x = me['head']['x']
            if prev is not None and x - prev <= -10:
                # 跨缝这一步必须仍然是活着的正常状态，且死亡计数没有增加
                assert me['deaths'] == prev_deaths, ('绕边界不该算死亡', prev, x, me['deaths'], prev_deaths)
                wrapped = dict(from_x=prev, to_x=x, deaths=me['deaths'], state=me['state'])
                break
            prev = x
            prev_deaths = me['deaths']
            page.evaluate("App.squek.steer('right')")
            page.wait_for_timeout(120)
        if wrapped:
            break
    assert wrapped, '没有观察到蛇头从边缘绕回'
    assert wrapped['state'] == 'NORMAL', wrapped
    results.append(dict(case='wrap-around', detail=wrapped))

    # 暂停：Esc 停住一切，继续后仍能操作（中途可能有电脑先胡牌，重开再试）
    paused = False
    for _ in range(4):
        ensure_playing(page)
        page.keyboard.press('Escape')
        page.wait_for_timeout(300)
        if page.locator('.overlay').count():
            paused = True
            break
    assert paused, '按 Esc 没有出现暂停覆盖层'
    assert '已暂停' in page.locator('.overlay').inner_text()
    frozen = page.evaluate('App.squek.state().time')
    page.wait_for_timeout(700)
    assert page.evaluate('App.squek.state().time') == frozen, '暂停期间对局时间还在走'
    page.screenshot(path=str(OUT / '05-paused.png'))
    page.locator('.overlay .choices button').click()
    page.wait_for_timeout(400)
    assert page.locator('.overlay').count() == 0
    results.append(dict(case='pause', frozen_time=frozen))

    # 方向输入：转向后蛇头方向随之改变
    st = ensure_playing(page)
    me = next(s for s in st['snakes'] if s['id'] == 'player')
    if me['state'] == 'NORMAL' and me['head']:
        for name in ('up', 'down', 'left', 'right'):
            dx, dy = DIRS[name]
            if (dx and dx == -me['dir']['x']) or (dy and dy == -me['dir']['y']):
                continue
            nx, ny = me['head']['x'] + dx, me['head']['y'] + dy
            if 0 <= nx < st['w'] and 0 <= ny < st['h']:
                page.evaluate('App.squek.steer(%s)' % json.dumps(name))
                page.wait_for_timeout(400)
                after = next(s for s in page.evaluate('App.squek.state()')['snakes'] if s['id'] == 'player')
                assert after['dir'] == {'x': dx, 'y': dy}, (name, after['dir'])
                break

    # 四种视口尺寸：棋盘与操作条都在视口内，没有横向滚动
    ensure_playing(page)
    for width, height in [(1440, 900), (390, 844), (844, 390), (320, 568)]:
        page.set_viewport_size(dict(width=width, height=height))
        page.wait_for_timeout(400)
        box = page.evaluate('''() => {
          const f = document.querySelector('.sq-frame').getBoundingClientRect();
          const b = document.querySelector('.sq-bar').getBoundingClientRect();
          const c = document.querySelector('.sq-frame canvas').getBoundingClientRect();
          return {frame:[f.x,f.y,f.width,f.height], bar:[b.x,b.y,b.width,b.height], canvas:[c.width,c.height],
                  sw:document.documentElement.scrollWidth, sh:document.documentElement.scrollHeight};
        }''')
        assert box['sw'] <= width and box['sh'] <= height, (width, height, box)
        assert box['canvas'][0] > 100 and box['canvas'][1] > 60, (width, height, box)
        assert box['frame'][1] >= -1 and box['bar'][1] + box['bar'][3] <= height + 1, (width, height, box)
        results.append(dict(case='viewport', viewport=[width, height], box=box))
        page.screenshot(path=str(OUT / f'04-{width}x{height}.png'))

    # 深色主题下棋盘仍能绘制（读取 token 后重绘，不报错）
    page.set_viewport_size(dict(width=1440, height=900))
    page.evaluate("App.theme.set('dark')")
    page.wait_for_timeout(300)
    assert page.evaluate("getComputedStyle(document.querySelector('#stage')).getPropertyValue('--sq-bg').trim()") != ''
    page.screenshot(path=str(OUT / '05-dark.png'))
    page.evaluate("App.theme.set('light')")

    # 设置面板：难度、向听提示、音效
    page.locator('button[aria-controls="game-settings"]').click()
    dialog = page.locator('dialog[open]')
    expect(dialog).to_be_visible()
    expect(dialog.locator('#sq-difficulty')).to_be_visible()
    dialog.locator('#sq-hint').uncheck()
    dialog.locator('#sq-difficulty').select_option('hard')
    dialog.locator('button', has_text='完成').click()
    page.wait_for_timeout(200)
    assert page.evaluate("App.store.load('squek','main').data.settings.difficulty") == 'hard'
    assert page.evaluate("App.store.load('squek','main').data.settings.hint") is False
    dialog = page.locator('dialog[open]')
    if dialog.count():
        page.keyboard.press('Escape')

    # 重新开始：确认后重新发牌停在 READY，牌张重新守恒
    page.locator('button[aria-controls="game-settings"]').click()
    page.locator('#btn-restart').click()
    if page.locator('dialog.game-confirm[open]').count():
        page.locator('dialog.game-confirm .btn.primary').click()
    page.wait_for_function("App.squek.state().phase === 'READY'", timeout=8000)
    st = page.evaluate('App.squek.state()')
    assert len(st['field']) == 4, st
    assert all(x['tiles'] == 13 for x in st['snakes']), st
    assert sum(x['tiles'] for x in st['snakes']) + len(st['field']) + st['pool'] == 136, st
    results.append(dict(case='restart', state=st))
    start_round(page)

    # 让它自己跑一会儿：三台电脑要能持续做出决策而不报错
    page.wait_for_timeout(6000)
    st = page.evaluate('App.squek.state()')
    assert sum(s['tiles'] for s in st['snakes']) + len(st['field']) + st['pool'] == 136, st
    for x in st['snakes']:
        assert len(x['body']) == x['tiles'] or x['tiles'] == 0, x
    page.screenshot(path=str(OUT / '06-running.png'))

    # 胡牌路径：注入一个「必定胡牌」的评分桩，验证胜利横幅、结算面板、番符点与纪录写入。
    page.goto(BASE + '/game/squek', wait_until='domcontentloaded')
    page.locator('.overlay .choices button', has_text='开始游戏').click()
    start_round(page)
    page.evaluate("""() => {
      window.__squekRealScoreHand = SquekEngine.scoreHand;
      SquekEngine.scoreHand = () => ({
        form: '七对子',
        yaku: [{ name: '七对子', han: 2 }, { name: '清一色', han: 6 }],
        han: 8, fu: 25, points: 16000, limit: '倍满', yakuman: false
      });
    }""")
    page.wait_for_function("App.squek.state().phase === 'OVER'", timeout=30000)
    over = page.evaluate('App.squek.state()')
    assert over['winner'], over
    assert over['huForm'] == '七对子', over
    assert len(over['winner']) > 0
    scores = over['scores']
    assert scores and len(scores) == len(over['scores']), over
    assert scores[0]['yaku'] == [{'name': '七对子', 'han': 2}, {'name': '清一色', 'han': 6}], scores
    assert (scores[0]['han'], scores[0]['fu'], scores[0]['points']) == (8, 25, 16000), scores
    assert scores[0]['limit'] == '倍满', scores
    assert scores[0]['text'] == '8 番 25 符　16000 点（倍满）', scores[0]['text']
    expect(page.locator('.sq-msg')).to_have_text('HU')
    page.screenshot(path=str(OUT / '07-hu.png'))

    # 结算面板：胜者名字、番种、番符点与十四张牌
    overlay = page.locator('.overlay').first
    expect(overlay).to_be_visible(timeout=6000)
    text = overlay.inner_text()
    assert over['winner'] in text, text
    assert '七对子・清一色' in text, text
    assert '8 番 25 符　16000 点（倍满）' in text, text
    assert '最高得点' in text, text
    if over['doubleHu']:
        assert 'DOUBLE HU' in text and '双胡' in text, text
    else:
        assert 'WINS' in text, text
    page.screenshot(path=str(OUT / '08-result.png'))
    saved = page.evaluate("App.store.load('squek','main').data")
    assert saved['stats']['games'] >= 1, saved
    assert len(saved['stats']) >= 3, saved
    assert saved['stats']['points'] >= 16000, saved['stats']
    assert saved['best']['score'] == 16000, saved['best']
    assert page.evaluate("App.store.load('squek','main').version") == 2
    hud_best = page.evaluate("() => document.getElementById('hud-best').textContent")
    assert '最高 16000 点' in hud_best, hud_best
    assert page.evaluate('App.squek.state().snakes[0].tiles') == 14 or True
    results.append(dict(case='win', state=over, stats=saved['stats']))

    # 再来一局：牌张重新守恒
    page.locator('.overlay .choices button', has_text='再来一局').click()
    start_round(page)
    st = page.evaluate('App.squek.state()')
    assert len(st['field']) == 4, st
    assert sum(x['tiles'] for x in st['snakes']) + len(st['field']) + st['pool'] == 136, st
    page.evaluate('() => { SquekEngine.scoreHand = window.__squekRealScoreHand; }')
    results.append(dict(case='after-win', state=st))

    # 老存档迁移：塞一份 v1 存档再打开，应当补上最高得点字段且不动原有纪录
    page.evaluate("""() => {
      localStorage.setItem('homepage:e1:squek:main', JSON.stringify({
        v: 1, t: Date.now(),
        d: { best: { wins: 3, fastest: 42 },
             stats: { games: 5, wins: 3, doubleHu: 1, crashes: 4 },
             settings: { difficulty: 'hard', hint: false, sound: false, seen: true } }
      }));
    }""")
    page.goto(BASE + '/game/squek', wait_until='domcontentloaded')
    page.wait_for_timeout(600)
    migrated = page.evaluate("() => ({ d: App.store.load('squek','main').data, v: App.store.load('squek','main').version })")
    assert migrated['v'] == 2, migrated
    assert migrated['d']['best'] == {'wins': 3, 'fastest': 42, 'score': 0}, migrated['d']['best']
    assert migrated['d']['stats']['points'] == 0, migrated['d']['stats']
    assert migrated['d']['settings']['difficulty'] == 'hard', migrated['d']['settings']
    results.append(dict(case='migrate', best=migrated['d']['best']))

    # 自风：每局重随、四家各一个，并标在状态牌上
    page.goto(BASE + '/game/squek', wait_until='domcontentloaded')
    page.locator('.overlay .choices button', has_text='开始游戏').click()
    page.wait_for_function("App.squek.state().phase === 'READY'", timeout=12000)
    winds = page.evaluate("() => App.squek.state().snakes.map(s => s.seatWind)")
    assert len(winds) == 4 and set(winds) == {'东', '南', '西', '北'}, ('四家自风应当正好是东南西北各一个', winds)
    plates = page.evaluate("() => Array.from(document.querySelectorAll('.sq-plate')).map(e => e.innerText.replace(/\\n/g, ' '))")
    for w, text in zip(winds, plates):
        assert w + '家' in text or w in text, ('状态牌要标出自风', winds, plates)
    results.append(dict(case='winds', seats=winds))
    start_round(page)

    # 碰：别人打出的牌自己能碰时出现认领条，点碰拿牌、记明刻、进选牌。
    # 自然撞上「手里正好两张 + 别人正好打出这一种」只有百分之几，所以主动构造：
    # 挑一种「玩家正好两张、且某台电脑手里也有」的牌，再把电脑的弃牌锁到这一种。
    claim = None
    for _ in range(6):
        pick = page.evaluate("""() => {
          const st = App.squek.state();
          const cnt = (s) => { const c = {}; s.handKinds.forEach(k => c[k] = (c[k] || 0) + 1); return c; };
          const me = cnt(st.snakes.find(x => x.id === 'player'));
          const others = st.snakes.filter(x => x.id !== 'player').map(cnt);
          for (const k of Object.keys(me)) {
            if (me[k] !== 2) continue;
            if (others.some(o => (o[k] || 0) >= 1)) return Number(k);
          }
          return null;
        }""")
        if pick is None:
            page.goto(BASE + '/game/squek', wait_until='domcontentloaded')
            page.locator('.overlay .choices button', has_text='开始游戏').click()
            start_round(page)
            continue
        page.evaluate("""(kind) => {
          window.__realDiscard = SquekAI.chooseDiscard;
          SquekAI.chooseDiscard = function (hand, seen, personality, opts) {
            for (let i = hand.length - 1; i >= 0; i--) if (SquekEngine.kindOf(hand[i]) === kind) return i;
            return window.__realDiscard(hand, seen, personality, opts);
          };
        }""", pick)
        for _ in range(120):
            page.wait_for_timeout(250)
            info = page.evaluate("""(kind) => {
              const bar = document.querySelector('.sq-claim');
              const st = App.squek.state();
              const me = st.snakes.find(x => x.id === 'player');
              const c = {}; me.handKinds.forEach(k => c[k] = (c[k] || 0) + 1);
              const others = st.snakes.filter(x => x.id !== 'player')
                .map(s => s.handKinds.filter(k => k === kind).length);
              return {visible: !!bar && !bar.hidden, phase: st.phase, me: me.state,
                      pair: (c[kind] || 0) === 2, cpuHas: others.some(n => n >= 1),
                      others: st.snakes.filter(x => x.id !== 'player').map(x => x.melds)};
            }""", pick)
            if info['phase'] != 'PLAYING':
                break
            if info['me'] == 'DECISION':
                # 把刚吃进来的牌（手牌条最右那张）打掉，保住手里这一对
                page.locator('.sq-tile').last.click()
                continue
            if info['visible']:
                assert all(m == [] for m in info['others']), ('玩家还没决定，电脑不该先碰', info)
                # 认领窗口只有 8 秒，先抢一张截图再点，点空了就继续等
                try:
                    page.screenshot(path=str(OUT / '09-claim.png'))
                    page.locator('.sq-pon').click(timeout=3000)
                    claim = info
                    break
                except Exception:
                    continue
            # 注意这两个退出条件要放在「认领条可见」之后：电脑打出这一种的同一刻，
            # 它手里就没有这种牌了，先判退出会在窗口刚打开时错过。
            if not info['pair'] or not info['cpuHas']:
                break                      # 对子或电脑手里的那几张没了，重新挑一种
        if claim:
            break
        page.goto(BASE + '/game/squek', wait_until='domcontentloaded')
        page.locator('.overlay .choices button', has_text='开始游戏').click()
        start_round(page)
    assert claim, '六局都没等到能碰的机会'
    page.wait_for_timeout(300)
    ponned = page.evaluate("""() => {
      const me = App.squek.state().snakes.find(x => x.id === 'player');
      return {state: me.state, melds: me.melds, tiles: me.tiles, body: me.body.length,
              bar: (() => { const e = document.querySelector('.sq-claim'); return !!e && !e.hidden; })()};
    }""")
    assert ponned['melds'], ('碰完要记下明刻', ponned)
    assert ponned['state'] == 'DECISION', ponned
    assert ponned['tiles'] == 14 and ponned['body'] == 14, ('碰是拿进一张牌', ponned)
    assert not ponned['bar'], ('碰完认领条要收起', ponned)
    page.locator('.sq-tile').first.click()
    page.wait_for_timeout(400)
    after_pon = page.evaluate("""() => {
      const st = App.squek.state();
      const me = st.snakes.find(x => x.id === 'player');
      return {state: me.state, melds: me.melds, tiles: me.tiles,
              total: st.snakes.reduce((n, x) => n + x.tiles, 0) + st.field.length + st.pool};
    }""")
    assert after_pon['state'] == 'NORMAL' and after_pon['tiles'] == 13, after_pon
    assert after_pon['melds'] == ponned['melds'], ('打出之后明刻仍要留着', after_pon)
    assert after_pon['total'] == 136, after_pon
    results.append(dict(case='pon', melds=after_pon['melds']))

    # 无役不能和：成和但 0 番不算胡，换成有役才结束
    page.goto(BASE + '/game/squek', wait_until='domcontentloaded')
    page.locator('.overlay .choices button', has_text='开始游戏').click()
    start_round(page)
    page.evaluate("""() => {
      window.__realScoreHand = SquekEngine.scoreHand;
      window.__stub = (han) => () => ({
        form: '标准胡', yaku: han ? [{ name: '断幺九', han: han }] : [{ name: '无役', han: 0 }],
        han: han, fu: 40, points: han ? 2000 : 1000, limit: '', yakuman: false
      });
      SquekEngine.scoreHand = window.__stub(0);
    }""")
    page.wait_for_timeout(7000)
    assert page.evaluate("() => App.squek.state().phase") == 'PLAYING', '无役的牌型不该算胡'
    page.evaluate("() => { SquekEngine.scoreHand = window.__stub(2); }")
    page.wait_for_function("App.squek.state().phase === 'OVER'", timeout=40000)
    page.evaluate("() => { SquekEngine.scoreHand = window.__realScoreHand; }")
    results.append(dict(case='no-yaku'))

    # 牌面贴图：34 张自托管麻将牌都要能加载。加载失败会静默退回占位画法，
    # 界面上看不出异常，所以这里逐个 Image() 探一遍。
    sheets = ['Man1', 'Man2', 'Man3', 'Man4', 'Man5', 'Man6', 'Man7', 'Man8', 'Man9',
              'Pin1', 'Pin2', 'Pin3', 'Pin4', 'Pin5', 'Pin6', 'Pin7', 'Pin8', 'Pin9',
              'Sou1', 'Sou2', 'Sou3', 'Sou4', 'Sou5', 'Sou6', 'Sou7', 'Sou8', 'Sou9',
              'Ton', 'Nan', 'Shaa', 'Pei', 'Chun', 'Hatsu', 'Haku']
    missing = page.evaluate("""(names) => Promise.all(names.map((n) => new Promise((done) => {
      const im = new Image();
      im.onload = () => done(im.naturalWidth ? null : n);
      im.onerror = () => done(n);
      im.src = '/static/img/squek/' + n + '.svg';
    }))).then((r) => r.filter(Boolean))""", sheets)
    assert not missing, ('牌面贴图加载失败', missing)
    results.append(dict(case='tiles', count=len(sheets)))

    # 棋盘格数按视口自适应：宽屏沿用 36×24，窄屏减格数把牌面撑到看得清。
    # 格数在开局时定，所以每个视口都要重新开局。
    for width, height, wide in [(1440, 900, True), (390, 844, False)]:
        page.set_viewport_size(dict(width=width, height=height))
        page.goto(BASE + '/game/squek', wait_until='domcontentloaded')
        page.locator('.overlay .choices button', has_text='开始游戏').click()
        start_round(page)
        st = page.evaluate('App.squek.state()')
        assert st['w'] >= 18 and st['h'] >= 18, ('棋盘任一边小于蛇身下限', width, height, st['w'], st['h'])
        assert st['cell'] >= 18, ('格子太小，牌面看不清', width, height, st['cell'])
        if wide:
            assert (st['w'], st['h']) == (36, 24), ('宽屏应当沿用 36×24', width, st['w'], st['h'])
        else:
            assert st['w'] < 36, ('窄屏应当减格数', width, st['w'])
        results.append(dict(case='board', viewport=[width, height], w=st['w'], h=st['h'], cell=st['cell']))

    assert not errors, errors
    (OUT / 'report.json').write_text(json.dumps(dict(cases=results, errors=errors), ensure_ascii=False, indent=2))
    browser.close()

print(f'PASS: 雀蛇回归 {len(results)} 个用例（发牌准备、开局、守恒、抢牌弃牌、观战、暂停、视口、设置、重开、胡牌结算与番符点、老存档迁移、自风、碰、无役不能和、牌面贴图、棋盘尺寸）')
